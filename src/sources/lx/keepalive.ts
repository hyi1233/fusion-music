// src/sources/lx/keepalive.ts — Huibq/keep-alive render_api.js 加载器
//
// 洛雪音源脚本仓库：https://github.com/Huibq/keep-alive_api
// 线上服务地址：https://lxmusicapi.onrender.com （请求需带 X-Request-Key: share-v3）
// 该脚本在 globalThis.lx 环境里通过 lx.request 调远端 API，导出 getMusicUrl(source, songId, quality)。

export const RENDER_API_URL = 'https://lxmusicapi.onrender.com/render_api.js';
export const REQUEST_KEY_HEADER = 'X-Request-Key';
export const REQUEST_KEY_VALUE = 'share-v3';

let cachedScript: string | null = null;

/** 拉取（并缓存）音源脚本源码。失败抛 SourceError，message 可读。 */
export async function loadRenderApiScript(): Promise<string> {
  if (cachedScript) return cachedScript;
  const { httpText } = await import('../http');
  const { SourceError } = await import('../types');
  const { body } = await httpText(RENDER_API_URL, {
    headers: { [REQUEST_KEY_HEADER]: REQUEST_KEY_VALUE },
  });
  if (!/getMusicUrl/.test(body)) {
    throw new SourceError('SCRIPT_INVALID', '音源脚本内容异常（未找到 getMusicUrl 导出）');
  }
  cachedScript = body;
  return body;
}
