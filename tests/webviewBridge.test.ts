import { describe, it, expect, vi } from 'vitest';
import {
    createBridgeEvent,
    FOLIA_BRIDGE_SOURCE,
    FOLIA_BRIDGE_VERSION,
    MAX_BRIDGE_LINES,
    parseBridgeCommand,
    serializeBridgeEvent,
} from '../src/merge/bridgeProtocol';
import { createWebViewTransport, detectTransportKind } from '../src/webview/transport';
import { clockTimeAt, createPlaybackClock, syncPlaybackClock } from '../src/webview/playbackClock';
import { readPageOptions, resolveMode } from '../src/webview/pageOptions';

describe('parseBridgeCommand', () => {
    it('接受 JSON 字符串（RN postMessage 常规形态）', () => {
        const result = parseBridgeCommand(JSON.stringify({ type: 'setCurrentTime', time: 12.5 }));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.command).toEqual({ type: 'setCurrentTime', time: 12.5 });
    });

    it('接受对象（iframe / injectJavaScript 形态）', () => {
        const result = parseBridgeCommand({ type: 'showControls', visible: false });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.command).toEqual({ type: 'showControls', visible: false });
    });

    it('坏 JSON / 非对象 / 缺 type 都返回错误而不抛', () => {
        expect(parseBridgeCommand('{oops')).toEqual({ ok: false, error: 'invalid-json' });
        expect(parseBridgeCommand(42)).toEqual({ ok: false, error: 'not-an-object' });
        expect(parseBridgeCommand([{ type: 'setMode', mode: 'hanabi' }])).toEqual({ ok: false, error: 'not-an-object' });
        expect(parseBridgeCommand({})).toEqual({ ok: false, error: 'missing-type' });
    });

    it('setLines 把洛雪行转换成 Folia 行', () => {
        const result = parseBridgeCommand({
            type: 'setLines',
            lines: [
                { time: 0, text: '第一行' },
                { time: 2, text: '第二行' },
            ],
            duration: 200,
            songTitle: '夜に駆ける',
            songArtist: 'YOASOBI',
            theme: { primaryColor: '#ff0000', fontStyle: 'serif', bogus: 1 },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const command = result.command;
        if (command.type !== 'setLines') throw new Error('type mismatch');
        expect(command.format).toBe('lx');
        expect(command.dropped).toBe(0);
        expect(command.lines).toHaveLength(2);
        expect(command.lines[0].words.length).toBe(3);
        expect(command.duration).toBe(200);
        expect(command.songTitle).toBe('夜に駆ける');
        expect(command.theme).toEqual({ primaryColor: '#ff0000', fontStyle: 'serif' });
    });

    it('setLines 拒绝非数组与超量行', () => {
        expect(parseBridgeCommand({ type: 'setLines', lines: 'nope' })).toEqual({ ok: false, error: 'setLines:lines-not-array' });
        const huge = new Array(MAX_BRIDGE_LINES + 1).fill({ time: 0, text: 'a' });
        expect(parseBridgeCommand({ type: 'setLines', lines: huge })).toEqual({ ok: false, error: 'setLines:too-many-lines' });
    });

    it('setCurrentTime 夹紧负数、过滤非法 duration', () => {
        const negative = parseBridgeCommand({ type: 'setCurrentTime', time: -3, duration: 0, playing: false });
        expect(negative.ok).toBe(true);
        if (negative.ok) expect(negative.command).toEqual({ type: 'setCurrentTime', time: 0, playing: false });
        expect(parseBridgeCommand({ type: 'setCurrentTime', time: Number.NaN })).toEqual({
            ok: false,
            error: 'setCurrentTime:time-not-finite',
        });
    });

    it('setMode 校验空值与长度', () => {
        expect(parseBridgeCommand({ type: 'setMode', mode: '  ' })).toEqual({ ok: false, error: 'setMode:mode-empty' });
        expect(parseBridgeCommand({ type: 'setMode', mode: 'x'.repeat(65) })).toEqual({ ok: false, error: 'setMode:mode-too-long' });
        const ok = parseBridgeCommand({ type: 'setMode', mode: ' hanabi ' });
        if (ok.ok) expect(ok.command).toEqual({ type: 'setMode', mode: 'hanabi' });
    });

    it('showControls 要求布尔，未知命令报 unknown-type', () => {
        expect(parseBridgeCommand({ type: 'showControls', visible: 'yes' })).toEqual({
            ok: false,
            error: 'showControls:visible-not-boolean',
        });
        expect(parseBridgeCommand({ type: 'nope' })).toEqual({ ok: false, error: 'unknown-type:nope' });
    });

    it('事件带 source/version，序列化为 JSON 字符串', () => {
        const event = createBridgeEvent({ type: 'ready', mode: 'hanabi', modes: ['hanabi'], hasLines: false });
        expect(event.source).toBe(FOLIA_BRIDGE_SOURCE);
        expect(event.version).toBe(FOLIA_BRIDGE_VERSION);
        expect(JSON.parse(serializeBridgeEvent(event))).toMatchObject({
            type: 'ready',
            source: FOLIA_BRIDGE_SOURCE,
            version: FOLIA_BRIDGE_VERSION,
        });
    });
});

