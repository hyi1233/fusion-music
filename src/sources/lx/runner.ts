// src/sources/lx/runner.ts — 洛雪音源脚本运行器（iframe 沙箱）
//
// 音源脚本依赖 globalThis.lx 的子集：
//   lx.request(method, { url, method, headers, body, form }, callback) → HTTP（宿主代理）
//   lx.on(EVENT_NAMES.inited, handler) / lx.send(event, payload)       → 事件
//   lx.env / lx.utils / lx.version / lx.EVENT_NAMES                    → 环境
//
// 实现方式：隐藏 iframe（sandbox="allow-scripts"）承载脚本，postMessage 桥接。
// 脚本调用 lx.request 时由宿主 fetch 代理并把结果回传。

export const LX_EVENT_NAMES = {
  request: 'request',
  inited: 'inited',
  updateAlert: 'updateAlert',
} as const;

export interface LxSandboxBridge {
  script: string;
  onEvent(name: string, payload: unknown): void;
  onInited(info: unknown): void;
  onError(err: string): void;
}

interface ReqOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  form?: Record<string, string>;
}

const IFRAME_BOOTSTRAP = String.raw`
'use strict';
var __seq = 0;
var __pending = new Map();
var __initedHandler = null;
var __reqHandler = null;
globalThis.lx = {
  version: '2.0.0',
  env: 'web',
  EVENT_NAMES: __EVENT_NAMES__,
  request: function (url, options, callback) {
    var id = ++__seq;
    __pending.set(id, callback);
    window.parent.postMessage({ type: 'lx:request', id: id, options: Object.assign({}, options, { url: url }) }, '*');
  },
  on: function (event, handler) {
    if (event === 'inited') __initedHandler = handler;
    if (event === 'request') __reqHandler = handler;
  },
  send: function (event, payload) {
    window.parent.postMessage({ type: 'lx:send', event: event, payload: payload }, '*');
  },
  utils: {
    buffer: { from: function (s) { return s; }, bufToString: function (b) { return String(b); } },
    crypto: {},
    zlib: {},
  },
};
window.addEventListener('message', function (ev) {
  var m = ev.data || {};
  if (m.type === 'lx:request-result') {
    var cb = __pending.get(m.id);
    if (cb) {
      __pending.delete(m.id);
      cb(m.error ? new Error(m.error) : null, m.resp, m.resp && m.resp.body);
    }
  } else if (m.type === 'lx:gmurl') {
    // 标准洛雪协议：调脚本注册的 request 处理器（action musicUrl）
    Promise.resolve()
      .then(function () {
        var h = __reqHandler;
        if (typeof h !== 'function') throw new Error('音源脚本未注册 request 处理器');
        return h({ action: 'musicUrl', source: m.source, info: { type: m.quality, musicInfo: { hash: m.songId, songmid: m.songId } } });
      })
      .then(function (r) {
        var url = typeof r === 'string' ? r : (r && r.url);
        window.parent.postMessage({ type: 'lx:gmurl-result', url: url }, '*');
      })
      .catch(function (e) {
        window.parent.postMessage({ type: 'lx:gmurl-result', error: String(e && e.message || e) }, '*');
      });
  }
});
try {
  __SOURCE_SCRIPT__
  if (typeof __initedHandler === 'function') {
    __initedHandler({ status: true });
  }
} catch (e) {
  window.parent.postMessage({ type: 'lx:error', message: String(e && e.message || e) }, '*');
}
`;

export interface LxSandbox {
  getMusicUrl(source: string, songId: string, quality: string): Promise<{ url: string }>;
  destroy(): void;
}

