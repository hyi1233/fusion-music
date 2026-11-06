// src/sources/lyrics.ts — 歌词源接入（M3a）
// Track.id 前缀路由平台：qq:songmid → QQ（上游 qqLyricProvider，QRC 解密）
//                        kugou:hash → 酷狗 KRC 搜索接口
//                        kuwo:id   → 酷我（接口常被拒，失败回落占位）
// 统一返回 Folia LyricData；任何失败 resolve(null)，由调用方回退占位，不阻塞播放。

import type { Track } from '../types/music';
import type { LyricData } from '../types';
import { parseLRC } from '../utils/lyrics/parserCore';

export type { LyricData };

/** QQ 歌词：SongResult 需要完整元数据；我们的 Track 只有 id(mid)，先搜索定位再取词 */
async function fetchQQLyric(track: Track): Promise<LyricData | null> {
  const { searchQQSongs, fetchQQLyrics } = await import('../services/onlineMusic/qq/qqLyricProvider');
  const mid = track.id.split(':')[1] ?? track.id;
  // 用歌名+歌手反查拿 songID（GetPlayLyricInfo 要 numeric id）
  const query = `${track.title} ${track.artist}`.trim();
  const hits = await searchQQSongs(query, 1, 10);
  const hit =
    hits.find(s => s.qqMid === mid) ??
    hits.find(s => s.name === track.title) ??
    hits[0];
  if (!hit) return null;
  const parsed = await fetchQQLyrics(hit);
  return parsed ?? null;
}

// ---------- 酷狗 ----------
interface KrcCandidate {
  hash: string;
  id: string;
  duration: number;
}

async function krcCandidates(track: Track): Promise<KrcCandidate[]> {
  const query = `${track.title} ${track.artist}`.trim();
  const resp = await fetch(
    `http://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(query)}&duration=${Math.round(track.duration * 1000)}&hash=${track.id.split(':')[1] ?? ''}`,
  );
  if (!resp.ok) throw new Error(`kugou krc search HTTP ${resp.status}`);
  const data = (await resp.json()) as { candidates?: KrcCandidate[] };
  return data.candidates ?? [];
}

async function fetchKugouLyric(track: Track): Promise<LyricData | null> {
  const candidates = await krcCandidates(track);
  if (candidates.length === 0) return null;
  const best = candidates[0];
  const resp = await fetch(
    `http://krcs.kugou.com/download?ver=1&client=mobi&fmt=lrc&charset=utf8&id=${best.id}&accesskey=${best.hash}`,
  );
  if (!resp.ok) throw new Error(`kugou krc download HTTP ${resp.status}`);
  const data = (await resp.json()) as { content?: string };
  if (!data.content) return null;
  return parseLRC(data.content);
}

// ---------- 酷我 ----------
async function fetchKuwoLyric(track: Track): Promise<LyricData | null> {
  const id = track.id.split(':')[1] ?? track.id;
  const resp = await fetch(
    `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${encodeURIComponent(id)}`,
  );
  if (!resp.ok) throw new Error(`kuwo lyric HTTP ${resp.status}`);
  const data = (await resp.json()) as {
    data?: { lrclist?: Array<{ lineLyric?: string; time?: string }> } | null;
  };
  const rows = data.data?.lrclist ?? [];
  if (rows.length === 0) return null;
  const lrc = rows
    .map(r => {
      const t = Number(r.time) || 0;
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]${r.lineLyric ?? ''}`;
    })
    .join('\n');
  return parseLRC(lrc);
}

// ---------- 路由与降级 ----------
export type LyricSource = 'qq' | 'kugou' | 'kuwo';

export function lyricSourceOf(trackId: string): LyricSource | null {
  const [plat] = trackId.split(':');
  if (plat === 'qq' || plat === 'kugou' || plat === 'kuwo') return plat;
  return null;
}

const FETCHERS: Record<LyricSource, (t: Track) => Promise<LyricData | null>> = {
  qq: fetchQQLyric,
  kugou: fetchKugouLyric,
  kuwo: fetchKuwoLyric,
};

/** 内存缓存：trackId → LyricData（含 null：取不到的也缓存，避免重复打接口） */
const cache = new Map<string, LyricData | null>();

/**
 * 取歌词（带缓存）。失败/无词 resolve null —— 永不 reject，
 * 调用方直接回退占位，不阻塞播放。
 */
export async function fetchLyric(track: Track): Promise<LyricData | null> {
  if (cache.has(track.id)) return cache.get(track.id) ?? null;
  const source = lyricSourceOf(track.id);
  if (!source) return null;
  let result: LyricData | null = null;
  try {
    result = await FETCHERS[source](track);
  } catch (e) {
    console.warn(`[lyrics] ${source} 取词失败:`, (e as Error).message);
    result = null;
  }
  cache.set(track.id, result);
  return result;
}

export function clearLyricCache(): void {
  cache.clear();
}

/** 占位歌词（与 PlayingView 原 PLACEHOLDER_LINES 相同语义） */
export const PLACEHOLDER_LINES: LyricData = {
  lines: [
    { words: [{ text: '正在播放', startTime: 0, endTime: 3 }], startTime: 0, endTime: 3, fullText: '正在播放' },
    { words: [{ text: '这首歌暂时没有歌词', startTime: 3, endTime: 8 }], startTime: 3, endTime: 8, fullText: '这首歌暂时没有歌词' },
    { words: [{ text: '歌词源接入将在后续版本提供', startTime: 8, endTime: 13 }], startTime: 8, endTime: 13, fullText: '歌词源接入将在后续版本提供' },
  ],
  isWordByWord: false,
};
