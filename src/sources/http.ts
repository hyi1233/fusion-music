// src/sources/http.ts — 音源层 HTTP：超时、状态码→可读错误

import { IpBanError, RateLimitError, SourceError } from './types';

export interface RawResp {
  status: number;
  body: string;
}

/** 带 UA 的 fetch，默认 8s 超时；非 2xx 统一抛 SourceError（403→封IP、429→限流） */
export async function httpText(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<RawResp> {
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        ...(rest.headers as Record<string, string> | undefined),
      },
    });
    const body = await resp.text();
    if (resp.status === 403) throw new IpBanError();
    if (resp.status === 429) throw new RateLimitError();
    if (!resp.ok) throw new SourceError('HTTP_ERROR', `音源请求失败（HTTP ${resp.status}）`);
    return { status: resp.status, body };
  } catch (e) {
    if (e instanceof SourceError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError')
      throw new SourceError('TIMEOUT', '音源请求超时，请检查网络后重试');
    throw new SourceError('NETWORK', '无法连接音源服务器，请检查网络');
  } finally {
    clearTimeout(timer);
  }
}

/** httpText + JSON.parse；平台返回非法 JSON 时抛 PARSE 错误 */
export async function httpJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { body } = await httpText(url, init);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new SourceError('PARSE', '音源返回了无法解析的数据');
  }
}
