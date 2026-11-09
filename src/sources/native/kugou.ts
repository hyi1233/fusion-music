// src/sources/native/kugou.ts — 酷狗原生取链
//
// 路径：
//   1) mobilecdn.kugou.com/api/v3/song/url?hash=<hash>&timelength=<ms>&format=mp3&bitrate=128
//      —— 移动端取链；该域名的 https 证书与域名不匹配，只能走 http
//   2) www.kugou.com/yy/index.php?r=play/getdata&hash=<hash>&duration=<ms>
//      —— 网页版取链，返回 {data:[{url, ...}]}
//
// 2026-11 实测（本机 IP）：路径 1 返回 "Access Deny ! No Actions !"（接口已下线或需签名），
// 路径 2 返回 {"data":[],"status":0,"err_code":20010}。
// 即酷狗原生取链当前不可用；这里按官方协议保留实现，
// 并在错误信息里明确说明，便于用户改用其他源。

import { SourceError } from '../types';

export interface KugouNativeOptions {
  /** 搜索结果里的 hash */
  hash: string;
  /** 时长（毫秒），酷狗接口用 ms */
  durationMs?: number;
  quality?: string;
}

/** 洛雪音质 → 酷狗 bitrate */
export function kugouBitrate(quality: string): number {
  switch (quality) {
    case '320k':
      return 320;
    case 'flac':
      return 0; // flac 无对应 bitrate，走默认
    case '128k':
    default:
      return 128;
  }
}

/** mobilecdn 取链地址 */
export function buildKugouMobileUrl(hash: string, durationMs = 0, quality = '128k'): string {
  const br = kugouBitrate(quality);
  const fmt = quality === 'flac' ? 'flac' : 'mp3';
  const bitrate = br > 0 ? `&bitrate=${br}` : '';
  return (
    `/native/kugou/api/v3/song/url?hash=${encodeURIComponent(hash)}` +
    `&timelength=${Math.max(0, Math.round(durationMs))}&format=${fmt}${bitrate}` +
    `&encryptType=0&support_key=1`
  );
}

/** www getdata 取链地址 */
export function buildKugouWwwUrl(hash: string, durationMs = 0): string {
  return (
    `/native/kugouWww/yy/index.php?r=play/getdata&hash=${encodeURIComponent(hash)}` +
    `&album_id=&duration=${Math.max(0, Math.round(durationMs))}`
  );
}

/** 从 getdata 响应里取播放地址 */
export function parseKugouWwwUrl(body: string): string | null {
  let data: { data?: Array<{ url?: string }>; status?: number };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    return null;
  }
  const url = data.data?.[0]?.url;
  return typeof url === 'string' && url ? url : null;
}

/** 从 mobilecdn 响应里取播放地址 */
export function parseKugouMobileUrl(body: string): string | null {
  let data: { url?: string; data?: { url?: string } };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    return null;
  }
  if (data.url) return data.url;
  if (data.data?.url) return data.data.url;
  return null;
}

/**
 * 走代理请求酷狗取链接口。
 * @param fetchImpl 可注入的 fetch（单测用）
 */
export async function fetchKugouPlayUrl(
  options: KugouNativeOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { hash, durationMs = 0, quality = '128k' } = options;
  const candidates: Array<{ url: string; parse: (b: string) => string | null }> = [
    { url: buildKugouMobileUrl(hash, durationMs, quality), parse: parseKugouMobileUrl },
    { url: buildKugouWwwUrl(hash, durationMs), parse: parseKugouWwwUrl },
  ];
  let lastError = '';
  for (const cand of candidates) {
    let body = '';
    try {
      const resp = await fetchImpl(cand.url, { headers: { Accept: 'application/json, text/plain, */*' } });
      body = await resp.text();
      if (!resp.ok) {
        lastError = `HTTP ${resp.status}`;
        continue;
      }
    } catch (e) {
      lastError = (e as Error).message;
      continue;
    }
    const url = cand.parse(body);
    if (url) return url;
    lastError = body.slice(0, 40) || '响应中没有播放地址';
  }
  throw new SourceError(
    'NATIVE_FAILED',
    `酷狗原生取链失败（${lastError || '无响应'}；酷狗取链接口已下线或需签名）`,
  );
}
