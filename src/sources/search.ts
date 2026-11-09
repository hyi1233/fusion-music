// src/sources/search.ts — 平台公开搜索：酷我 → 酷狗 → QQ 依次降级
// 纯解析函数（parseKuwo/parseKugou/parseQq）与网络请求分离，便于单测。

import { httpJson, httpText } from './http';
import { IpBanError, RateLimitError, SourceError } from './types';
import type { SongSummary, Track } from './types';

type Platform = SongSummary['source'];

// ---------- 酷我 ----------
// search.kuwo.cn/r.s 返回的是 Python 风格的字典字面量（单引号 + True/False/None），
// 不是合法 JSON，需要先转成合法 JSON 才能 parse。
interface KuwoItem {
  MUSICRID?: string; // "MUSIC_123456"
  SONGNAME?: string;
  ARTIST?: string;
  ALBUM?: string;
  DURATION?: string | number; // 秒
}

/** 把 Python 风格字典字面量（单引号/True/False/None）转成合法 JSON */
export function normalizePythonDict(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    // 已经是合法 JSON 的双引号字符串原样保留（内部可能含撇号）
    if (c === '"') {
      let j = i + 1;
      let buf = '"';
      while (j < text.length) {
        if (text[j] === '\\') {
          buf += text.slice(j, j + 2);
          j += 2;
          continue;
        }
        buf += text[j];
        if (text[j] === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(buf);
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      let buf = '';
      while (j < text.length) {
        if (text[j] === '\\') {
          buf += text.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (text[j] === "'") break;
        buf += text[j];
        j += 1;
      }
      out.push(JSON.stringify(buf.replace(/"/g, '\\"')));
      i = j + 1;
      continue;
    }
    out.push(c);
    i += 1;
  }
  return out
    .join('')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');
}

export function parseKuwo(body: string): SongSummary[] {
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SourceError('PARSE', '酷我返回了无法解析的数据');
  let data: { abslist?: KuwoItem[] };
  try {
    data = JSON.parse(normalizePythonDict(body.slice(start, end + 1))) as { abslist?: KuwoItem[] };
  } catch {
    throw new SourceError('PARSE', '酷我返回了无法解析的数据');
  }
  return (data.abslist ?? [])
    .filter((it) => it.MUSICRID)
    .map((it) => ({
      id: (it.MUSICRID ?? '').replace(/^MUSIC_/, ''),
      title: (it.SONGNAME ?? '').replace(/&nbsp;/g, ' ').trim(),
      artist: it.ARTIST ?? '',
      album: it.ALBUM ?? '',
      duration: Number(it.DURATION ?? 0) || 0,
      source: 'kuwo' as const,
    }));
}

async function searchKuwo(keyword: string): Promise<SongSummary[]> {
  const url =
    `/search/kuwo/r.s?all=${encodeURIComponent(keyword)}` +
    `&ft=music&rformat=json&encoding=utf8&pn=0&rn=30&jsonquery=1`;
  const { body } = await httpText(url);
  return parseKuwo(body);
}

// ---------- 酷狗 ----------
// mobilecdn.kugou.com 的实际返回结构：data.info[]（不是 data.lists）
interface KugouResp {
  status?: number;
  data?: {
    info?: Array<{
      hash?: string;
      songname?: string;
      album_name?: string;
      singername?: string;
      duration?: number;
    }>;
  };
}

export function parseKugou(json: KugouResp): SongSummary[] {
  return (json.data?.info ?? []).map((it) => ({
    id: it.hash ?? '',
    title: (it.songname ?? '').replace(/<[^>]+>/g, ''),
    artist: it.singername ?? '',
    album: it.album_name ?? '',
    duration: it.duration ?? 0,
    source: 'kugou' as const,
  }));
}

async function searchKugou(keyword: string): Promise<SongSummary[]> {
  const url =
    `/search/kugou/api/v3/search/song?format=json` +
    `&keyword=${encodeURIComponent(keyword)}&page=1&pagesize=30`;
  const data = await httpJson<KugouResp>(url);
  return parseKugou(data);
}

// ---------- QQ ----------
interface QqResp {
  code?: number;
  data?: {
    song?: {
      list?: Array<{
        songmid?: string;
        songname?: string;
        singer?: Array<{ name?: string }>;
        albumname?: string;
        interval?: number;
      }>;
    };
  };
}

export function parseQq(json: QqResp): SongSummary[] {
  return (json.data?.song?.list ?? []).map((it) => ({
    id: it.songmid ?? '',
    title: it.songname ?? '',
    artist: (it.singer ?? []).map((s) => s.name ?? '').join('/'),
    album: it.albumname ?? '',
    duration: it.interval ?? 0,
    source: 'qq' as const,
  }));
}

async function searchQq(keyword: string): Promise<SongSummary[]> {
  const url =
    `/search/qq/soso/fcgi-bin/client_search_cp?format=json` +
    `&w=${encodeURIComponent(keyword)}&n=30`;
  const data = await httpJson<QqResp>(url);
  if (data.code !== 0) throw new SourceError('PLATFORM', `QQ 音乐搜索失败（code=${data.code}）`);
  return parseQq(data);
}

const CHAIN: Array<[Platform, (kw: string) => Promise<SongSummary[]>]> = [
  ['kuwo', searchKuwo],
  ['kugou', searchKugou],
  ['qq', searchQq],
];

/**
 * 多平台搜索：按 酷我→酷狗→QQ 顺序尝试，第一个有结果的平台即返回。
 * 限流/封 IP 错误不降级直接抛（换平台同样受网络环境限制）；其余错误降级。
 * 全部失败时抛最后一次的错误。
 */
export async function searchAll(keyword: string): Promise<{ platform: Platform; songs: SongSummary[] }> {
  if (!keyword.trim()) return { platform: 'kuwo', songs: [] };
  let lastError: unknown;
  for (const [platform, fn] of CHAIN) {
    try {
      const songs = await fn(keyword);
      if (songs.length > 0) return { platform, songs };
      lastError = new SourceError('EMPTY', `${platformName(platform)}没有找到相关歌曲`);
    } catch (e) {
      if (e instanceof RateLimitError || e instanceof IpBanError) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new SourceError('ALL_FAILED', '所有音源都搜索失败');
}

export function platformName(p: Platform): string {
  return { kuwo: '酷我', kugou: '酷狗', qq: 'QQ 音乐' }[p];
}

/** SongSummary → UI Track（url 留空，由播放链路经 LX 音源取流） */
export function toTrack(s: SongSummary): Track {
  return {
    id: `${s.source}:${s.id}`,
    title: s.title,
    artist: s.artist,
    album: s.album,
    duration: s.duration,
    cover: '',
    url: '',
  };
}
