import { describe, it, expect } from 'vitest';
import { httpText } from '../src/sources/http';
import { IpBanError, RateLimitError, SourceError } from '../src/sources/types';

// httpText 用全局 fetch —— Node 环境下用 vi.stubGlobal 模拟
import { vi, afterEach } from 'vitest';

function stubFetch(status: number, body = '') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
}

afterEach(() => vi.unstubAllGlobals());

describe('httpText 错误映射', () => {
  it('403 → IpBanError', async () => {
    stubFetch(403);
    await expect(httpText('https://x')).rejects.toBeInstanceOf(IpBanError);
  });
  it('429 → RateLimitError', async () => {
    stubFetch(429);
    await expect(httpText('https://x')).rejects.toBeInstanceOf(RateLimitError);
  });
  it('500 → HTTP_ERROR SourceError', async () => {
    stubFetch(500);
    await expect(httpText('https://x')).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });
  it('网络拒绝 → NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fail'); }));
    await expect(httpText('https://x')).rejects.toMatchObject({ code: 'NETWORK' });
  });
  it('成功返回 body', async () => {
    stubFetch(200, 'ok');
    await expect(httpText('https://x')).resolves.toMatchObject({ status: 200, body: 'ok' });
  });
  it('默认带 User-Agent 头', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await httpText('https://x');
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Mozilla');
  });
});