/** 创建洛雪音源沙箱；脚本 inited 后 resolve，失败/超时 reject。 */
export function createLxSandbox(bridge: LxSandboxBridge): Promise<LxSandbox> {
  const pending = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: number }>();
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('sandbox', 'allow-scripts');
  document.body.appendChild(iframe);

  const destroy = () => {
    window.removeEventListener('message', onMessage);
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
    iframe.remove();
  };

  // onMessage 在 Promise 构造之前就绑定，init/resolve 句柄先声明后赋值
  let initTimer = 0;
  let resolveSandboxFn: (v: LxSandbox) => void = () => {};
  let rejectSandboxFn: (e: Error) => void = () => {};

  const onMessage = (ev: MessageEvent) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data as { type: string; [k: string]: unknown };
    switch (msg.type) {
      case 'lx:request': {
        const id = msg.id as number;
        const opt = msg.options as ReqOptions;
        const entry: { resolve: (r: unknown) => void; reject: (e: Error) => void; timer: number } = {
          resolve: () => {},
          reject: () => {},
          timer: 0,
        };
        entry.resolve = (r) => iframe.contentWindow?.postMessage({ type: 'lx:request-result', id, resp: r }, '*');
        entry.reject = (e) => iframe.contentWindow?.postMessage({ type: 'lx:request-result', id, error: e.message }, '*');
        entry.timer = window.setTimeout(() => {
          pending.delete(id);
          entry.reject(new Error(`音源请求超时: ${opt.url}`));
        }, 12000);
        pending.set(id, entry);
        fetch(opt.url, {
          method: opt.method ?? 'GET',
          headers: {
            ...(opt.headers ?? {}),
            ...(opt.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          },
          body: opt.form ? new URLSearchParams(opt.form).toString() : (opt.body ?? undefined),
        })
          .then(async (resp) => {
            const headers: Record<string, string> = {};
            resp.headers.forEach((v, k) => (headers[k] = v));
            let body: string | unknown = await resp.text();
            // 洛雪源脚本普遍直接读 body.code/body.url —— JSON 响应自动 parse
            if (typeof body === 'string' && /json/i.test(headers['content-type'] ?? '')) {
              try {
                body = JSON.parse(body);
              } catch {
                /* 保持原文 */
              }
            }
            return { status: resp.status, headers, body };
          })
          .then(entry.resolve, entry.reject)
          .finally(() => {
            clearTimeout(entry.timer);
            pending.delete(id);
          });
        break;
      }
      case 'lx:send':
        // 标准洛雪脚本用 send(EVENT_NAMES.inited) 报告就绪 → 视为沙箱初始化完成
        if (msg.event === 'inited') {
          clearTimeout(initTimer);
          bridge.onEvent('inited', msg.payload);
          resolveSandboxFn({
            getMusicUrl: makeGmurl(iframe),
            destroy,
          });
          break;
        }
        bridge.onEvent(msg.event as string, msg.payload);
        break;
      case 'lx:inited':
        bridge.onInited(msg.info);
        break;
      case 'lx:error':
        bridge.onError(String(msg.message));
        break;
      case 'lx:gmurl-result': {
        if (msg.error) rejectGmurl(new Error(String(msg.error)));
        else resolveGmurl({ url: String(msg.url) });
        break;
      }
    }
  };

  let resolveGmurl: (r: { url: string }) => void = () => {};
  let rejectGmurl: (e: Error) => void = () => {};

  window.addEventListener('message', onMessage);

  return new Promise((resolveSandbox, rejectSandbox) => {
    resolveSandboxFn = resolveSandbox;
    rejectSandboxFn = rejectSandbox;
    const fail = (err: Error) => {
      clearTimeout(initTimer);
      destroy();
      rejectSandbox(err);
    };
    initTimer = window.setTimeout(() => fail(new Error('洛雪音源脚本初始化超时（15s）')), 15000) as unknown as number;

    // 用 srcdoc 注入脚本：sandbox="allow-scripts" 的 iframe 处于不透明源，
    // 父页面读不到 iframe.contentDocument（真实浏览器同样如此），所以不能走
    // contentDocument.write。srcdoc 属于 iframe 自身的文档，可正常执行脚本，
    // 且脚本内 window.parent.postMessage 仍能跨源通信。
    const injected = IFRAME_BOOTSTRAP
      .replace('__EVENT_NAMES__', JSON.stringify(LX_EVENT_NAMES))
      .replace('__SOURCE_SCRIPT__', () => escapeScript(bridge.script));
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${injected}<\/script></body></html>`;
  });
}

/** 防止脚本内容里的 </script> 提前闭合 srcdoc 中的 script 标签 */
function escapeScript(src: string): string {
  return src.replace(/<\/(script)/gi, '<\\/$1');
}

/** 构造 getMusicUrl：postMessage 进沙箱，等 lx:gmurl-result 回来 */
function makeGmurl(iframe: HTMLIFrameElement) {
  let resolveGmurl: (r: { url: string }) => void = () => {};
  let rejectGmurl: (e: Error) => void = () => {};
  window.addEventListener('message', (ev) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data as { type?: string; error?: string; url?: string };
    if (msg?.type === 'lx:gmurl-result') {
      if (msg.error) rejectGmurl(new Error(msg.error));
      else resolveGmurl({ url: String(msg.url) });
    }
  });
  return (source: string, songId: string, quality: string) =>
    new Promise<{ url: string }>((resolve, reject) => {
      resolveGmurl = resolve;
      rejectGmurl = reject;
      iframe.contentWindow?.postMessage({ type: 'lx:gmurl', source, songId, quality }, '*');
    });
}
