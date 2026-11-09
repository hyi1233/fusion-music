// src/sources/amllLyrics.ts — AMLL 歌词库（api.amll.dev）取词
//
// AMLL TTML DB 是社区维护的歌词库，覆盖 QQ / 网易云等平台，返回带逐字时间的
// TTML。接口自带 CORS `*`，浏览器可直接访问；实测按歌名+歌手搜索能命中。
//
// 相比各平台自己的歌词接口，AMLL 的好处是：
// - 一个接口覆盖所有平台（不必为每家平台各写一套解密/反爬处理）
// - 直接给 TTML（逐字），Folia 的视觉核心能直接吃
// - 不限流、不需要 Referer 伪装
//
// 平台自带接口仍作为回退（AMLL 收录不全时）。

import type { Track } from '../types/music';
import type { LyricData } from '../types';
import { parseLyricsByFormat } from '../utils/lyrics/parserCore';

const AMLL_API_BASE = 'https://api.amll.dev';

interface AmllSearchItem {
  id?: number;
  musicNames?: string[];
  artistNames?: string[];
  albumNames?: string[];
  qqMusicIds?: string[];
  ncmMusicIds?: string[];
}

interface AmllSearchResponse {
  status?: number;
  data?: {
    items?: AmllSearchItem[];
  };
}

interface AmllGetResponse {
  status?: number;
  data?: {
    lyrics?: string | null;
    format?: string | null;
    musicNames?: string[];
    artistNames?: string[];
  };
}

const TIMEOUT_MS = 8000;

async function requestJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error(`AMLL HTTP ${resp.status}`);
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** 归一化字符串，便于比较歌名/歌手 */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[·・.,，、!！?？'"“”\-—_]/g, '');
}

/** 结果里是否有与目标歌名/歌手相符的条目 */
export function matches(
  item: { musicNames?: string[]; artistNames?: string[] },
  title: string,
  artist: string,
): boolean {
  const t = normalizeText(title);
  const a = normalizeText(artist);
  const names = (item.musicNames ?? []).map(normalizeText);
  const artists = (item.artistNames ?? []).map(normalizeText);
  const nameOk = names.some(n => n === t || (t.length > 1 && n.includes(t)) || (n.length > 1 && t.includes(n)));
  if (!nameOk) return false;
  if (!a) return true;
  // 歌手缺失时不排除（AMLL 里艺人名收录不全）
  if (!artists.length) return true;
  return artists.some(x => x === a || x.includes(a) || a.includes(x));
}

/**
 * 按歌名+歌手搜索 AMLL 歌词库并解析。
 * 命中返回 LyricData，未命中/失败返回 null（调用方回退到平台接口）。
 */
export async function fetchAmllLyric(track: Track): Promise<LyricData | null> {
  const title = track.title?.trim();
  if (!title) return null;
  const artist = track.artist?.trim() ?? '';

  // AMLL 检索是「精确名 + 可选歌手」的 AND 匹配，收录也不全，
  // 因此依次尝试：歌名+歌手 → 歌名 → 关键词（歌名 歌手）。
  const queries: URLSearchParams[] = [];
  if (artist) {
    const q1 = new URLSearchParams();
    q1.set('musicName', title);
    q1.set('artistName', artist);
    queries.push(q1);
  }
  const q2 = new URLSearchParams();
  q2.set('musicName', title);
  queries.push(q2);
  if (artist) {
    const q3 = new URLSearchParams();
    q3.set('q', `${title} ${artist}`);
    queries.push(q3);
  }

  const seen = new Set<string>();
  for (const params of queries) {
    params.set('pageSize', '10');
    let search: AmllSearchResponse;
    try {
      search = await requestJson<AmllSearchResponse>(`${AMLL_API_BASE}/v1/lyrics/search?${params}`);
    } catch {
      continue;
    }
    const items = search.data?.items ?? [];
    if (!items.length) continue;
    const hit = items.find(it => matches(it, title, artist)) ?? items[0];
    for (const cand of candidateParams(hit)) {
      if (seen.has(cand)) continue;
      seen.add(cand);
      const lyric = await fetchAmllTtml(cand);
      if (lyric) return lyric;
    }
  }
  return null;
}

/** 该条目可用于取词的参数组合（/v1/lyrics/get 的 query 参数） */
export function candidateParams(item: AmllSearchItem): string[] {
  const out: string[] = [];
  for (const id of item.qqMusicIds ?? []) out.push(`qqMusicId=${encodeURIComponent(id)}`);
  for (const id of item.ncmMusicIds ?? []) out.push(`ncmMusicId=${encodeURIComponent(id)}`);
  if (item.id != null) out.push(`id=${item.id}`);
  return out;
}

/** 取 TTML 并解析成 Folia LyricData */
async function fetchAmllTtml(candidate: string): Promise<LyricData | null> {
  try {
    const got = await requestJson<AmllGetResponse>(`${AMLL_API_BASE}/v1/lyrics/get?${candidate}`);
    const ttml = got.data?.lyrics;
    if (!ttml?.trim() || !/<tt(?:\s|>)/i.test(ttml)) return null;
    const parsed = parseLyricsByFormat('ttml', ttml);
    if (parsed.lines?.length) return parsed;
  } catch {
    /* 试下一个候选 */
  }
  return null;
}
