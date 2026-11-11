import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseBridgeCommand, type FoliaBridgeCommand, type FoliaBridgeEventPayload } from '../src/merge/bridgeProtocol';
import type { WebViewTransport } from '../src/webview/transport';
import type { WebViewPageOptions } from '../src/webview/pageOptions';

// React 19 要求宿主显式声明支持 act，否则每次渲染都会打警告。
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 视觉层是 WebGL/pixi，jsdom 里跑不了；这里只验证"桥 → 页面状态 → VisualizerStage props"
// 这一段接线，所以把舞台替换成记录 props 的空组件。真实的渲染由构建产物 + QA 截图覆盖。
const { stageProps } = vi.hoisted(() => ({ stageProps: { current: null as Record<string, unknown> | null } }));

vi.mock('../src/components/visualizer/VisualizerStage', () => ({
    default: (props: Record<string, unknown>) => {
        stageProps.current = props;
        return null;
    },
    DEFAULT_STAGE_THEME: {
        name: 'default',
        backgroundColor: '#05070d',
        primaryColor: '#ffffff',
        accentColor: '#7dd3fc',
        secondaryColor: '#f472b6',
        fontStyle: 'sans',
        animationIntensity: 'normal',
    },
    findActiveLineIndex: () => -1,
    getLinesEndTime: () => 0,
    STAGE_MODES: [],
}));

const { FoliaWebViewPage } = await import('../src/webview/FoliaWebViewPage');

interface Harness {
    transport: WebViewTransport;
    sent: FoliaBridgeEventPayload[];
    receive: (raw: unknown) => void;
}

const createHarness = (): Harness => {
    let handler: ((command: FoliaBridgeCommand) => void) | null = null;
    const sent: FoliaBridgeEventPayload[] = [];
    const transport: WebViewTransport = {
        kind: 'custom',
        send: payload => { sent.push(payload); },
        onCommand: next => {
            handler = next;
            return () => { handler = null; };
        },
        dispose: () => { handler = null; },
    };
    return {
        transport,
        sent,
        receive: raw => {
            const parsed = parseBridgeCommand(raw);
            if (!parsed.ok) throw new Error(`harness 收到非法命令: ${parsed.error}`);
            handler?.(parsed.command);
        },
    };
};

const baseOptions: WebViewPageOptions = { demo: false, controls: true, tapToggle: false };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const mount = async (options: WebViewPageOptions, harness: Harness) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
        root!.render(<FoliaWebViewPage options={options} transport={harness.transport} />);
    });
    // 返回组件根元素（带 data-folia-* 钩子），而不是挂载容器
    return container.firstElementChild as HTMLElement;
};

afterEach(async () => {
    if (root) {
        await act(async () => { root!.unmount(); });
        root = null;
    }
    container?.remove();
    container = null;
    stageProps.current = null;
    document.body.innerHTML = '';
});

