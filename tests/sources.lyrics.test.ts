import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lyricSourceOf, fetchLyric, clearLyricCache, PLACEHOLDER_LINES } from '../src/sources/lyrics';
import type { Track } from '../src/sources/types';

function track(id: string): Track {
  return { id, title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, cover: '', url: '' };
}

describe('lyricSourceOf 路由', () => {
  it('按前缀路由平台', () => {
    expect(lyricSourceOf('kuwo:123')).toBe('kuwo');
    expect(lyricSourceOf('kugou:ABC')).toBe('kugou');
    expect(lyricSourceOf('qq:0039MnYb0qxYhV')).toBe('qq');
  });
  it('未知前缀返回 null', () => {
    expect(lyricSourceOf('netease:1')).toBeNull();
    expect(lyricSourceOf('plain')).toBeNull();
  });
});

describe('fetchLyric 降级', () => {
  beforeEach(() => clearLyricCache());
  afterEach(() => vi.unstubAllGlobals());

  it('未知平台 resolve null（不 reject）', async () => {
    await expect(fetchLyric(track('foo:1'))).resolves.toBeNull();
  });

  it('kuwo 接口失败 resolve null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(fetchLyric(track('kuwo:51685512'))).resolves.toBeNull();
  });

  it('kuwo lrclist → parseLRC 转换', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: { lrclist: [
            { lineLyric: '故事的小黄花', time: '12.25' },
            { lineLyric: '从出生那年就飘着', time: '16.30' },
          ] } }),
          { status: 200 },
        ),
      ),
    );
    const data = await fetchLyric(track('kuwo:51685512'));
    expect(data).not.toBeNull();
    // parseLRC 会在开头插入 "......" 间奏行，取正文行断言
    const first = data!.lines.find(l => l.fullText === '故事的小黄花');
    expect(first).toBeDefined();
    expect(first!.startTime).toBeCloseTo(12.25, 2);
    expect(data!.lines.some(l => l.fullText === '从出生那年就飘着')).toBe(true);
  });

  it('缓存命中不重复请求', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ data: { lrclist: [{ lineLyric: 'x', time: '1.0' }] } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', f);
    const t = track('kuwo:1');
    await fetchLyric(t);
    await fetchLyric(t);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('空 lrclist 缓存 null 且不抛', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: null }), { status: 200 })),
    );
    const t = track('kuwo:2');
    await expect(fetchLyric(t)).resolves.toBeNull();
    await expect(fetchLyric(t)).resolves.toBeNull(); // null 也进缓存
  });
});

describe('PLACEHOLDER_LINES', () => {
  it('是合法 Folia LyricData（含 3 行提示）', () => {
    expect(PLACEHOLDER_LINES.lines).toHaveLength(3);
    expect(PLACEHOLDER_LINES.isWordByWord).toBe(false);
    for (const line of PLACEHOLDER_LINES.lines) {
      expect(line.words[0].text).toBe(line.fullText);
      expect(line.endTime).toBeGreaterThan(line.startTime);
    }
  });
});
