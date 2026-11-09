// src/sources/index.ts — 音源层门面：搜索 → LX 取链接 → 交给播放内核
//
// 完整链路：searchAll() 拿到 SongSummary → toTrack() 进 UI/队列 →
// 播放时 resolvePlayUrl() 经洛雪沙箱 getMusicUrl 换真实流地址（按 id 前缀 kuwo:/kugou:/qq: 映射音源名）。

import { searchAll, toTrack } from './search';
import { SourceError } from './types';
import { resolvePlayUrlWithFallback, destroyAllSandboxes } from './resolve';
import type { SongSummary, Track } from './types';

export { searchAll, toTrack, platformName } from './search';
export { SourceError, RateLimitError, IpBanError } from './types';
export {
  resolvePlayUrlWithFallback,
  classifyError,
  ResolveAllFailedError,
  type ResolveAttempt,
  type ResolveResult,
} from './resolve';

/**
 * 解析可播放的音频流地址（多源降级）。
 *
 * 顺序：自带直链 → 用户自定义脚本 → 内置默认洛雪源 → 平台原生取链兜底。
 * 全失败时抛 ResolveAllFailedError，attempts 里带每个源失败的原因。
 */
export async function resolvePlayUrl(track: Track, quality = '128k'): Promise<string> {
  try {
    const result = await resolvePlayUrlWithFallback(track, quality);
    return result.url;
  } catch (e) {
    if (e instanceof SourceError) throw e;
    throw new SourceError('RESOLVE_FAILED', `获取播放链接失败：${(e as Error).message}`);
  }
}

export function destroySandbox() {
  destroyAllSandboxes();
}

export type { SongSummary, Track };
