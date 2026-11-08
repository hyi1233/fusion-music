// src/webview/hostHarness.ts
//
// 宿主侧的**参考实现**：一个最小 HTML 页，把 WebView 承载页放进 iframe，
// 用真实的 postMessage 协议喂歌词与时间。用途有三：
//   1. QA 不装 RN 也能验证桥（`npm run dev:webview` 后打开 folia-webview-host.html）；
//   2. 洛雪壳（RN 侧）实现 t3 时照着抄：发什么、什么时候发、收到什么；
//   3. 回归：改协议时先跑这个页，比在模拟器里点更快。
//
// 它和 RN 侧的唯一差别是传输通道：这里用 `iframe.contentWindow.postMessage`，
// RN 用 `injectJavaScript('window.__FOLIA_RECEIVE__(...)')`。命令与事件的 JSON 形状完全一致。

import { FOLIA_BRIDGE_SOURCE, parseBridgeCommand } from '../merge/bridgeProtocol';
import type { LxLyricLine } from '../merge/lxToLine';

/** 一段洛雪形状的示例歌词（行级时间轴 + 翻译），模拟 `plugins/lyric.ts` 的输出。 */
const LX_LINES: LxLyricLine[] = [
    { time: 0, text: '夜に駆ける', translation: '奔向黑夜' },
    { time: 3.2, text: '沈むように溶けてゆくように', translation: '像要沉没 像要融化' },
    { time: 7.4, text: '二人だけの空が広がる夜に', translation: '在只属于两人的夜空下' },
    { time: 11.6, text: '「さよなら」だけだった', translation: '只剩下「再见」' },
    { time: 15.8, text: 'その一言で全てが分かった', translation: '仅那一句话 我就全明白了' },
    { time: 20.0, text: '日が沈み出した空と君の姿', translation: '日落时分的天空与你的身影' },
    { time: 24.4, text: 'フェンス越しに重なっていた', translation: '隔着围栏重叠在一起' },
    { time: 28.6, text: '初めて会った日から', translation: '从初次相遇那天起' },
    { time: 32.8, text: '僕の心の全てを奪った', translation: '就夺走了我全部的心' },
    { time: 37.0, text: 'どこか儚い空気を纏う君は', translation: '你周身萦绕着某种虚幻的气息' },
];

const DURATION = 48;
const TICK_MS = 100;

const iframe = document.querySelector<HTMLIFrameElement>('#stage');
const logElement = document.querySelector<HTMLElement>('#log');
const statusElement = document.querySelector<HTMLElement>('#status');
const timeElement = document.querySelector<HTMLElement>('#time');
const playButton = document.querySelector<HTMLButtonElement>('#play');
const controlsButton = document.querySelector<HTMLButtonElement>('#controls');
const modeSelect = document.querySelector<HTMLSelectElement>('#mode');

if (!iframe || !logElement || !statusElement || !timeElement || !playButton || !controlsButton || !modeSelect) {
    throw new Error('[harness] 页面结构缺失');
}

const log = (line: string) => {
    const item = document.createElement('div');
    item.textContent = line;
    logElement.prepend(item);
    while (logElement.childElementCount > 60) logElement.lastElementChild?.remove();
};

const setStatus = (text: string) => {
    statusElement.textContent = text;
    statusElement.dataset.status = text;
};

let playing = true;
let time = 0;
let lastFrame = performance.now();
let lastSent = 0;
let ready = false;

const send = (command: Record<string, unknown>) => {
    iframe.contentWindow?.postMessage(command, '*');
    log(`→ ${JSON.stringify(command).slice(0, 140)}`);
};

const seek = (next: number) => {
    time = Math.max(0, Math.min(DURATION, next));
    send({ type: 'setCurrentTime', time, duration: DURATION, playing });
};

const tick = (now: number) => {
    const dt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;
    if (playing) time = Math.min(DURATION, time + dt);
    if (ready && now - lastSent >= TICK_MS) {
        lastSent = now;
        send({ type: 'setCurrentTime', time, duration: DURATION, playing });
    }
    timeElement.textContent = `${time.toFixed(2)} / ${DURATION}s`;
    requestAnimationFrame(tick);
};

// 页面 → 宿主：只认本 iframe 发来、且带 source 标记的事件。
window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data as { source?: string; type?: string } | null;
    if (!data || data.source !== FOLIA_BRIDGE_SOURCE) return;
    log(`← ${JSON.stringify(data)}`);

    if (data.type === 'ready') {
        ready = true;
        setStatus('ready ✓');
        const modes = (data as { modes?: string[] }).modes ?? [];
        modeSelect.replaceChildren(...modes.map(mode => {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = mode;
            return option;
        }));
        send({
            type: 'setLines',
            lines: LX_LINES,
            duration: DURATION,
            songTitle: '夜に駆ける',
            songArtist: 'YOASOBI',
            songAlbum: 'THE BOOK',
            theme: { primaryColor: '#7dd3fc', accentColor: '#f472b6' },
        });
    }
    if (data.type === 'lineChange') {
        setStatus(`lineChange #${(data as { index: number }).index}`);
    }
    if (data.type === 'error') {
        setStatus(`error: ${(data as { message: string }).message}`);
    }
});

playButton.addEventListener('click', () => {
    playing = !playing;
    playButton.textContent = playing ? '暂停' : '播放';
    send({ type: 'setCurrentTime', time, duration: DURATION, playing });
});

controlsButton.addEventListener('click', () => {
    send({ type: 'showControls', visible: controlsButton.dataset.visible !== '1' });
    controlsButton.dataset.visible = controlsButton.dataset.visible === '1' ? '0' : '1';
});

modeSelect.addEventListener('change', () => {
    send({ type: 'setMode', mode: modeSelect.value });
});

// 自动化入口：headless 检查可以调 `__HARNESS__.seek(20)` 等。
(window as unknown as Record<string, unknown>).__HARNESS__ = {
    send,
    seek,
    state: () => ({ ready, time, playing, commandsParsed: logElement.childElementCount }),
    parse: (raw: unknown) => parseBridgeCommand(raw),
};

requestAnimationFrame(tick);
