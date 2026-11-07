// src/sources/charts.ts — 酷狗排行榜：榜单目录 + 榜单歌曲（M3b）
// 接口：http://m.kugou.com/rank/list&json=true（55 个榜单）
//       https://m.kugou.com/rank/info/?rankid=XXX&page=N&json=true（榜单歌曲，30/页）
// 纯解析函数（parseRankList / parseRankSongs）与网络分离，便于单测。

import { httpJson } from './http';
import { SourceError } from './types';
import type { SongSummary } from './types';

/** 榜单元信息 */
export interface Chart {
  id: string; // rankid
  name: string;
}

/** 内置固定入口：新歌榜 / 热歌榜（酷狗 rankid） */
export const BUILTIN_CHARTS: Chart[] = [
  { id: '74534', name: '新歌榜' },
  { id: '6666', name: '飙升榜' },
  { id: '8888', name: 'TOP500' },
  { id: '82831', name: '网络热歌榜' },
  { id: '52144', name: '短视频热歌榜' },
];

interface KugouRankItem {
  rankid?: string | number;
  rankname?: string;
}

export function parseRankList(json: { rank?: { list?: KugouRankItem[] } }): Chart[] {
  return (json.rank?.list ?? [])
    .filter(it => it.rankid != null && it.rankname)
    .map(it => ({ id: String(it.rankid), name: it.rankname ?? '' }));
}

interface KugouRankSong {
  hash?: string;
  songname?: string;
  filename?: string; // "歌手 - 歌名"
  album_id?: string;
  duration_high?: number;
  authors?: Array<{ author_name?: string }>;
  albumname?: string;
}

export function parseRankSongs(json: { songs?: { list?: KugouRankSong[] } }): SongSummary[] {
  return (json.songs?.list ?? [])
    .filter(it => it.hash)
    .map(it => {
      // filename 优先："歌手 - 歌名"；否则 authors + songname
      const fname = it.filename ?? '';
      const dash = fname.indexOf(' - ');
      const artist =
        dash > 0 ? fname.slice(0, dash) : (it.authors ?? []).map(a => a.author_name ?? '').join('/');
      const title = dash > 0 ? fname.slice(dash + 3) : (it.songname ?? '');
      return {
        id: it.hash ?? '',
        title,
        artist,
        album: it.albumname ?? '',
        duration: it.duration_high ?? 0,
        source: 'kugou' as const,
      };
    });
}

/** 榜单歌曲：rankid → 30 条/页 */
export async function fetchChartSongs(rankId: string, page = 1): Promise<SongSummary[]> {
  const url = `${import.meta.env.DEV ? '/kg' : 'https://m.kugou.com'}/rank/info/?rankid=${encodeURIComponent(rankId)}&page=${page}&json=true`;
  const data = await httpJson<{ songs?: { list?: KugouRankSong[] } }>(url);
  const songs = parseRankSongs(data);
  if (page === 1 && songs.length === 0) {
    throw new SourceError('EMPTY', '该榜单暂无歌曲数据');
  }
  return songs;
}

/** 可用榜单目录（供 UI 扩展选榜；失败静默返回内置榜单） */
export async function fetchChartList(): Promise<Chart[]> {
  try {
    const data = await httpJson<{ rank?: { list?: KugouRankItem[] } }>(
      import.meta.env.DEV ? '/kg/rank/list&json=true' : 'https://m.kugou.com/rank/list&json=true',
    );
    const parsed = parseRankList(data);
    return parsed.length > 0 ? parsed : BUILTIN_CHARTS;
  } catch {
    return BUILTIN_CHARTS;
  }
}
