import { describe, it, expect } from 'vitest';
import { LX_EVENT_NAMES } from '../src/sources/lx/runner';
import { loadRenderApiScript, RENDER_API_URL, REQUEST_KEY_VALUE } from '../src/sources/lx/keepalive';
import { vi, afterEach } from 'vitest';

// keepalive.ts 动态 import('../http')，mock 之
vi.mock('../src/sources/http', () => ({ httpText: vi.fn() }));
import { httpText } from '../src/sources/http';
const httpTextMock = vi.mocked(httpText);

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
  it('校验 getMusicUrl 导出并缓存', async () => {
    httpTextMock.mockResolvedValue({ status: 200, body: 'function getMusicUrl(){return 1}' });
    const mod = await import('../src/sources/lx/keepalive');
    const s1 = await mod.loadRenderApiScript();
    const s2 = await mod.loadRenderApiScript();
    expect(s1).toContain('getMusicUrl');
    expect(httpTextMock).toHaveBeenCalledTimes(1);
    expect(httpTextMock).toHaveBeenCalledWith(RENDER_API_URL, {
      headers: { 'X-Request-Key': REQUEST_KEY_VALUE },
    });
    expect(s2).toBe(s1);
  });

  it('脚本缺 getMusicUrl 抛 SCRIPT_INVALID', async () => {
    httpTextMock.mockResolvedValue({ status: 200, body: 'nothing here' });
    const mod = await import('../src/sources/lx/keepalive');
    await expect(mod.loadRenderApiScript()).rejects.toMatchObject({ code: 'SCRIPT_INVALID' });
  });
});

// runner.ts 的 iframe/postMessage 链路属于 DOM 集成行为，由 t4 集成验证覆盖；
// 单测层验证 bootstrap 与常量约定（见上）。
