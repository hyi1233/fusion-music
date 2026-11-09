// src/sources/lx/scriptSource.ts — 自定义音源脚本（洛雪协议）的读取与连通性测试
//
// 用户可以在设置页里填自己的洛雪音源脚本地址。地址留空时走默认脚本
// （Huibq/keep-alive 的 render_api.js，见 keepalive.ts）。
//
// 判定脚本可用沿用 keepalive.ts 的标准：脚本里必须出现 request 事件监听与
// 'musicUrl' action，否则洛雪沙箱拿不到播放地址。

import { httpText } from '../http';
import { SourceError } from '../types';

export const DEFAULT_SCRIPT_URL = '';

/** 自定义脚本地址的 localStorage 键（与设置页 store 保持一致） */
export const SCRIPT_URL_STORAGE_KEY = 'fusion_lx_script_url';

/** 脚本地址是否是合法的 http(s) 地址（允许空串 = 用默认脚本）。 */
export function isValidScriptUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 测试脚本地址是否可用。
 * 返回 {ok, message}，不抛异常（设置页只需要一个可读的结论）。
 */
export async function testAudioSourceScript(url: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: true, message: 'default script' };
  if (!isValidScriptUrl(trimmed)) return { ok: false, message: 'invalid url' };

  try {
    const { body } = await httpText(trimmed, { timeoutMs: 8000 });
    if (!/musicUrl/.test(body) || !/EVENT_NAMES/.test(body)) {
      return { ok: false, message: 'not a standard LX script' };
    }
    return { ok: true, message: `ok (${body.length} bytes)` };
  } catch (e) {
    const message = e instanceof SourceError ? e.message : (e as Error).message;
    return { ok: false, message: message || 'request failed' };
  }
}
