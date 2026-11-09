// src/sources/native/kuwo.ts — 酷我原生取链
//
// 两条路径（都经 /native/kuwo 代理转发，因为浏览器直连会被拦）：
//   1) antiserver.kuwo.cn/anti/s?type=convert_url3&rid=MUSIC_xxx&format=mp3&br=128kmp3
//      —— 官方移动端取链，返回 {url, size, ...}
//   2) www.kuwo.cn/api/www/play/url?rid=MUSIC_xxx&br=128kmp3&format=mp3
//      —— 网页版取链，需要 csrf + 同源 cookie，服务端直连常被判 illegal
//
// 2026-11 实测（本机 IP）：路径 1 返回 nginx 403、路径 2 返回
// {"success":false,"message":"The request is illegal!"} —— 酷我需要浏览器指纹，
// 服务端直连拿不到。因此这里的实现是「协议正确、参数完整」，
// 在用户自己浏览器能通过的场景（或未来自建代理）才能拿到地址。

import { SourceError } from '../types';

export interface KuwoNativeOptions {
  /** 平台内歌曲 id（不带 MUSIC_ 前缀） */
  songId: string;
  /** 音质：128k / 320k / flac */
  quality?: string;
}

/** 洛雪音质 → 酷我 br 参数 */
export function kuwoBr(quality: string): string {
  switch (quality) {
    case '320k':
      return '320kmp3';
    case 'flac':
      return 'flac';
    case '128k':
    default:
      return '128kmp3';
  }
}

/** antiserver 取链地址（页面侧走 /native/kuwo 代理） */
export function buildKuwoAntiUrl(songId: string, quality = '128k'): string {
  const rid = songId.startsWith('MUSIC_') ? songId : `MUSIC_${songId}`;
  const br = kuwoBr(quality);
  const format = br === 'flac' ? 'flac' : 'mp3';
  return (
    `/native/kuwo/anti/s?type=convert_url3&rid=${encodeURIComponent(rid)}` +
    `&format=${format}&br=${br}`
  );
}

/** www 网页版取链地址 */
export function buildKuwoWwwUrl(songId: string, quality = '128k'): string {
  const rid = songId.startsWith('MUSIC_') ? songId : `MUSIC_${songId}`;
  return (
    `/native/kuwoWww/api/www/play/url?rid=${encodeURIComponent(rid)}` +
    `&br=${kuwoBr(quality)}&format=mp3`
  );
}

/** 从 antiserver / www 响应体里取播放地址 */
export function parseKuwoUrl(body: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (obj.success === false) return null;
  const url = obj.url;
  if (typeof url === 'string' && url) return url;
  // www 版把地址放在 data.url
  const inner = obj.data as Record<string, unknown> | undefined;
  if (inner && typeof inner.url === 'string' && inner.url) return inner.url;
  return null;
}

/**
 * 走代理请求酷我取链接口。
 * @param fetchImpl 可注入的 fetch（单测用）
 */
export async function fetchKuwoPlayUrl(
  options: KuwoNativeOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { songId, quality = '128k' } = options;
  const candidates = [buildKuwoAntiUrl(songId, quality), buildKuwoWwwUrl(songId, quality)];
  let lastError = '';
  for (const url of candidates) {
    let body = '';
    try {
      const resp = await fetchImpl(url, { headers: { Accept: 'application/json, text/plain, */*' } });
      body = await resp.text();
      if (!resp.ok) {
        lastError = `HTTP ${resp.status}`;
        continue;
      }
    } catch (e) {
      lastError = (e as Error).message;
      continue;
    }
    const playUrl = parseKuwoUrl(body);
    if (playUrl) return playUrl;
    lastError = '响应中没有播放地址';
  }
  throw new SourceError('NATIVE_FAILED', `酷我原生取链失败（${lastError || '无响应'}）`);
}
