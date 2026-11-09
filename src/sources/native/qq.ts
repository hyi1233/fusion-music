// src/sources/native/qq.ts — QQ 音乐原生取链
//
// 两步：
//   1) c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=<mid>&format=json
//      —— 拿到 file.media_mid 与 file.size_128mp3 等元信息；url 字段通常为空
//      （地址需要 vkey 签名，v8 接口不下发）
//   2) u.y.qq.com/cgi-bin/musicu.fcg（POST）拿 vkey，再拼
//      ws.stream.qqmusic.qq.com/{filename}?vkey=...&guid=...
//
// 2026-11 实测（本机 IP，匿名态）：第 1 步正常返回 code:0 但 url 为空串；
// 第 2 步 GetVkey/GetUrl 一律 {"code":500003,"subcode":860100005}
// —— QQ 匿名态不给 vkey（需要登录态 cookie）。这里仍按官方协议实现，
// 带登录 cookie 的环境即可工作。

import { SourceError } from '../types';

export interface QqNativeOptions {
  /** 歌曲 mid（搜索结果的 songmid） */
  songMid: string;
  quality?: string;
}

/** 洛雪音质 → QQ filename 前缀与文件名 */
export function qqFilename(mediaMid: string, quality = '128k'): string {
  const prefix = quality === '320k' ? 'M800' : quality === 'flac' ? 'F000' : 'M500';
  const ext = quality === 'flac' ? 'flac' : 'mp3';
  return `${prefix}${mediaMid}.${ext}`;
}

/** v8 fcgi-bin 元信息地址 */
export function buildQqMetaUrl(songMid: string): string {
  return (
    `/native/qq/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${encodeURIComponent(songMid)}` +
    `&format=json&guid=1000000000`
  );
}

/** musicu.fcg 的 GetVkey 请求体 */
export function buildQqVkeyPayload(songMid: string, filename: string, guid = '1000000000'): string {
  return JSON.stringify({
    comm: { ct: 11, cv: '12080005', uin: '0', guid },
    req: {
      module: 'music.vkey',
      method: 'GetVkey',
      param: { songmid: songMid, filename, guid, songtype: 0 },
    },
  });
}

/** musicu.fcg 的 GetUrl 请求体（拿最终播放地址） */
export function buildQqUrlPayload(songMid: string, filename: string, guid = '1000000000'): string {
  return JSON.stringify({
    comm: { ct: 11, cv: '12080005', uin: '0', guid },
    req: {
      module: 'music.stream.url',
      method: 'GetUrl',
      param: { songmid: songMid, filename, guid, songtype: 0 },
    },
  });
}

interface QqMetaFile {
  media_mid?: string;
  filename?: string;
  url?: string;
  size_128mp3?: number;
  size_320mp3?: number;
}

export interface QqMeta {
  mediaMid: string;
  filename: string;
  directUrl: string | null;
}

/** 解析 v8 元信息响应 */
export function parseQqMeta(body: string, quality = '128k'): QqMeta | null {
  let data: { code?: number; data?: Array<{ file?: QqMetaFile; url?: string }> };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    return null;
  }
  if (data.code !== 0 || !Array.isArray(data.data) || !data.data[0]) return null;
  const file = data.data[0].file ?? {};
  const mediaMid = file.media_mid ?? '';
  const direct = data.data[0].url || file.url || null;
  if (!mediaMid && !direct) return null;
  return { mediaMid, filename: qqFilename(mediaMid, quality), directUrl: direct || null };
}

/** 解析 musicu.fcg 响应里的 vkey / purl */
export function parseQqVkey(body: string): { vkey: string; purl: string | null } {
  let data: {
    code?: number;
    req?: { code?: number; subcode?: number; data?: { vkey?: string; purl?: string; filename?: string } };
  };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    return { vkey: '', purl: null };
  }
  const inner = data.req?.data ?? {};
  return { vkey: inner.vkey ?? '', purl: inner.purl || null };
}

/**
 * 走代理请求 QQ 取链。
 * @param fetchImpl 可注入的 fetch（单测用）
 */
export async function fetchQqPlayUrl(
  options: QqNativeOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { songMid, quality = '128k' } = options;
  let meta: QqMeta | null = null;
  let lastError = '';
  try {
    const resp = await fetchImpl(buildQqMetaUrl(songMid), {
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    const body = await resp.text();
    if (!resp.ok) {
      throw new SourceError('NATIVE_FAILED', `QQ 元信息请求失败（HTTP ${resp.status}）`);
    }
    meta = parseQqMeta(body, quality);
    if (!meta) throw new SourceError('NATIVE_FAILED', 'QQ 元信息响应无法解析');
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }
  if (meta?.directUrl) return meta.directUrl;

  // v8 不给地址时走 musicu.fcg 拿 vkey
  const filename = meta?.filename ?? qqFilename(songMid, quality);
  try {
    const payload = buildQqUrlPayload(songMid, filename);
    const resp = await fetchImpl(
      `/native/qqMusicu/cgi-bin/musicu.fcg?__method=POST&__body=${encodeURIComponent(
        btoa(unescape(encodeURIComponent(payload))),
      )}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );
    const body = await resp.text();
    if (!resp.ok) throw new SourceError('NATIVE_FAILED', `QQ vkey 请求失败（HTTP ${resp.status}）`);
    const { vkey, purl } = parseQqVkey(body);
    if (purl) {
      return `https://ws.stream.qqmusic.qq.com/${filename}?vkey=${vkey}&guid=1000000000&from=yqq&param=`;
    }
    lastError = 'QQ 匿名态未下发 vkey（需要登录态）';
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  }
  throw new SourceError('NATIVE_FAILED', `QQ 原生取链失败（${lastError || '无响应'}）`);
}
