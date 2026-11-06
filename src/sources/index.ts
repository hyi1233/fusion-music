// src/sources/index.ts — 音源层门面：搜索 → LX 取链接 → 交给播放内核
//
// 完整链路：searchAll() 拿到 SongSummary → toTrack() 进 UI/队列 →
// 播放时 resolvePlayUrl() 经洛雪沙箱 getMusicUrl 换真实流地址（按 id 前缀 kuwo:/kugou:/qq: 映射音源名）。

import { createLxSandbox } from './lx/runner';
import { loadRenderApiScript } from './lx/keepalive';
import { searchAll, toTrack } from './search';
import { SourceError } from './types';
import type { SongSummary, Track } from './types';

export { searchAll, toTrack, platformName } from './search';
export { SourceError, RateLimitError, IpBanError } from './types';

let sandbox: Awaited<ReturnType<typeof createLxSandbox>> | null = null;
let sandboxPromise: Promise<Awaited<ReturnType<typeof createLxSandbox>>> | null = null;

/** 懒初始化洛雪沙箱（脚本只拉一次） */
async function getSandbox() {
  if (sandbox) return sandbox;
  sandboxPromise ??= (async () => {
    const script = await loadRenderApiScript();
    sandbox = await createLxSandbox({
      script,
      onEvent: () => {},
      onInited: () => {},
      onError: (err) => console.warn('[lx] 脚本错误:', err),
    });
    return sandbox;
  })();
  const s = await sandboxPromise;
  if (!s) throw new SourceError('SANDBOX', '洛雪音源沙箱初始化失败');
  return s;
}

/** Track.id 前缀 → 洛雪 source 名 */
function lxSourceOf(track: Track): string {
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

/**
 * 解析可播放的音频流地址。
 * 封 IP / 限流 / 脚本错误都转为可读 SourceError。
 */
export async function resolvePlayUrl(track: Track, quality = '128k'): Promise<string> {
  if (track.url) return track.url;
  try {
    const sb = await getSandbox();
    const { url } = await sb.getMusicUrl(lxSourceOf(track), track.id.split(':')[1] ?? track.id, quality);
    if (!url) throw new SourceError('NO_URL', '音源未返回播放地址');
    return url;
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError('RESOLVE_FAILED', `获取播放链接失败：${(e as Error).message}`);
  }
}

export function destroySandbox() {
  sandbox?.destroy();
  sandbox = null;
  sandboxPromise = null;
}

export type { SongSummary, Track };
