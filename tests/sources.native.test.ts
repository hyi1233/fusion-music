// tests/sources.native.test.ts — 平台原生取链兜底（单测，fetch mock）
//
// 覆盖：URL 组装（参数正确性）、响应解析、失败时的错误文案。

import { describe, expect, it, vi } from 'vitest';
import {
  buildKuwoAntiUrl,
  buildKuwoWwwUrl,
  fetchKuwoPlayUrl,
  kuwoBr,
  parseKuwoUrl,
} from '../src/sources/native/kuwo';
import {
  buildQqMetaUrl,
  buildQqUrlPayload,
  buildQqVkeyPayload,
  fetchQqPlayUrl,
  parseQqMeta,
  parseQqVkey,
  qqFilename,
} from '../src/sources/native/qq';
import {
  buildKugouMobileUrl,
  buildKugouWwwUrl,
  fetchKugouPlayUrl,
  parseKugouMobileUrl,
  parseKugouWwwUrl,
} from '../src/sources/native/kugou';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('酷我原生取链', () => {
  it('antiserver 地址带 type=convert_url3 / rid=MUSIC_xxx / format / br', () => {
    const url = buildKuwoAntiUrl('474678847', '128k');
    expect(url).toContain('/native/kuwo/anti/s');
    expect(url).toContain('type=convert_url3');
    expect(url).toContain('rid=MUSIC_474678847');
    expect(url).toContain('format=mp3');
    expect(url).toContain('br=128kmp3');
  });

  it('rid 已带 MUSIC_ 前缀时不重复拼接', () => {
    expect(buildKuwoAntiUrl('MUSIC_123')).toContain('rid=MUSIC_123');
    expect(buildKuwoAntiUrl('MUSIC_123')).not.toContain('MUSIC_MUSIC_');
  });

  it('音质映射到酷我 br', () => {
    expect(kuwoBr('128k')).toBe('128kmp3');
    expect(kuwoBr('320k')).toBe('320kmp3');
    expect(kuwoBr('flac')).toBe('flac');
    expect(kuwoBr('unknown')).toBe('128kmp3');
  });

  it('www 地址带 rid/br/format', () => {
    const url = buildKuwoWwwUrl('474678847', '320k');
    expect(url).toContain('/native/kuwoWww/api/www/play/url');
    expect(url).toContain('rid=MUSIC_474678847');
    expect(url).toContain('br=320kmp3');
    expect(url).toContain('format=mp3');
  });

  it('解析 url / data.url，success=false 视为失败', () => {
    expect(parseKuwoUrl(JSON.stringify({ url: 'https://a.mp3' }))).toBe('https://a.mp3');
    expect(parseKuwoUrl(JSON.stringify({ data: { url: 'https://b.mp3' } }))).toBe('https://b.mp3');
    expect(parseKuwoUrl(JSON.stringify({ success: false, message: 'illegal' }))).toBeNull();
    expect(parseKuwoUrl('not json')).toBeNull();
  });

  it('第一条路径成功即返回，不再请求第二条', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ url: 'https://ok.mp3' }));
    const url = await fetchKuwoPlayUrl({ songId: '1' }, fetchImpl as unknown as typeof fetch);
    expect(url).toBe('https://ok.mp3');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('第一条 403 时降级到 www 路径', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ data: { url: 'https://fallback.mp3' } }));
    const url = await fetchKuwoPlayUrl({ songId: '1' }, fetchImpl as unknown as typeof fetch);
    expect(url).toBe('https://fallback.mp3');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/api/www/play/url');
  });

  it('全部失败时抛 NATIVE_FAILED 并带上原因', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(
      fetchKuwoPlayUrl({ songId: '1' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/酷我原生取链失败/);
  });
});

