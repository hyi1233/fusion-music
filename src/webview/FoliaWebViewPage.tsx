// src/webview/FoliaWebViewPage.tsx
//
// 融合点 1 的视觉层承载页：洛雪壳用 RN WebView 全屏加载这一页，页面里挂的是**真实的**
// `VisualizerStage`（上游 Folia 的视觉内核，零改动），由 postMessage 桥驱动：
//
//   setLines        洛雪行 / Folia 行 → 页面自动判定并转换
//   setCurrentTime  播放进度（10~20Hz），页面用 rAF 补成 60fps 的 MotionValue
//   setMode         切视觉模式（内建 16 种）
//   showControls    控制条显隐（触摸手势归宿主，页面不抢）
//
// 页面在收到第一条 `setCurrentTime` 之前不接管时钟——`VisualizerStage` 自带的循环时钟会让
// 页面立刻有动画（QA 截图 / 宿主晚到时都不会黑屏），收到时间后无缝切成宿主时钟。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue } from 'framer-motion';
import VisualizerStage, { DEFAULT_STAGE_THEME } from '../components/visualizer/VisualizerStage';
import { BUILTIN_VISUALIZER_MODES, DEFAULT_VISUALIZER_MODE } from '../types/visualizerModes';
import type { Line, Theme, VisualizerMode } from '../types';
import type { FoliaBlurLevel, FoliaBridgeCommand, FoliaBridgeEventPayload, FoliaIntensityLevel } from '../merge/bridgeProtocol';
import { clockTimeAt, createPlaybackClock, syncPlaybackClock } from './playbackClock';
import { createWebViewTransport, type WebViewTransport } from './transport';
import { resolveMode, type WebViewPageOptions } from './pageOptions';
import { DEMO_DURATION, DEMO_LINES } from '../demo/demoLyrics';
import { isTransparentColor, normalizeThemeColor, TRANSPARENT_THEME_COLOR } from '../utils/themeColorMath';

interface StageMeta {
    duration?: number;
    songTitle?: string | null;
    songArtist?: string | null;
    songAlbum?: string | null;
    coverUrl?: string | null;
    seed?: string | number;
    theme: Theme;
    showText: boolean;
    staticMode: boolean;
}

export interface FoliaWebViewPageProps {
    options: WebViewPageOptions;
    /** 测试/嵌入时可注入传输层；默认按宿主形态自动探测。 */
    transport?: WebViewTransport;
}

const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: 'clamp(12px, 3vw, 28px)',
    pointerEvents: 'none',
    color: '#e8f0ff',
    fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
};

const topRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    textShadow: '0 1px 12px rgba(0,0,0,0.55)',
};

const titleStyle: React.CSSProperties = { fontSize: 'clamp(15px, 2.4vw, 22px)', fontWeight: 600, letterSpacing: '0.01em' };
const artistStyle: React.CSSProperties = { fontSize: 'clamp(12px, 1.8vw, 15px)', opacity: 0.72, marginTop: 4 };
const modeChipStyle: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid rgba(232,240,255,0.28)',
    background: 'rgba(5,7,13,0.35)',
    whiteSpace: 'nowrap',
};

const backdropStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
};

const backdropImageStyle: React.CSSProperties = {
    position: 'absolute',
    inset: '-8%',
    width: '116%',
    height: '116%',
    objectFit: 'cover',
};

const backdropDimStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
};

const BLUR_PX: Record<FoliaBlurLevel, number> = { weak: 4, medium: 12, strong: 28 };
const DIM_OPACITY: Record<FoliaBlurLevel, number> = { weak: 0.18, medium: 0.34, strong: 0.52 };

/** 效果强度 → 视觉内核参数：静止冻结画面，微动/标准/狂暴对应主题的 animationIntensity。 */
const INTENSITY_STATIC: Record<FoliaIntensityLevel, boolean> = {
    still: true,
    subtle: false,
    normal: false,
    chaotic: false,
};
const INTENSITY_THEME: Record<FoliaIntensityLevel, Theme['animationIntensity']> = {
    still: 'calm',
    subtle: 'calm',
    normal: 'normal',
    chaotic: 'chaotic',
};

const placeholderStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    color: 'rgba(232,240,255,0.5)',
    fontSize: 14,
    letterSpacing: '0.12em',
};

