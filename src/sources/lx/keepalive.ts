// src/sources/lx/keepalive.ts — Huibq/keep-alive render_api.js 加载器
//
// 洛雪音源脚本仓库：https://github.com/Huibq/keep-alive_api
// 线上服务地址：https://lxmusicapi.onrender.com （请求需带 X-Request-Key: share-v3）
// 脚本走标准洛雪协议：on(EVENT_NAMES.request) 处理 action 'musicUrl'，send(inited) 就绪。

export const RENDER_API_ROOT = 'https://lxmusicapi.onrender.com';
export const REQUEST_KEY_HEADER = 'X-Request-Key';
export const REQUEST_KEY_VALUE = 'share-v3';

/** 自定义音源脚本地址的 localStorage 键（与设置页 store 保持一致） */
export const CUSTOM_SCRIPT_URL_KEY = 'fusion_lx_script_url';

let cachedScript: string | null = null;
let cachedCustomScript: { url: string; source: string } | null = null;

/**
 * 读取用户自定义音源脚本（设置页填写）。
 * 没填或内容非法时返回 null —— 调用方据此跳过这一路降级。
 */
export async function loadCustomScript(): Promise<string | null> {
  let url = '';
  try {
    if (typeof window !== 'undefined') {
      url = (window.localStorage.getItem(CUSTOM_SCRIPT_URL_KEY) ?? '').trim();
    }
  } catch {
    url = '';
  }
  if (!url) return null;
  if (cachedCustomScript?.url === url) return cachedCustomScript.source;

  const { httpText } = await import('../http');
  const { SourceError } = await import('../types');
  const { body } = await httpText(url);
  if (!/musicUrl/.test(body) || !/EVENT_NAMES/.test(body)) {
    throw new SourceError('SCRIPT_INVALID', '自定义音源脚本内容异常（未找到标准 musicUrl 协议）');
  }
  // 自定义脚本内部若引用默认 render_api，同样改写到本地代理，绕开浏览器 CORS
  const source = body.replaceAll(RENDER_API_ROOT, '/lxapi');
  cachedCustomScript = { url, source };
  return source;
}

/**
 * 拉取（并缓存）音源脚本源码。失败抛 SourceError，message 可读。
 *
 * 2026-11 实测两件事：
 * 1. /render_api.js 直接 GET 已 404，真实脚本地址在根路径 JSON 的 `script` 字段
 *    （jsDelivr 上的 keep-alive 仓库文件）；旧直链保留为回退。
 * 2. onrender.com 不返回 CORS 头，浏览器直连被拦 → dev 下根路径与脚本内的
 *    API_URL 都改写为 '/lxapi'，由 vite 代理转发（vite.config.ts server.proxy）。
 */
export async function loadRenderApiScript(): Promise<string> {
  if (cachedScript) return cachedScript;
  const { httpText } = await import('../http');
  const { SourceError } = await import('../types');
  const headers = { [REQUEST_KEY_HEADER]: REQUEST_KEY_VALUE };
  // 一律走本地 /lxapi 代理：onrender.com 不返回 CORS 头，浏览器直连会被拦
  const rootUrl = '/lxapi/';

  let scriptUrl = `${RENDER_API_ROOT}/render_api.js`;
  try {
    const root = await httpText(rootUrl, { headers });
    const parsed = JSON.parse(root.body) as { script?: string };
    if (parsed.script) scriptUrl = parsed.script;
  } catch {
    // 根路径失败就用旧直链兜底
  }

  const { body } = await httpText(scriptUrl, {
    headers:
      scriptUrl.startsWith('/lxapi') || scriptUrl.startsWith(RENDER_API_ROOT)
        ? headers // 只有音源 API 本体才要 key；jsDelivr 等 CDN 带 key 反而触发预检
        : {},
  });
  // 校验脚本走标准洛雪协议（request 事件 + musicUrl action），不再假设 getMusicUrl 全局导出
  if (!/musicUrl/.test(body) || !/EVENT_NAMES/.test(body)) {
    throw new SourceError('SCRIPT_INVALID', '音源脚本内容异常（未找到标准 musicUrl 协议）');
  }
  // dev 下把脚本内的 API 地址改写为本地代理路径，绕开浏览器 CORS
  cachedScript = body.replaceAll(RENDER_API_ROOT, '/lxapi');
  return cachedScript;
}
