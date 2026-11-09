// src/sources/resolve.ts — 播放地址解析的多源降级链
//
// 目标：任何一条路拿到地址就能播；每条路失败都记录原因，最后汇总给 UI。
//
// 降级顺序：
//   1) Track 自带 url（本地文件/直链）
//   2) 用户自定义洛雪音源脚本（设置页填写）
//   3) 内置默认洛雪音源脚本（Huibq/keep-alive render_api）
//   4) 平台原生取链兜底（酷我 / QQ / 酷狗，走 /native 代理）
//
// 失败原因分类（用于错误条展示）：
//   IP_BANNED  上游按 IP 封禁
//   RATE_LIMITED  平台频控
//   HTTP_x    上游 HTTP 状态异常
//   NO_URL    音源返回了但没有地址
//   OTHER     其它（网络/协议/脚本错误）

import { createLxSandbox } from './lx/runner';
import { loadRenderApiScript, loadCustomScript } from './lx/keepalive';
import { fetchKuwoPlayUrl } from './native/kuwo';
import { fetchQqPlayUrl } from './native/qq';
import { fetchKugouPlayUrl } from './native/kugou';
import { IpBanError, RateLimitError, SourceError } from './types';
import type { Track } from './types';

export type ResolveSourceId = 'direct' | 'custom' | 'default' | 'native';

export interface ResolveAttempt {
  /** 尝试的源名称（用户可读，兜底用） */
  source: string;
  /** 稳定标识（UI 用它做 i18n） */
  id: ResolveSourceId;
  ok: boolean;
  /** 失败原因（成功时为空） */
  reason?: string;
  /** 机器码，便于 UI 分类 */
  code?: string;
}

export interface ResolveResult {
  url: string;
  /** 实际成功的源名称 */
  source: string;
  /** 全链路尝试记录 */
  attempts: ResolveAttempt[];
}

export class ResolveAllFailedError extends SourceError {
  attempts: ResolveAttempt[];
  constructor(attempts: ResolveAttempt[], message: string) {
    super('ALL_SOURCES_FAILED', message);
    this.name = 'ResolveAllFailedError';
    this.attempts = attempts;
  }
}

/** 把异常归类成「原因 + 机器码」 */
export function classifyError(e: unknown): { reason: string; code: string } {
  if (e instanceof IpBanError) return { reason: e.message, code: e.code };
  if (e instanceof RateLimitError) return { reason: e.message, code: e.code };
  if (e instanceof SourceError) return { reason: e.message, code: e.code };
  const err = e as Error;
  const msg = err?.message ?? String(e);
  if (/403|forbidden/i.test(msg)) return { reason: '上游拒绝访问（HTTP 403，可能被封 IP）', code: 'IP_BANNED' };
  if (/429|too many/i.test(msg)) return { reason: '请求过于频繁（HTTP 429）', code: 'RATE_LIMITED' };
  if (/404/i.test(msg)) return { reason: '接口不存在（HTTP 404）', code: 'HTTP_404' };
  return { reason: msg || '未知错误', code: 'OTHER' };
}

/** Track.id 前缀 → 洛雪 source 名 */
export function lxSourceOf(track: Track): string {
  const [plat] = track.id.split(':');
  switch (plat) {
    case 'kuwo':
      return 'kw';
    case 'kugou':
      return 'kg';
    case 'qq':
      return 'tx';
    default:
      throw new SourceError('UNKNOWN_SOURCE', `未知音源: ${track.id}`);
  }
}

/** Track.id 前缀 → 平台名（原生取链用） */
export function platformOf(track: Track): 'kuwo' | 'kugou' | 'qq' {
  const [plat] = track.id.split(':');
  if (plat === 'kuwo' || plat === 'kugou' || plat === 'qq') return plat;
  throw new SourceError('UNKNOWN_SOURCE', `未知音源: ${track.id}`);
}

/** Track.id 前缀 → 平台内歌曲 id */
export function songIdOf(track: Track): string {
  return track.id.split(':')[1] ?? track.id;
}

type Sandbox = Awaited<ReturnType<typeof createLxSandbox>>;

const sandboxCache = new Map<string, Promise<Sandbox>>();

/** 懒初始化洛雪沙箱（按脚本内容缓存，一个脚本一个沙箱） */
function getSandboxFor(script: string): Promise<Sandbox> {
  let p = sandboxCache.get(script);
  if (!p) {
    p = (async () =>
      createLxSandbox({
        script,
        onEvent: () => {},
        onInited: () => {},
        onError: (err) => console.warn('[lx] 脚本错误:', err),
      }))();
    sandboxCache.set(script, p);
  }
  return p;
}

