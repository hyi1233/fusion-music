import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// node 26 自带实验性 localStorage，会盖掉 jsdom 实现
beforeEach(() => {
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

async function loadStore() {
  vi.resetModules();
  return import('../src/player/playerStore');
}

describe('playerStore 播放错误上报', () => {
  it('音源解析失败时把错误写进 state（而不是静默显示「未播放」）', async () => {
    vi.doMock('../src/sources', () => ({
      resolvePlayUrl: vi.fn(async () => {
        throw new Error('获取播放链接失败：block ip');
      }),
    }));
    const { usePlayerStore } = await loadStore();
    await usePlayerStore.getState().playTracks([
      { id: 'kuwo:1', title: 'x', artist: 'y', album: '', duration: 0, cover: '', url: '' },
    ]);
    expect(usePlayerStore.getState().error).toBe('获取播放链接失败：block ip');
    vi.doUnmock('../src/sources');
  });

  it('解析成功时 error 为 null', async () => {
    vi.doMock('../src/sources', () => ({
      resolvePlayUrl: vi.fn(async () => 'https://example.com/a.mp3'),
    }));
    const { usePlayerStore } = await loadStore();
    await usePlayerStore.getState().playTracks([
      { id: 'kuwo:1', title: 'x', artist: 'y', album: '', duration: 0, cover: '', url: '' },
    ]);
    expect(usePlayerStore.getState().error).toBeNull();
    expect(usePlayerStore.getState().track?.url).toBe('https://example.com/a.mp3');
    vi.doUnmock('../src/sources');
  });

  it('先失败后成功：新的播放请求会覆盖旧错误', async () => {
    let shouldFail = true;
    vi.doMock('../src/sources', () => ({
      resolvePlayUrl: vi.fn(async () => {
        if (shouldFail) throw new Error('boom');
        return 'https://example.com/b.mp3';
      }),
    }));
    const { usePlayerStore } = await loadStore();
    const track = { id: 'kuwo:1', title: 'x', artist: 'y', album: '', duration: 0, cover: '', url: '' };
    await usePlayerStore.getState().playTracks([track]);
    expect(usePlayerStore.getState().error).toBe('boom');
    shouldFail = false;
    await usePlayerStore.getState().playTracks([track]);
    expect(usePlayerStore.getState().error).toBeNull();
    vi.doUnmock('../src/sources');
  });
});