describe('QQ 原生取链', () => {
  it('filename 按音质选择 M500/M800/F000', () => {
    expect(qqFilename('ABC', '128k')).toBe('M500ABC.mp3');
    expect(qqFilename('ABC', '320k')).toBe('M800ABC.mp3');
    expect(qqFilename('ABC', 'flac')).toBe('F000ABC.flac');
  });

  it('元信息地址带 songmid / format=json / guid', () => {
    const url = buildQqMetaUrl('0039MnYb0qxYhV');
    expect(url).toContain('/native/qq/v8/fcg-bin/fcg_play_single_song.fcg');
    expect(url).toContain('songmid=0039MnYb0qxYhV');
    expect(url).toContain('format=json');
    expect(url).toContain('guid=1000000000');
  });

  it('musicu.fcg 请求体结构正确', () => {
    const payload = JSON.parse(buildQqVkeyPayload('MID', 'M500MID.mp3'));
    expect(payload.comm.ct).toBe(11);
    expect(payload.comm.guid).toBe('1000000000');
    expect(payload.req.module).toBe('music.vkey');
    expect(payload.req.method).toBe('GetVkey');
    expect(payload.req.param.filename).toBe('M500MID.mp3');

    const urlPayload = JSON.parse(buildQqUrlPayload('MID', 'M500MID.mp3'));
    expect(urlPayload.req.module).toBe('music.stream.url');
    expect(urlPayload.req.method).toBe('GetUrl');
  });

  it('解析元信息：media_mid → filename，url 为空时 directUrl=null', () => {
    const meta = parseQqMeta(
      JSON.stringify({ code: 0, data: [{ file: { media_mid: '003Qui1q2u1Zho', size_128mp3: 1 } }] }),
    );
    expect(meta?.mediaMid).toBe('003Qui1q2u1Zho');
    expect(meta?.filename).toBe('M500003Qui1q2u1Zho.mp3');
    expect(meta?.directUrl).toBeNull();
    expect(parseQqMeta(JSON.stringify({ code: 500003 }))).toBeNull();
  });

  it('解析 vkey / purl', () => {
    const parsed = parseQqVkey(
      JSON.stringify({ code: 0, req: { code: 0, data: { vkey: 'VK', purl: '/purl' } } }),
    );
    expect(parsed.vkey).toBe('VK');
    expect(parsed.purl).toBe('/purl');
    expect(parseQqVkey('{}').vkey).toBe('');
  });

  it('元信息里直接带 url 时立即返回', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: 0, data: [{ url: 'https://direct.mp3', file: { media_mid: 'M' } }] }),
    );
    const url = await fetchQqPlayUrl({ songMid: 'M' }, fetchImpl as unknown as typeof fetch);
    expect(url).toBe('https://direct.mp3');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('v8 无 url 时走 musicu.fcg 拼流地址', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: [{ file: { media_mid: 'MID' } }] }))
      .mockResolvedValueOnce(
        jsonResponse({ code: 0, req: { code: 0, data: { vkey: 'VK', purl: 'purl' } } }),
      );
    const url = await fetchQqPlayUrl({ songMid: 'MID' }, fetchImpl as unknown as typeof fetch);
    expect(url).toContain('ws.stream.qqmusic.qq.com/M500MID.mp3');
    expect(url).toContain('vkey=VK');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/native/qqMusicu/cgi-bin/musicu.fcg');
  });

  it('匿名态拿不到 vkey 时抛错并说明原因', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: [{ file: { media_mid: 'MID' } }] }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, req: { code: 500003, subcode: 860100005 } }));
    await expect(
      fetchQqPlayUrl({ songMid: 'MID' }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/QQ 原生取链失败/);
  });
});

describe('酷狗原生取链', () => {
  it('mobilecdn 地址带 hash/timelength/format/bitrate', () => {
    const url = buildKugouMobileUrl('HASH', 210000, '128k');
    expect(url).toContain('/native/kugou/api/v3/song/url');
    expect(url).toContain('hash=HASH');
    expect(url).toContain('timelength=210000');
    expect(url).toContain('format=mp3');
    expect(url).toContain('bitrate=128');
  });

  it('www getdata 地址带 hash/duration', () => {
    const url = buildKugouWwwUrl('HASH', 210000);
    expect(url).toContain('/native/kugouWww/yy/index.php');
    expect(url).toContain('hash=HASH');
    expect(url).toContain('duration=210000');
  });

  it('解析两种响应', () => {
    expect(parseKugouWwwUrl(JSON.stringify({ data: [{ url: 'https://k.mp3' }] }))).toBe('https://k.mp3');
    expect(parseKugouMobileUrl(JSON.stringify({ url: 'https://m.mp3' }))).toBe('https://m.mp3');
    expect(parseKugouMobileUrl(JSON.stringify({ data: { url: 'https://m2.mp3' } }))).toBe('https://m2.mp3');
    expect(parseKugouWwwUrl(JSON.stringify({ data: [] }))).toBeNull();
  });

  it('两条路径都失败时说明酷狗接口状态', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [], err_code: 20010 }));
    await expect(
      fetchKugouPlayUrl({ hash: 'H', durationMs: 1000 }, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/酷狗原生取链失败/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