describe('FoliaWebViewPage', () => {
    it('挂载后发 ready，带模式清单', async () => {
        const harness = createHarness();
        await mount(baseOptions, harness);
        const ready = harness.sent.find(event => event.type === 'ready');
        expect(ready).toBeDefined();
        expect(ready).toMatchObject({ type: 'ready', hasLines: false });
        const modes = (ready as { modes: readonly string[] }).modes;
        expect(modes.length).toBeGreaterThan(10);
        expect(modes).toContain('hanabi');
    });

    it('setLines 接受洛雪行并交给 VisualizerStage', async () => {
        const harness = createHarness();
        const element = await mount(baseOptions, harness);
        await act(async () => {
            harness.receive({
                type: 'setLines',
                lines: [
                    { time: 0, text: '你好' },
                    { time: 2, text: '世界' },
                ],
                duration: 10,
                songTitle: '测试歌曲',
                songArtist: '测试歌手',
            });
        });
        expect(element.getAttribute('data-folia-lines')).toBe('2');
        const props = stageProps.current!;
        expect((props.lines as Array<{ words: Array<{ text: string }> }>)[0].words[0].text).toBe('你');
        expect(props.duration).toBe(10);
        expect(props.songTitle).toBe('测试歌曲');
    });

    it('第一条 setCurrentTime 把页面从本地时钟切到宿主时钟', async () => {
        const harness = createHarness();
        const element = await mount(baseOptions, harness);
        expect(element.getAttribute('data-folia-host')).toBe('local');
        expect(stageProps.current!.clock).toBeUndefined();

        await act(async () => {
            harness.receive({ type: 'setCurrentTime', time: 12.5, duration: 200, playing: true });
        });
        expect(element.getAttribute('data-folia-host')).toBe('driven');
        expect(stageProps.current!.clock).toBeDefined();
        expect(stageProps.current!.duration).toBe(200);
    });

    it('setMode 生效并回报 modeChange，未知模式回 error', async () => {
        const harness = createHarness();
        await mount(baseOptions, harness);
        await act(async () => {
            harness.receive({ type: 'setMode', mode: 'monet' });
        });
        expect(stageProps.current!.mode).toBe('monet');
        expect(harness.sent.some(event => event.type === 'modeChange' && event.mode === 'monet')).toBe(true);

        await act(async () => {
            harness.receive({ type: 'setMode', mode: 'not-a-mode' });
        });
        expect(harness.sent.some(event => event.type === 'error')).toBe(true);
        expect(stageProps.current!.mode).toBe('monet');
    });

    it('showControls 控制标题浮层，歌词行变化回报 lineChange（去重）', async () => {
        const harness = createHarness();
        const element = await mount(baseOptions, harness);
        await act(async () => {
            harness.receive({ type: 'setLines', lines: [{ time: 0, text: 'a' }, { time: 1, text: 'b' }], songTitle: '标题' });
            harness.receive({ type: 'showControls', visible: false });
        });
        expect(element.textContent).not.toContain('标题');

        await act(async () => {
            harness.receive({ type: 'showControls', visible: true });
        });
        expect(element.textContent).toContain('标题');

        const onLineIndexChange = stageProps.current!.onLineIndexChange as (index: number) => void;
        await act(async () => { onLineIndexChange(1); onLineIndexChange(1); });
        const lineChanges = harness.sent.filter(event => event.type === 'lineChange');
        expect(lineChanges).toHaveLength(1);
        expect(lineChanges[0]).toMatchObject({ index: 1, startTime: 1 });
    });

    it('封面背景开启时舞台底色是可解析的透明色，不是 CSS 关键字', async () => {
        const harness = createHarness();
        const element = await mount(baseOptions, harness);
        await act(async () => {
            harness.receive({
                type: 'setLines',
                lines: [{ time: 0, text: '第一行' }],
                coverUrl: 'https://example.test/cover.jpg',
                songTitle: '带封面的歌',
            });
        });

        // 外层 DOM 让位给封面层
        expect(element.style.background).toBe('transparent');
        expect(element.querySelector('[data-folia-backdrop="cover"]')).not.toBeNull();

        // 传给 VisualizerStage 的不能是 'transparent'：Pixi / THREE / shader 取色器会报错
        const props = stageProps.current!;
        const stageTheme = props.theme as { backgroundColor: string };
        expect(stageTheme.backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(stageTheme.backgroundColor).not.toBe('transparent');
        expect(props.background).toEqual({ transparent: true });
    });

    it('宿主通过 setLines.theme 送来 transparent 关键字时在桥边界被归一', async () => {
        const harness = createHarness();
        await mount(baseOptions, harness);
        await act(async () => {
            harness.receive({
                type: 'setLines',
                lines: [{ time: 0, text: '第一行' }],
                theme: { backgroundColor: 'transparent' },
            });
        });
        const stageTheme = stageProps.current!.theme as { backgroundColor: string };
        expect(stageTheme.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    });

    it('demo 模式自带示例歌词，并在没有宿主时用本地时钟', async () => {
        const harness = createHarness();
        const element = await mount({ ...baseOptions, demo: true }, harness);
        expect(Number(element.getAttribute('data-folia-lines'))).toBeGreaterThan(0);
        expect(element.getAttribute('data-folia-host')).toBe('local');
        const ready = harness.sent.find(event => event.type === 'ready') as { hasLines: boolean };
        expect(ready.hasLines).toBe(true);
    });
});