/** 用某个洛雪脚本取播放地址 */
async function resolveViaScript(
  script: string,
  source: string,
  songId: string,
  quality: string,
): Promise<string> {
  const sb = await getSandboxFor(script);
  const { url } = await sb.getMusicUrl(source, songId, quality);
  if (!url) throw new SourceError('NO_URL', '音源未返回播放地址');
  return url;
}

/**
 * 平台原生取链兜底。
 * @param fetchImpl 可注入的 fetch（单测用）
 */
export async function resolveNative(
  track: Track,
  quality: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const plat = platformOf(track);
  const songId = songIdOf(track);
  if (plat === 'kuwo') return fetchKuwoPlayUrl({ songId, quality }, fetchImpl);
  if (plat === 'qq') return fetchQqPlayUrl({ songMid: songId, quality }, fetchImpl);
  return fetchKugouPlayUrl(
    { hash: songId, durationMs: Math.round((track.duration || 0) * 1000), quality },
    fetchImpl,
  );
}

export interface ResolveOptions {
  /** 可注入的 fetch（单测用） */
  fetchImpl?: typeof fetch;
  /** 可注入的「自定义脚本加载器」（单测用） */
  loadCustomScriptImpl?: () => Promise<string | null>;
  /** 可注入的「默认脚本加载器」（单测用） */
  loadDefaultScriptImpl?: () => Promise<string>;
  /** 可注入的「洛雪脚本取链执行器」（单测用，默认走 iframe 沙箱） */
  scriptResolver?: (script: string, source: string, songId: string, quality: string) => Promise<string>;
}

/**
 * 多源降级解析播放地址。
 * @param track 曲目
 * @param quality 音质
 * @param options 可注入的依赖（单测用）
 */
export async function resolvePlayUrlWithFallback(
  track: Track,
  quality = '128k',
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const customLoader = options.loadCustomScriptImpl ?? loadCustomScript;
  const defaultLoader = options.loadDefaultScriptImpl ?? loadRenderApiScript;
  const runScript = options.scriptResolver ?? resolveViaScript;
  const attempts: ResolveAttempt[] = [];

  // 1) 自带 url
  if (track.url) {
    attempts.push({ source: '直链', ok: true, id: 'direct' });
    return { url: track.url, source: '直链', attempts };
  }

  const songId = songIdOf(track);
  const lxSource = lxSourceOf(track);

  // 2) 用户自定义脚本
  let custom: string | null = null;
  try {
    custom = await customLoader();
  } catch (e) {
    const { reason, code } = classifyError(e);
    attempts.push({ source: '自定义脚本', ok: false, reason, code, id: 'custom' });
  }
  if (custom) {
    try {
      const url = await runScript(custom, lxSource, songId, quality);
      attempts.push({ source: '自定义脚本', ok: true, id: 'custom' });
      return { url, source: '自定义脚本', attempts };
    } catch (e) {
      const { reason, code } = classifyError(e);
      attempts.push({ source: '自定义脚本', ok: false, reason, code, id: 'custom' });
    }
  }

  // 3) 内置默认脚本
  try {
    const script = await defaultLoader();
    const url = await runScript(script, lxSource, songId, quality);
    attempts.push({ source: '默认洛雪源', ok: true, id: 'default' });
    return { url, source: '默认洛雪源', attempts };
  } catch (e) {
    const { reason, code } = classifyError(e);
    attempts.push({ source: '默认洛雪源', ok: false, reason, code, id: 'default' });
  }

  // 4) 平台原生兜底
  try {
    const url = await resolveNative(track, quality, fetchImpl);
    attempts.push({ source: `${platformOf(track)} 原生接口`, ok: true, id: 'native' });
    return { url, source: `${platformOf(track)} 原生接口`, attempts };
  } catch (e) {
    const { reason, code } = classifyError(e);
    attempts.push({ source: `${platformOf(track)} 原生接口`, ok: false, reason, code, id: 'native' });
  }

  const detail = attempts.map(a => `${a.source}：${a.reason ?? '失败'}`).join('；');
  throw new ResolveAllFailedError(attempts, `所有音源都取不到播放地址（${detail}）`);
}

/** 销毁所有沙箱（切歌/退出时用） */
export function destroyAllSandboxes(): void {
  for (const p of sandboxCache.values()) {
    p.then(sb => sb.destroy()).catch(() => {});
  }
  sandboxCache.clear();
}