export function FoliaWebViewPage({ options, transport: injectedTransport }: FoliaWebViewPageProps): React.JSX.Element {
    const [transport] = useState<WebViewTransport>(() => injectedTransport ?? createWebViewTransport(window));
    const [lines, setLines] = useState<Line[]>(options.demo ? DEMO_LINES : []);
    const [mode, setMode] = useState<VisualizerMode>(() => resolveMode(options.mode) ?? DEFAULT_VISUALIZER_MODE);
    const [meta, setMeta] = useState<StageMeta>(() => ({
        duration: options.demo ? DEMO_DURATION : undefined,
        songTitle: options.title ?? null,
        songArtist: options.artist ?? null,
        theme: DEFAULT_STAGE_THEME,
        showText: true,
        staticMode: false,
    }));
    const [controlsVisible, setControlsVisible] = useState(options.controls);
    const [backdrop, setBackdrop] = useState<{ cover: boolean; blur: FoliaBlurLevel; dim: boolean }>({
        cover: true,
        blur: 'medium',
        dim: true,
    });
    const [intensity, setIntensity] = useState<FoliaIntensityLevel>('normal');
    const [hostActive, setHostActive] = useState(false);

    const clock = useMotionValue(0);
    const clockRef = useRef(createPlaybackClock(0, 0, false));
    const linesRef = useRef<Line[]>(lines);
    const modeRef = useRef<VisualizerMode>(mode);
    const hostActiveRef = useRef(false);
    const controlsRef = useRef(controlsVisible);
    const lastIndexRef = useRef(-1);

    linesRef.current = lines;
    modeRef.current = mode;
    hostActiveRef.current = hostActive;
    controlsRef.current = controlsVisible;

    const send = useCallback((payload: FoliaBridgeEventPayload) => transport.send(payload), [transport]);

    const handleCommand = useCallback((command: FoliaBridgeCommand) => {
        switch (command.type) {
            case 'setLines': {
                setLines(command.lines);
                setMeta(prev => {
                    const next: StageMeta = { ...prev };
                    if (command.duration !== undefined) next.duration = command.duration;
                    if (command.songTitle !== undefined) next.songTitle = command.songTitle;
                    if (command.songArtist !== undefined) next.songArtist = command.songArtist;
                    if (command.songAlbum !== undefined) next.songAlbum = command.songAlbum;
                    if (command.coverUrl !== undefined) next.coverUrl = command.coverUrl;
                    if (command.seed !== undefined) next.seed = command.seed;
                    if (command.theme) {
                        next.theme = { ...prev.theme, ...command.theme };
                        // 宿主可能送来 CSS 关键字 'transparent' 或 8 位 hex；在桥边界就归一成
                        // Pixi / Three / shader 都能解析的合法颜色，避免脏值流进渲染内核。
                        next.theme.backgroundColor = normalizeThemeColor(
                            next.theme.backgroundColor,
                            DEFAULT_STAGE_THEME.backgroundColor,
                        );
                    }
                    if (command.showText !== undefined) next.showText = command.showText;
                    if (command.staticMode !== undefined) next.staticMode = command.staticMode;
                    return next;
                });
                lastIndexRef.current = -1;
                break;
            }
            case 'setCurrentTime': {
                clockRef.current = syncPlaybackClock(clockRef.current, command.time, {
                    nowMs: performance.now(),
                    playing: command.playing ?? true,
                    duration: command.duration,
                });
                clock.set(clockTimeAt(clockRef.current, performance.now()));
                if (command.duration !== undefined) {
                    setMeta(prev => (prev.duration === command.duration ? prev : { ...prev, duration: command.duration }));
                }
                if (!hostActiveRef.current) {
                    hostActiveRef.current = true;
                    setHostActive(true);
                }
                break;
            }
            case 'setMode': {
                const next = resolveMode(command.mode);
                if (!next) {
                    send({ type: 'error', message: 'unknown-mode', detail: command.mode });
                    return;
                }
                setMode(next);
                break;
            }
            case 'setBackdrop': {
                setBackdrop({ cover: command.cover, blur: command.blur, dim: command.dim });
                break;
            }
            case 'setIntensity': {
                setIntensity(command.level);
                break;
            }
            case 'showControls': {
                controlsRef.current = command.visible;
                setControlsVisible(command.visible);
                break;
            }
            default:
                break;
        }
    }, [clock, send]);

    // 订阅宿主命令，并在挂载完成时回一条 ready（宿主据此决定何时开始灌歌词）。
    useEffect(() => {
        const unsubscribe = transport.onCommand(handleCommand);
        transport.send({
            type: 'ready',
            mode: modeRef.current,
            modes: BUILTIN_VISUALIZER_MODES,
            hasLines: linesRef.current.length > 0,
        });
        return unsubscribe;
    }, [transport, handleCommand]);

    // 宿主时钟：rAF 把锚点推成 60fps 的 motion value，视觉层不逐帧重渲染。
    useEffect(() => {
        if (!hostActive) return undefined;
        let frame = 0;
        const tick = () => {
            clock.set(clockTimeAt(clockRef.current, performance.now()));
            frame = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(frame);
    }, [hostActive, clock]);

    // 页面侧模式变化（setMode 或 demo 键盘切换）回报给宿主。
    const reportedModeRef = useRef(mode);
    useEffect(() => {
        if (reportedModeRef.current === mode) return;
        reportedModeRef.current = mode;
        transport.send({ type: 'modeChange', mode });
    }, [mode, transport]);

    const handleLineIndexChange = useCallback((index: number) => {
        if (index === lastIndexRef.current) return;
        lastIndexRef.current = index;
        const line = linesRef.current[index];
        transport.send({ type: 'lineChange', index, startTime: line ? line.startTime : null });
    }, [transport]);

    // 轻触切换控制条：默认关闭（触摸手势归 RN 宿主），?tap=1 时打开。
    const handlePointerUp = useCallback(() => {
        if (!options.tapToggle) return;
        const next = !controlsRef.current;
        controlsRef.current = next;
        setControlsVisible(next);
        transport.send({ type: 'controlsChange', visible: next });
    }, [options.tapToggle, transport]);

    // demo 页：方向键切模式，H 切控制条，方便截图和自测。
    useEffect(() => {
        if (!options.demo) return undefined;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault();
                const current = BUILTIN_VISUALIZER_MODES.indexOf(modeRef.current as (typeof BUILTIN_VISUALIZER_MODES)[number]);
                const step = event.key === 'ArrowUp' ? -1 : 1;
                const next = BUILTIN_VISUALIZER_MODES[(current + step + BUILTIN_VISUALIZER_MODES.length) % BUILTIN_VISUALIZER_MODES.length];
                setMode(next);
            } else if (event.key === 'h' || event.key === 'H') {
                const next = !controlsRef.current;
                controlsRef.current = next;
                setControlsVisible(next);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [options.demo]);

    // QA/自动化可以读这个钩子确认桥与渲染状态。
    useEffect(() => {
        const record = window as unknown as Record<string, unknown>;
        record.__FOLIA_WEBVIEW_STATE__ = () => ({
            ready: true,
            mode,
            lines: lines.length,
            hostActive,
            controls: controlsVisible,
            backdrop,
            intensity,
            transport: transport.kind,
        });
    }, [mode, lines.length, hostActive, controlsVisible, backdrop, intensity, transport]);

    const backdropActive = backdrop.cover && !!meta.coverUrl;
    // 封面背景开启时，舞台底色让位给背景层（否则不透明底色会盖住封面）。
    //
    // 注意：这里**不能**用 CSS 关键字 'transparent'。`VisualizerStage` 会把 theme.backgroundColor
    // 一路喂给 Pixi Color / THREE.Color / @paper-design/shaders / Canvas 的取色器，它们只认
    // hex 与 rgb()：关键字会让 shader 报 `Unsupported color format transparent`、Three 静默保留
    // 白色（背景变白），本项目的 hex 解析也会退化成白色兜底。改用所有解析器都认的
    // `rgba(0, 0, 0, 0)`：CSS 语义等价（完全透明），但每个取色器都能读出 (0,0,0,0)。
    const theme: Theme = backdropActive
        ? { ...meta.theme, backgroundColor: TRANSPARENT_THEME_COLOR }
        : { ...meta.theme, backgroundColor: normalizeThemeColor(meta.theme.backgroundColor, DEFAULT_STAGE_THEME.backgroundColor) };
    // 封面背景开启时顺带卸掉视觉内核自带的背景层，封面才能真正透上来。
    const stageBackground = backdropActive ? { transparent: true } : undefined;

    return (
        <div
            className="relative h-full w-full overflow-hidden"
            style={{ background: backdropActive || isTransparentColor(theme.backgroundColor) ? 'transparent' : theme.backgroundColor }}
            data-folia-webview="ready"
            data-folia-lines={lines.length}
            data-folia-host={hostActive ? 'driven' : 'local'}
            onPointerUp={handlePointerUp}
        >
            {backdrop.cover && meta.coverUrl ? (
                <div style={backdropStyle} data-folia-backdrop="cover">
                    <img
                        src={meta.coverUrl}
                        alt=""
                        style={{
                            ...backdropImageStyle,
                            filter: `blur(${BLUR_PX[backdrop.blur]}px)`,
                        }}
                    />
                    {backdrop.dim ? (
                        <div
                            style={{
                                ...backdropDimStyle,
                                background: `rgba(3, 5, 10, ${DIM_OPACITY[backdrop.blur]})`,
                            }}
                        />
                    ) : null}
                </div>
            ) : null}

            <VisualizerStage
                lines={lines}
                mode={mode}
                clock={hostActive ? clock : undefined}
                duration={meta.duration}
                theme={{ ...theme, animationIntensity: INTENSITY_THEME[intensity] }}
                background={stageBackground}
                seed={meta.seed}
                songTitle={meta.songTitle}
                songArtist={meta.songArtist}
                songAlbum={meta.songAlbum}
                coverUrl={backdrop.cover ? meta.coverUrl : null}
                showText={meta.showText}
                staticMode={meta.staticMode || INTENSITY_STATIC[intensity]}
                onLineIndexChange={handleLineIndexChange}
            />

            {controlsVisible ? (
                <div style={overlayStyle}>
                    <div style={topRowStyle}>
                        <div style={{ minWidth: 0 }}>
                            {meta.songTitle ? <div style={titleStyle}>{meta.songTitle}</div> : null}
                            {meta.songArtist ? <div style={artistStyle}>{meta.songArtist}</div> : null}
                        </div>
                        <div style={modeChipStyle}>{mode}</div>
                    </div>
                    <div />
                </div>
            ) : null}

            {lines.length === 0 ? <div style={placeholderStyle}>等待洛雪歌词…</div> : null}
        </div>
    );
}

export default FoliaWebViewPage;
