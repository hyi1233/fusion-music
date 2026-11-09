// tests/devNativeProxy.test.ts — /native/<plat> 代理的路由与请求头规则
//
// 关键点（都是浏览器直连时踩过的坑）：
//   - 酷我 / QQ / 酷狗都不能带 Origin 头，否则被拒（illegal / 400 / Access Deny）
//   - 酷狗 mobilecdn 的 https 证书与域名不匹配，只能 http
//   - 酷我 www 取链必须走 www.kuwo.cn，不能复用 antiserver 主机
//   - QQ musicu.fcg 是 POST，body 通过 __body=base64 查询参数透传

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleNativeProxy } from '../dev/nativeProxy.mjs';

const okResponse = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

describe('/native 代理', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse('{"url":"https://cdn.example/a.mp3"}')));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('酷我 antiserver 路径转发到 antiserver.kuwo.cn，且不发 Origin', async () => {
    const res = await handleNativeProxy(
      '/native/kuwo/anti/s?type=convert_url3&rid=MUSIC_1&format=mp3&br=128kmp3',
    );
    expect(res.status).toBe(200);
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe(
      'https://antiserver.kuwo.cn/anti/s?type=convert_url3&rid=MUSIC_1&format=mp3&br=128kmp3',
    );
    expect(init.headers.Referer).toBe('https://www.kuwo.cn/');
    expect(init.headers.Origin).toBeUndefined();
  });

  it('酷我 www 取链路径转发到 www.kuwo.cn（不是 antiserver）', async () => {
    await handleNativeProxy('/native/kuwoWww/api/www/play/url?rid=MUSIC_1&br=128kmp3&format=mp3');
    const [url] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('https://www.kuwo.cn/api/www/play/url');
  });

  it('酷狗走 http（证书域名不匹配）', async () => {
    await handleNativeProxy('/native/kugou/api/v3/song/url?hash=abc&timelength=210000');
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('http://mobilecdn.kugou.com/api/v3/song/url');
    expect(init.headers.Origin).toBeUndefined();
  });

  it('QQ 元信息接口不发 Origin', async () => {
    await handleNativeProxy('/native/qq/v8/fcg-bin/fcg_play_single_song.fcg?songmid=abc&format=json');
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg');
    expect(init.headers.Origin).toBeUndefined();
  });

  it('QQ musicu.fcg：POST + base64 body 还原为 JSON', async () => {
    const payload = { comm: { ct: 11 }, req: {} };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    await handleNativeProxy(`/native/qqMusicu/cgi-bin/musicu.fcg?__method=POST&__body=${b64}`);
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toBe('https://u.y.qq.com/cgi-bin/musicu.fcg');
    expect(init.method).toBe('POST');
    expect(JSON.parse(Buffer.from(init.body).toString('utf8'))).toEqual(payload);
  });

  it('上游异常时返回 502 JSON 而不是抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const res = await handleNativeProxy('/native/kuwo/anti/s?rid=MUSIC_1');
    expect(res.status).toBe(502);
    expect(res.body.toString()).toContain('native proxy error');
  });

  it('未知平台返回 404', async () => {
    const res = await handleNativeProxy('/native/nope/x');
    expect(res.status).toBe(404);
  });
});
