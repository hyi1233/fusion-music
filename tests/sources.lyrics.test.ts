import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lyricSourceOf, fetchLyric, clearLyricCache, PLACEHOLDER_LINES } from '../src/sources/lyrics';
import { matches as amllMatches, candidateParams } from '../src/sources/amllLyrics';
import type { Track } from '../src/sources/types';

function track(id: string): Track {
  return { id, title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, cover: '', url: '' };
}

/** 只放行 kuwo 歌词接口；AMLL 一律返回空结果，模拟「AMLL 未收录」 */
function stubOnlyKuwo(body: unknown, status = 200) {
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.amll.dev')) {
      return new Response(JSON.stringify({ status: 200, data: { items: [] } }), { status: 200 });
    }
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', f);
  return f;
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

  it('kuwo 接口失败 resolve null（会重试 3 次）', async () => {
    const f = stubOnlyKuwo('', 500);
    await expect(fetchLyric(track('kuwo:51685512'))).resolves.toBeNull();
    // AMLL 3 次检索 + 酷我 3 次重试
    expect(f).toHaveBeenCalledTimes(6);
  });

  it('kuwo lrclist → parseLRC 转换', async () => {
    stubOnlyKuwo({
      data: {
        lrclist: [
          { lineLyric: '故事的小黄花', time: '12.25' },
          { lineLyric: '从出生那年就飘着', time: '16.30' },
        ],
      },
    });
    const data = await fetchLyric(track('kuwo:51685512'));
    expect(data).not.toBeNull();
    // parseLRC 会在开头插入 "......" 间奏行，取正文行断言
    const first = data!.lines.find(l => l.fullText === '故事的小黄花');
    expect(first).toBeDefined();
    expect(first!.startTime).toBeCloseTo(12.25, 2);
    expect(data!.lines.some(l => l.fullText === '从出生那年就飘着')).toBe(true);
  });

  it('缓存命中不重复请求', async () => {
    const f = stubOnlyKuwo({ data: { lrclist: [{ lineLyric: 'x', time: '1.0' }] } });
    const t = track('kuwo:1');
    await fetchLyric(t);
    await fetchLyric(t);
    // 缓存命中后不再发任何请求（AMLL 与平台接口都不再发）
    // 首次：AMLL 3 种检索策略（歌名+歌手 / 歌名 / 关键词）+ 酷我 1 次
    expect(f).toHaveBeenCalledTimes(4);
    // 再取一次走缓存，请求数不再增加
    await fetchLyric(t);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('空 lrclist 缓存 null 且不抛（重试后仍为空）', async () => {
    stubOnlyKuwo({ data: null });
    const t = track('kuwo:2');
    await expect(fetchLyric(t)).resolves.toBeNull();
    await expect(fetchLyric(t)).resolves.toBeNull(); // null 也进缓存
  });

  it('AMLL 命中时直接用 AMLL 的 TTML，不再请求平台接口', async () => {
    const ttml =
      '<?xml version="1.0" encoding="UTF-8"?><tt xmlns="http://www.w3.org/ns/ttml">' +
      '<body><div><p begin="00:00:01.000" end="00:00:03.000">AMLL 歌词行</p></div></body></tt>';
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/lyrics/search')) {
        return new Response(
          JSON.stringify({
            status: 200,
            data: {
              items: [
                {
                  id: 1,
                  musicNames: ['晴天'],
                  artistNames: ['周杰伦'],
                  qqMusicIds: ['0039MnYb0qxYhV'],
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/v1/lyrics/get')) {
        return new Response(JSON.stringify({ status: 200, data: { lyrics: ttml } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    const data = await fetchLyric(track('kuwo:51685512'));
    expect(data).not.toBeNull();
    expect(data!.lines.some(l => l.fullText.includes('AMLL 歌词行'))).toBe(true);
    // 只发了 AMLL 的两次请求（search + get），没有走酷我接口
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('AMLL 搜索无结果时回退平台接口', async () => {
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.amll.dev')) {
        return new Response(JSON.stringify({ status: 200, data: { items: [] } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ data: { lrclist: [{ lineLyric: '平台歌词', time: '3.0' }] } }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', f);
    const data = await fetchLyric(track('kuwo:51685512'));
    expect(data!.lines.some(l => l.fullText === '平台歌词')).toBe(true);
    // AMLL 搜索（3 种策略都可能发）之后至少有一次平台请求
    const urls = f.mock.calls.map(c => String(c[0]));
    expect(urls.some(u => u.includes('m.kuwo.cn'))).toBe(true);
  });
});

describe('AMLL 结果匹配', () => {
  it('歌名与歌手都相符', () => {
    expect(amllMatches({ musicNames: ['晴天'], artistNames: ['周杰伦'] }, '晴天', '周杰伦')).toBe(true);
  });
  it('歌名相符、歌手缺失时仍然接受', () => {
    expect(amllMatches({ musicNames: ['晴天'] }, '晴天', '周杰伦')).toBe(true);
  });
  it('歌名不符时拒绝', () => {
    expect(amllMatches({ musicNames: ['稻香'], artistNames: ['周杰伦'] }, '晴天', '周杰伦')).toBe(false);
  });
  it('忽略括号备注与大小写差异', () => {
    expect(amllMatches({ musicNames: ['花海 (DJ 阿若版)'], artistNames: ['周杰伦'] }, '花海', '周杰伦')).toBe(true);
  });
});

describe('AMLL 取词参数', () => {
  it('优先用 qqMusicId / ncmMusicId，最后兜底 id', () => {
    expect(candidateParams({ qqMusicIds: ['abc'], ncmMusicIds: ['123'], id: 7 })).toEqual([
      'qqMusicId=abc',
      'ncmMusicId=123',
      'id=7',
    ]);
  });
  it('没有任何 id 时返回空数组', () => {
    expect(candidateParams({})).toEqual([]);
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
