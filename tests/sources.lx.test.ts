import { describe, it, expect } from 'vitest';
import { LX_EVENT_NAMES } from '../src/sources/lx/runner';
import { loadRenderApiScript, RENDER_API_ROOT, REQUEST_KEY_VALUE } from '../src/sources/lx/keepalive';
import { vi, afterEach } from 'vitest';

// keepalive.ts 动态 import('../http')，mock 之
vi.mock('../src/sources/http', () => ({ httpText: vi.fn() }));
import { httpText } from '../src/sources/http';
const httpTextMock = vi.mocked(httpText);

// 测试环境 vitest 里 import.meta.env.DEV 为 true → 根路径走 '/lxapi/'，脚本内 API 地址改写 '/lxapi'
const DEV_ROOT = '/lxapi/';
const REAL_SCRIPT = "const API_URL = 'https://lxmusicapi.onrender.com'\nconst actions = ['musicUrl']\non(EVENT_NAMES.request, () => {})\nsend(EVENT_NAMES.inited, { status: true })";

afterEach(() => {
  vi.clearAllMocks();
  // 重置脚本缓存
  vi.resetModules();
});

describe('LX_EVENT_NAMES', () => {
  it('包含 request/inited', () => {
    expect(LX_EVENT_NAMES.request).toBe('request');
    expect(LX_EVENT_NAMES.inited).toBe('inited');
  });
});

describe('loadRenderApiScript', () => {
  it('根路径解析脚本 URL，校验 musicUrl 协议，缓存并改写 API 地址', async () => {
    httpTextMock.mockImplementation(async (url: unknown) => {
      if (url === DEV_ROOT)
        return { status: 200, body: JSON.stringify({ script: 'https://cdn.example/render_api.js' }) };
      return { status: 200, body: REAL_SCRIPT };
    });
    const mod = await import('../src/sources/lx/keepalive');
    const s1 = await mod.loadRenderApiScript();
    const s2 = await mod.loadRenderApiScript();
    expect(s1).toContain('musicUrl');
    // dev 下脚本内 onrender 地址改写为本地代理路径
    expect(s1).not.toContain('https://lxmusicapi.onrender.com');
    expect(s1).toContain("'/lxapi'");
    expect(httpTextMock).toHaveBeenCalledTimes(2); // 根路径 1 次 + 脚本本体 1 次，之后走缓存
    expect(s1).toContain('musicUrl');
    // CDN 下载不带 key（带 key 会触发预检），所以第二参为无 headers 空参
    expect(httpTextMock).toHaveBeenNthCalledWith(2, 'https://cdn.example/render_api.js', { headers: {} });
    expect(s2).toBe(s1);
  });

  it('根路径失败回退旧直链', async () => {
    httpTextMock.mockImplementation(async (url: unknown) => {
      if (url === DEV_ROOT) throw new Error('NETWORK');
      return { status: 200, body: REAL_SCRIPT };
    });
    const mod = await import('../src/sources/lx/keepalive');
    const s = await mod.loadRenderApiScript();
    expect(s).toContain('musicUrl');
    expect(httpTextMock).toHaveBeenNthCalledWith(2, `${RENDER_API_ROOT}/render_api.js`, {
      headers: { 'X-Request-Key': REQUEST_KEY_VALUE },
    });
  });

  it('脚本缺 musicUrl 协议抛 SCRIPT_INVALID', async () => {
    httpTextMock.mockImplementation(async (url: unknown) => {
      if (url === DEV_ROOT)
        return { status: 200, body: JSON.stringify({ script: 'https://cdn.example/r.js' }) };
      return { status: 200, body: 'nothing here' };
    });
    const mod = await import('../src/sources/lx/keepalive');
    await expect(mod.loadRenderApiScript()).rejects.toMatchObject({ code: 'SCRIPT_INVALID' });
  });
});

// runner.ts 的 iframe/postMessage 链路属于 DOM 集成行为，由 t4 集成验证覆盖；
// 单测层验证 bootstrap 与常量约定（见上）。
