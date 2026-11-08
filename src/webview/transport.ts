// src/webview/transport.ts
//
// WebView 里的那一半桥：把命令收进来，把事件发出去。
//
// 三种宿主形态都要能跑，因为同一份构建产物会被三种壳加载：
//   * React Native WebView（洛雪壳）：页面 → App 走 `window.ReactNativeWebView.postMessage(string)`；
//     App → 页面走 `injectJavaScript('window.__FOLIA_RECEIVE__(...)')`，或 Android 的 `window.postMessage`。
//   * iframe（桌面壳 / dev harness）：`parent.postMessage(event, '*')`，命令走 `message` 事件。
//   * 自定义 send（测试、Electron 预加载脚本注入的通道）。
//
// 安全边界：本页只接受"形状像命令"的消息；宿主不要用本页去加载不可信 iframe。
// 收到的事件都过 `parseBridgeCommand` 校验，坏消息回一条 error，不抛异常。

import {
    createBridgeEvent,
    FOLIA_BRIDGE_SOURCE,
    parseBridgeCommand,
    serializeBridgeEvent,
    type FoliaBridgeCommand,
    type FoliaBridgeEvent,
    type FoliaBridgeEventPayload,
} from '../merge/bridgeProtocol';

export type TransportKind = 'react-native' | 'iframe' | 'custom' | 'none';

export interface WebViewTransportOptions {
    /** 自定义发送端，优先于自动探测。 */
    send?: (event: FoliaBridgeEvent) => void;
    /** 命令解析失败时的回调（默认 console.warn）。 */
    onParseError?: (error: string, raw: unknown) => void;
}

export interface WebViewTransport {
    kind: TransportKind;
    /** 发一条事件给宿主（自动补 source/version）。 */
    send(payload: FoliaBridgeEventPayload): void;
    /** 订阅宿主命令；返回取消订阅函数。 */
    onCommand(handler: (command: FoliaBridgeCommand) => void): () => void;
    /** 拆掉全局钩子与监听器。 */
    dispose(): void;
}

interface ReactNativeWebViewLike {
    postMessage?: (message: string) => void;
}

const getReactNativeWebView = (win: Window): ReactNativeWebViewLike | null => {
    const candidate = (win as unknown as { ReactNativeWebView?: ReactNativeWebViewLike }).ReactNativeWebView;
    return candidate && typeof candidate.postMessage === 'function' ? candidate : null;
};

/** 自动判定当前宿主形态；只读探测，不产生副作用。 */
export const detectTransportKind = (win: Window): TransportKind => {
    if (getReactNativeWebView(win)) return 'react-native';
    if (win.parent && win.parent !== win) return 'iframe';
    return 'none';
};

export const createWebViewTransport = (
    win: Window = window,
    options: WebViewTransportOptions = {},
): WebViewTransport => {
    const kind: TransportKind = options.send ? 'custom' : detectTransportKind(win);
    const rn = getReactNativeWebView(win);
    const handlers = new Set<(command: FoliaBridgeCommand) => void>();
    const seenEvents = new WeakSet<Event>();

    const dispatchRaw = (raw: unknown) => {
        // iframe 形态下 `parent.postMessage` 在 parent === self 时会被自己收到（jsdom、
        // 单窗口调试页）。本页发出的事件带 source 标记，直接丢掉，别当成命令。
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const record = raw as Record<string, unknown>;
            if (record.source === FOLIA_BRIDGE_SOURCE) return;
        }
        const result = parseBridgeCommand(raw);
        if (!result.ok) {
            options.onParseError?.(result.error, raw);
            return;
        }
        for (const handler of handlers) handler(result.command);
    };

    const send = (payload: FoliaBridgeEventPayload) => {
        const event = createBridgeEvent(payload);
        if (options.send) {
            options.send(event);
            return;
        }
        if (kind === 'react-native' && rn?.postMessage) {
            rn.postMessage(serializeBridgeEvent(event));
            return;
        }
        if (kind === 'iframe') {
            win.parent.postMessage(event, '*');
        }
    };

    const onMessage = (event: MessageEvent) => {
        // Android 的 document 与 window 都会派发同一个 message 事件，去重。
        if (seenEvents.has(event)) return;
        seenEvents.add(event);
        dispatchRaw(event.data);
    };

    win.addEventListener('message', onMessage);
    // 部分 Android WebView 版本只在 document 上派发 `window.postMessage`。
    win.document?.addEventListener?.('message', onMessage as EventListener);

    // RN 的 injectJavaScript 通道：`window.__FOLIA_RECEIVE__('<json>')`。
    const receive = (payload: unknown) => dispatchRaw(payload);
    const globalRecord = win as unknown as Record<string, unknown>;
    const previousReceive = globalRecord.__FOLIA_RECEIVE__;
    globalRecord.__FOLIA_RECEIVE__ = receive;

    return {
        kind,
        send,
        onCommand(handler) {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },
        dispose() {
            handlers.clear();
            win.removeEventListener('message', onMessage);
            win.document?.removeEventListener?.('message', onMessage as EventListener);
            if (previousReceive === undefined) delete globalRecord.__FOLIA_RECEIVE__;
            else globalRecord.__FOLIA_RECEIVE__ = previousReceive;
        },
    };
};
