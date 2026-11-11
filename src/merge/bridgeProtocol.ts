// src/merge/bridgeProtocol.ts
//
// 融合点 1 的控制面：RN（洛雪壳）⇄ WebView（Folia 视觉层）的 postMessage 协议。
//
// 方向 A：RN → WebView，命令
//   setLines        { lines, duration?, songTitle?, songArtist?, coverUrl?, theme?, ... }
//   setCurrentTime  { time, duration?, playing? }
//   setMode         { mode }
//   showControls    { visible }
//
// 方向 B：WebView → RN，事件
//   ready          页面挂载完成（附带可选模式清单）
//   lineChange     当前行下标变化（宿主可用来做进度/滚动联动）
//   modeChange     页面侧模式已生效
//   controlsChange 控制条可见性（页面本地轻触切换时回报）
//   error          命令解析/应用失败（宿主可打日志，不崩播放）
//
// 约定：所有消息都是一个 JSON 对象（RN 侧 `postMessage(JSON.stringify(cmd))`）。
// `setLines` 同时接受洛雪原始行（`{time,text,translation}`）与 Folia 行
// （`{words,startTime,endTime,fullText}`），页面里自动判定转换，宿主不需要关心引擎契约。
//
// 本模块纯逻辑、不碰 DOM，单测直接跑。

import type { Line, Theme } from '../types';
import { convertIncomingLines, type IncomingLineFormat, type LxToFoliaOptions } from './lxToLine';

export const FOLIA_BRIDGE_VERSION = 1;
export const FOLIA_BRIDGE_SOURCE = 'folia-webview';

/** 一帧最多接受的歌词行数：超过基本是宿主 bug，直接拒绝而不是卡死渲染。 */
export const MAX_BRIDGE_LINES = 20000;

export interface SetLinesCommand {
    type: 'setLines';
    /** 已归一化为 Folia 契约的行。 */
    lines: Line[];
    /** 输入被识别为哪种格式（调试用）。 */
    format: IncomingLineFormat;
    /** 输入里被丢弃的条目数。 */
    dropped: number;
    duration?: number;
    songTitle?: string | null;
    songArtist?: string | null;
    songAlbum?: string | null;
    coverUrl?: string | null;
    seed?: string | number;
    showText?: boolean;
    staticMode?: boolean;
    theme?: Partial<Theme>;
}

export interface SetCurrentTimeCommand {
    type: 'setCurrentTime';
    /** 播放进度（秒）。 */
    time: number;
    /** 歌曲总时长（秒），可选。 */
    duration?: number;
    /** 是否正在播放；缺省按播放中处理（宿主只在播放时推进时钟）。 */
    playing?: boolean;
}

export interface SetModeCommand {
    type: 'setMode';
    mode: string;
}

export interface ShowControlsCommand {
    type: 'showControls';
    visible: boolean;
}

/** 封面背景的模糊档位。 */
export type FoliaBlurLevel = 'weak' | 'medium' | 'strong';

/** 效果强度（混乱程度）档位：静止 / 微动 / 标准 / 狂暴。 */
export type FoliaIntensityLevel = 'still' | 'subtle' | 'normal' | 'chaotic';

export const FOLIA_BLUR_LEVELS: readonly FoliaBlurLevel[] = ['weak', 'medium', 'strong'];
export const FOLIA_INTENSITY_LEVELS: readonly FoliaIntensityLevel[] = ['still', 'subtle', 'normal', 'chaotic'];

export const isFoliaBlurLevel = (value: unknown): value is FoliaBlurLevel =>
    typeof value === 'string' && (FOLIA_BLUR_LEVELS as readonly string[]).includes(value);

export const isFoliaIntensityLevel = (value: unknown): value is FoliaIntensityLevel =>
    typeof value === 'string' && (FOLIA_INTENSITY_LEVELS as readonly string[]).includes(value);

/** 背景层设置：是否用封面、模糊档位、是否暗化。 */
export interface SetBackdropCommand {
    type: 'setBackdrop';
    cover: boolean;
    blur: FoliaBlurLevel;
    dim: boolean;
}

/** 效果强度设置（混乱程度）。 */
export interface SetIntensityCommand {
    type: 'setIntensity';
    level: FoliaIntensityLevel;
}

export type FoliaBridgeCommand =
    | SetLinesCommand
    | SetCurrentTimeCommand
    | SetModeCommand
    | SetBackdropCommand
    | SetIntensityCommand
    | ShowControlsCommand;

export type FoliaBridgeEventPayload =
    | { type: 'ready'; mode: string; modes: readonly string[]; hasLines: boolean }
    | { type: 'lineChange'; index: number; startTime: number | null }
    | { type: 'modeChange'; mode: string }
    | { type: 'controlsChange'; visible: boolean }
    | { type: 'error'; message: string; detail?: string };

export type FoliaBridgeEvent = FoliaBridgeEventPayload & {
    source: typeof FOLIA_BRIDGE_SOURCE;
    version: number;
};

export type BridgeParseResult =
    | { ok: true; command: FoliaBridgeCommand }
    | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const optionalNumber = (value: unknown): number | undefined =>
    isFiniteNumber(value) ? value : undefined;

const optionalString = (value: unknown): string | null | undefined => {
    if (value === null) return null;
    return typeof value === 'string' ? value : undefined;
};