describe('playbackClock', () => {
    it('播放中按本地时间推进', () => {
        const state = createPlaybackClock(10, 0, true);
        expect(clockTimeAt(state, 500)).toBeCloseTo(10.5);
    });

    it('暂停冻结', () => {
        const state = createPlaybackClock(10, 0, false);
        expect(clockTimeAt(state, 5000)).toBe(10);
    });

    it('小漂移只吸收一部分，大漂移直接吸附', () => {
        const playing = createPlaybackClock(10, 0, true);
        const small = syncPlaybackClock(playing, 10.1, { nowMs: 1000, playing: true });
        // 预测 11.0，目标 10.1，漂移 -0.9 → 超过阈值 → 吸附
        expect(small.time).toBe(10.1);

        const near = syncPlaybackClock(playing, 11.2, { nowMs: 1000, playing: true });
        // 预测 11.0，漂移 0.2 → 吸收 25% → 11.05
        expect(near.time).toBeCloseTo(11.05);
        expect(near.at).toBe(1000);
    });

    it('暂停命令把时钟钉在目标位置', () => {
        const state = syncPlaybackClock(createPlaybackClock(10, 0, true), 42, { nowMs: 500, playing: false });
        expect(state.playing).toBe(false);
        expect(clockTimeAt(state, 9000)).toBe(42);
    });

    it('duration 封顶', () => {
        const state = syncPlaybackClock(createPlaybackClock(0, 0, true), 500, { nowMs: 1000, duration: 200 });
        expect(state.time).toBe(200);
        expect(clockTimeAt(state, 10000)).toBe(200);
    });
});

describe('pageOptions', () => {
    it('默认值', () => {
        expect(readPageOptions('')).toEqual({
            demo: false,
            mode: undefined,
            controls: true,
            tapToggle: false,
            title: undefined,
            artist: undefined,
        });
    });

    it('解析 query', () => {
        const options = readPageOptions('?demo=1&mode=hanabi&controls=0&tap=1&title=%E5%A4%9C&artist=YOASOBI');
        expect(options).toMatchObject({ demo: true, mode: 'hanabi', controls: false, tapToggle: true, title: '夜', artist: 'YOASOBI' });
    });

    it('controls=false/off 也认', () => {
        expect(readPageOptions('controls=false').controls).toBe(false);
        expect(readPageOptions('controls=off').controls).toBe(false);
        expect(readPageOptions('controls=1').controls).toBe(true);
    });

    it('resolveMode 只认内建模式', () => {
        expect(resolveMode('hanabi')).toBe('hanabi');
        expect(resolveMode('nope')).toBeNull();
        expect(resolveMode(undefined)).toBeNull();
        expect(resolveMode('')).toBeNull();
    });
});

describe('webview transport', () => {
    const makeWindow = (overrides: Record<string, unknown> = {}) => {
        const target = new EventTarget() as unknown as Window & { parent: unknown };
        Object.assign(target, {
            parent: target,
            document: document,
            ...overrides,
        });
        return target;
    };

    it('检测 RN 宿主', () => {
        const win = makeWindow({ ReactNativeWebView: { postMessage: vi.fn() } });
        expect(detectTransportKind(win)).toBe('react-native');
    });

    it('无 RN、无 parent 时是 none', () => {
        expect(detectTransportKind(makeWindow())).toBe('none');
    });

    it('RN 形态把事件序列化后发给 ReactNativeWebView', () => {
        const postMessage = vi.fn();
        const win = makeWindow({ ReactNativeWebView: { postMessage } });
        const transport = createWebViewTransport(win);
        transport.send({ type: 'ready', mode: 'hanabi', modes: ['hanabi'], hasLines: false });
        expect(transport.kind).toBe('react-native');
        expect(postMessage).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(postMessage.mock.calls[0][0]);
        expect(payload).toMatchObject({ type: 'ready', source: FOLIA_BRIDGE_SOURCE, version: FOLIA_BRIDGE_VERSION });
        transport.dispose();
    });

    it('__FOLIA_RECEIVE__ 注入通道能收到命令，坏消息走 onParseError', () => {
        const win = makeWindow();
        const onParseError = vi.fn();
        const transport = createWebViewTransport(win, { onParseError });
        const received: string[] = [];
        transport.onCommand(command => received.push(command.type));

        const receive = (win as unknown as Record<string, (payload: unknown) => void>).__FOLIA_RECEIVE__;
        receive(JSON.stringify({ type: 'setMode', mode: 'monet' }));
        receive('not-json');
        expect(received).toEqual(['setMode']);
        expect(onParseError).toHaveBeenCalledWith('invalid-json', 'not-json');
        transport.dispose();
        expect((win as unknown as Record<string, unknown>).__FOLIA_RECEIVE__).toBeUndefined();
    });

    it('自定义 send 优先，事件带 source', () => {
        const sent: unknown[] = [];
        const transport = createWebViewTransport(makeWindow(), { send: event => sent.push(event) });
        transport.send({ type: 'modeChange', mode: 'classic' });
        expect(transport.kind).toBe('custom');
        expect(sent[0]).toMatchObject({ type: 'modeChange', mode: 'classic', source: FOLIA_BRIDGE_SOURCE });
        transport.dispose();
    });

    it('自己发出的事件不会被当成命令（source 过滤）', () => {
        const win = makeWindow();
        const transport = createWebViewTransport(win);
        const handler = vi.fn();
        transport.onCommand(handler);
        const receive = (win as unknown as Record<string, (payload: unknown) => void>).__FOLIA_RECEIVE__;
        receive(createBridgeEvent({ type: 'modeChange', mode: 'classic' }));
        expect(handler).not.toHaveBeenCalled();
        transport.dispose();
    });

    it('dispose 之后不再分发命令', () => {
        const win = makeWindow();
        const transport = createWebViewTransport(win);
        const handler = vi.fn();
        transport.onCommand(handler);
        transport.dispose();
        const receive = (win as unknown as Record<string, (payload: unknown) => void>).__FOLIA_RECEIVE__;
        expect(receive).toBeUndefined();
        expect(handler).not.toHaveBeenCalled();
    });
});
