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
globalThis.lx = {
  version: '2.0.0',
  env: 'web',
  EVENT_NAMES: __EVENT_NAMES__,
  request: function (method, options, callback) {
    var id = ++__seq;
    __pending.set(id, callback);
    window.parent.postMessage({ type: 'lx:request', id: id, options: Object.assign({}, options, { method: method }) }, '*');
  },
  on: function (event, handler) { if (event === 'inited') __initedHandler = handler; },
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
    Promise.resolve()
      .then(function () {
        var fn = globalThis.getMusicUrl;
        if (typeof fn !== 'function') throw new Error('音源脚本未导出 getMusicUrl');
        return fn(m.source, m.songId, m.quality);
      })
      .then(function (r) {
        window.parent.postMessage({ type: 'lx:gmurl-result', url: r && r.url }, '*');
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
  } else {
    window.parent.postMessage({ type: 'lx:inited', info: { status: true } }, '*');
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
  iframe.src = 'about:blank';
  document.body.appendChild(iframe);

  const destroy = () => {
    window.removeEventListener('message', onMessage);
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
    iframe.remove();
  };

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
            return { status: resp.status, headers, body: await resp.text() };
          })
          .then(entry.resolve, entry.reject)
          .finally(() => {
            clearTimeout(entry.timer);
            pending.delete(id);
          });
        break;
      }
      case 'lx:send':
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
    const fail = (err: Error) => {
      clearTimeout(initTimer);
      destroy();
      rejectSandbox(err);
    };
    const initTimer = window.setTimeout(() => fail(new Error('洛雪音源脚本初始化超时（15s）')), 15000);

    iframe.addEventListener('load', () => {
      const doc = iframe.contentDocument;
      if (!doc) return fail(new Error('无法创建音源沙箱 iframe'));
      const injected = IFRAME_BOOTSTRAP
        .replace('__EVENT_NAMES__', JSON.stringify(LX_EVENT_NAMES))
        .replace('__SOURCE_SCRIPT__', bridge.script);
      doc.open();
      doc.write(`<!doctype html><script>${injected}<\/script>`);
      doc.close();
    });

    // inited 后 resolve；onInited 只在脚本侧 inited 成功时触发
    const origOnInited = bridge.onInited;
    bridge.onInited = (info) => {
      clearTimeout(initTimer);
      origOnInited(info);
      resolveSandbox({
        getMusicUrl: (source, songId, quality) =>
          new Promise((resolve, reject) => {
            resolveGmurl = resolve;
            rejectGmurl = reject;
            iframe.contentWindow?.postMessage({ type: 'lx:gmurl', source, songId, quality }, '*');
          }),
        destroy,
      });
    };
  });
}