const parseTheme = (value: unknown): Partial<Theme> | undefined => {
    if (!isRecord(value)) return undefined;
    const theme: Partial<Theme> = {};
    const stringKeys: Array<keyof Theme> = [
        'name',
        'backgroundColor',
        'primaryColor',
        'accentColor',
        'secondaryColor',
        'fontFamily',
    ];
    for (const key of stringKeys) {
        const field = value[key];
        if (typeof field === 'string' && field.trim()) (theme as Record<string, unknown>)[key] = field;
    }
    if (value.fontStyle === 'sans' || value.fontStyle === 'serif' || value.fontStyle === 'mono') {
        theme.fontStyle = value.fontStyle;
    }
    if (value.animationIntensity === 'calm' || value.animationIntensity === 'normal' || value.animationIntensity === 'chaotic') {
        theme.animationIntensity = value.animationIntensity;
    }
    return Object.keys(theme).length > 0 ? theme : undefined;
};

/**
 * 解析一条来自宿主的命令。输入可以是 JSON 字符串（RN `postMessage` 的常规形态），
 * 也可以已经是对象（`injectJavaScript` / iframe `postMessage` 的形态）。
 * 任何非法输入都返回 `{ ok: false, error }`，绝不抛异常——播放页不能因为一条坏消息白屏。
 */
export const parseBridgeCommand = (
    input: unknown,
    options: LxToFoliaOptions = {},
): BridgeParseResult => {
    let value = input;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value) as unknown;
        } catch {
            return { ok: false, error: 'invalid-json' };
        }
    }
    if (!isRecord(value)) return { ok: false, error: 'not-an-object' };

    const type = value.type;
    if (typeof type !== 'string') return { ok: false, error: 'missing-type' };

    switch (type) {
        case 'setLines': {
            const rawLines = value.lines;
            if (!Array.isArray(rawLines)) return { ok: false, error: 'setLines:lines-not-array' };
            if (rawLines.length > MAX_BRIDGE_LINES) return { ok: false, error: 'setLines:too-many-lines' };

            const converted = convertIncomingLines(rawLines, options);
            const command: SetLinesCommand = {
                type: 'setLines',
                lines: converted.lines,
                format: converted.format,
                dropped: converted.dropped,
            };
            const duration = optionalNumber(value.duration);
            if (duration !== undefined) command.duration = duration;
            const songTitle = optionalString(value.songTitle);
            if (songTitle !== undefined) command.songTitle = songTitle;
            const songArtist = optionalString(value.songArtist);
            if (songArtist !== undefined) command.songArtist = songArtist;
            const songAlbum = optionalString(value.songAlbum);
            if (songAlbum !== undefined) command.songAlbum = songAlbum;
            const coverUrl = optionalString(value.coverUrl);
            if (coverUrl !== undefined) command.coverUrl = coverUrl;
            if (typeof value.seed === 'string' || isFiniteNumber(value.seed)) command.seed = value.seed;
            if (typeof value.showText === 'boolean') command.showText = value.showText;
            if (typeof value.staticMode === 'boolean') command.staticMode = value.staticMode;
            const theme = parseTheme(value.theme);
            if (theme) command.theme = theme;
            return { ok: true, command };
        }
        case 'setCurrentTime': {
            if (!isFiniteNumber(value.time)) return { ok: false, error: 'setCurrentTime:time-not-finite' };
            const command: SetCurrentTimeCommand = { type: 'setCurrentTime', time: Math.max(0, value.time) };
            const duration = optionalNumber(value.duration);
            if (duration !== undefined && duration > 0) command.duration = duration;
            if (typeof value.playing === 'boolean') command.playing = value.playing;
            return { ok: true, command };
        }
        case 'setMode': {
            const mode = typeof value.mode === 'string' ? value.mode.trim() : '';
            if (!mode) return { ok: false, error: 'setMode:mode-empty' };
            if (mode.length > 64) return { ok: false, error: 'setMode:mode-too-long' };
            return { ok: true, command: { type: 'setMode', mode } };
        }
        case 'setBackdrop': {
            if (typeof value.cover !== 'boolean') return { ok: false, error: 'setBackdrop:cover-not-boolean' };
            if (!isFoliaBlurLevel(value.blur)) return { ok: false, error: 'setBackdrop:blur-invalid' };
            if (typeof value.dim !== 'boolean') return { ok: false, error: 'setBackdrop:dim-not-boolean' };
            return { ok: true, command: { type: 'setBackdrop', cover: value.cover, blur: value.blur, dim: value.dim } };
        }
        case 'setIntensity': {
            if (!isFoliaIntensityLevel(value.level)) return { ok: false, error: 'setIntensity:level-invalid' };
            return { ok: true, command: { type: 'setIntensity', level: value.level } };
        }
        case 'showControls': {
            if (typeof value.visible !== 'boolean') return { ok: false, error: 'showControls:visible-not-boolean' };
            return { ok: true, command: { type: 'showControls', visible: value.visible } };
        }
        default:
            return { ok: false, error: `unknown-type:${type.slice(0, 32)}` };
    }
};

/** 给事件补上来源与版本，宿主据此丢弃别的 WebView 发来的消息。 */
export const createBridgeEvent = (payload: FoliaBridgeEventPayload): FoliaBridgeEvent => ({
    ...payload,
    source: FOLIA_BRIDGE_SOURCE,
    version: FOLIA_BRIDGE_VERSION,
});

/** RN 的 `ReactNativeWebView.postMessage` 只收字符串。 */
export const serializeBridgeEvent = (event: FoliaBridgeEvent): string => JSON.stringify(event);
