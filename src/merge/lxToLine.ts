// src/merge/lxToLine.ts
//
// 融合点 1 的数据面：洛雪（lx-music-mobile）的歌词行 → Folia 的歌词行。
//
// 洛雪 `plugins/lyric.ts` 里 `Line` 来自 lrc-file-parser，形状是
// `{ time: 秒, text: string, translation?: string, roma?: string }`，只有行级时间轴。
// Folia 的 `Line` 需要 `{ words[], startTime, endTime, fullText }`，逐字样式（karaoke 光晕、
// 逐字上色）靠 words 的时间轴工作。
//
// 所以这里做两件事：
//   1. 行级均分 words —— 没有逐字时间轴时，把一行按"可见字符/词"切开，把 [startTime, endTime]
//      平均分给每个 word。`words.map(w => w.text).join('') === fullText` 是硬不变量，
//      否则 Folia 的逐字样式会把字画丢。
//   2. QRC 逐字留接口 —— 洛雪侧若已解析出逐字时间（酷狗 KRC / QQ QRC），把 words 放进
//      `LxQrcLine.words` 传进来即可原样使用，本模块只做区间归一化（排序、去重叠、末字补到行尾），
//      不再均分。时间单位用 `qrcTimeUnit` 声明（默认秒），毫秒源由桥自动换算。
//
// 纯函数、不碰 DOM，也不 import 视觉层，单测直接跑。

import type { Line, Word } from '../types';

/** 洛雪歌词行（lrc-file-parser 的 `Lines[number]`）。`time` 单位是秒。 */
export interface LxLyricLine {
    time: number;
    text: string;
    translation?: string;
    /** 洛雪罗马音扩展行（`roma`）；部分版本叫 `romanization`，两个都认。 */
    roma?: string;
    romanization?: string;
}

/** 逐字时间轴里的一字/一词；`startTime`/`endTime` 单位由 `qrcTimeUnit` 决定。 */
export interface LxQrcWord {
    text: string;
    startTime: number;
    endTime: number;
}

/** 带逐字时间轴的洛雪行：QRC/KRC 解析后把每个字的时间塞进 `words`。 */
export interface LxQrcLine extends LxLyricLine {
    words?: LxQrcWord[];
}

export interface LxToFoliaOptions {
    /** 整体时间偏移（秒），正数推迟。洛雪歌词偏移校准后直接用这个字段。 */
    offsetSeconds?: number;
    /** 最后一行没有下一行时给多长（秒），默认 4。 */
    fallbackLineDuration?: number;
    /** 一行最短时长（秒），默认 0.12：同秒重复行不会得到零长度。 */
    minLineDuration?: number;
    /** 一行最长时长（秒）；不设则不封顶（默认跟随下一行）。长间奏时可用它避免逐字拖太久。 */
    maxLineDuration?: number;
    /** 逐字时间优先：行里带 `words` 时不再均分。默认 true。 */
    preferWordTiming?: boolean;
    /** 跳过 text 与 translation 都为空的空行（默认 true）。 */
    skipEmptyLines?: boolean;
    /** 生成 id 的前缀，默认 `lx-`。 */
    idPrefix?: string;
    /** 歌曲总时长（秒）；最后一行若在时长之前，行尾取时长而不是 fallback。 */
    duration?: number;
    /** QRC/KRC 逐字时间的单位，默认秒；毫秒源传 'milliseconds'。 */
    qrcTimeUnit?: 'seconds' | 'milliseconds';
}

const DEFAULTS = {
    offsetSeconds: 0,
    fallbackLineDuration: 4,
    minLineDuration: 0.12,
    preferWordTiming: true,
    skipEmptyLines: true,
    idPrefix: 'lx-',
    qrcTimeUnit: 'seconds',
} as const;

/** 逐字最短时长：QRC 偶尔给出零长度字，兜一个可渲染的底。 */
const MIN_WORD_DURATION = 0.02;

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

/** 洛雪行判定：有 `time`（秒）与 `text`。Folia 行用的是 `startTime`，两者结构上可区分。 */
export const isLxLine = (value: unknown): value is LxLyricLine => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return isFiniteNumber(record.time) && typeof record.text === 'string';
};

/** Folia 行判定：`startTime`/`endTime`/`fullText`/`words` 齐全。 */
export const isFoliaLine = (value: unknown): value is Line => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return (
        isFiniteNumber(record.startTime)
        && isFiniteNumber(record.endTime)
        && typeof record.fullText === 'string'
        && Array.isArray(record.words)
    );
};

// ---------------------------------------------------------------------------
// 分词：保证 join('') === 原文
// ---------------------------------------------------------------------------

/** 需要"一字一格"的表意文字：汉字、假名、谚文、注音。标点/emoji 不算。 */
const CJK_LETTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
const TOKEN_RE = /[ \t\u3000]+|[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF'’\-]+|[\s\S]/gu;

/**
 * 把一行切成"逐字单元"：
 * - 汉字/假名/谚文：一字一个单元（karaoke 的基本粒度）；
 * - 拉丁/数字/西里尔：连续成词；
 * - 标点/符号/emoji：并入前一个单元（不单独占一个字的时长）；
 * - 空白：并入前一个单元；行首空白挂到第一个单元上。
 *
 * 返回的数组 `join('')` 必然等于原文——这是 Folia `words` 与 `fullText` 对齐的前提。
 */
export const splitLxLineText = (text: string): string[] => {
    if (!text) return [];
    const raw = text.match(TOKEN_RE) ?? [];
    const tokens: string[] = [];
    let leading = '';

    const push = (token: string) => {
        if (leading) {
            tokens.push(leading + token);
            leading = '';
            return;
        }
        tokens.push(token);
    };

    for (const token of raw) {
        if (/^\s+$/.test(token)) {
            if (tokens.length === 0) leading += token;
            else tokens[tokens.length - 1] += token;
            continue;
        }
        const chars = Array.from(token);
        if (chars.length > 1) {
            // 拉丁/数字/西里尔成词：整词一个单元。
            push(token);
            continue;
        }
        if (CJK_LETTER.test(token)) {
            // 表意文字：一字一格。
            push(token);
            continue;
        }
        // 标点/符号：并入前一个单元；行首标点挂到后面第一个单元上。
        if (tokens.length === 0) leading += token;
        else tokens[tokens.length - 1] += token;
    }

    if (leading) tokens.push(leading);
    return tokens;
};

/**
 * 行级均分：把 [startTime, endTime] 平均分给切出来的每个单元。
 * 末尾单元的 endTime 精确等于行尾（不做浮点累加的漂移）。
 */
export const splitTextToWords = (text: string, startTime: number, endTime: number): Word[] => {
    const tokens = splitLxLineText(text);
    if (tokens.length === 0) return [];
    const start = Math.max(0, startTime);
    const end = Math.max(start + MIN_WORD_DURATION, endTime);
    const span = (end - start) / tokens.length;
    return tokens.map((token, index) => ({
        text: token,
        startTime: index === 0 ? start : start + span * index,
        endTime: index === tokens.length - 1 ? end : start + span * (index + 1),
    }));
};

// ---------------------------------------------------------------------------
// QRC 逐字：只归一化，不重新计时
// ---------------------------------------------------------------------------

const readQrcWords = (input: unknown, unit: 'seconds' | 'milliseconds'): LxQrcWord[] | null => {
    if (!Array.isArray(input) || input.length === 0) return null;
    const scale = unit === 'milliseconds' ? 0.001 : 1;
    const words: LxQrcWord[] = [];
    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;
        const record = raw as Record<string, unknown>;
        const text = typeof record.text === 'string' ? record.text : '';
        const start = isFiniteNumber(record.startTime) ? record.startTime * scale : null;
        const end = isFiniteNumber(record.endTime) ? record.endTime * scale : start;
        if (!text || start === null || end === null) continue;
        words.push({ text, startTime: start, endTime: end });
    }
    return words.length > 0 ? words : null;
};

/**
 * 把逐字时间轴归一化到行区间内：
 * 排序 → 起点不早于行首、不与前一字重叠 → 末字至少铺到行尾（行尾更晚时）。
 * 文本原样保留（逐字文本已由解析器切好）。
 */
export const normalizeQrcWords = (words: readonly LxQrcWord[], lineStart: number, lineEnd: number): Word[] => {
    const sorted = words
        .filter(word => word.text && Number.isFinite(word.startTime) && Number.isFinite(word.endTime))
        .map(word => ({
            text: word.text,
            startTime: word.startTime,
            endTime: Math.max(word.endTime, word.startTime + MIN_WORD_DURATION),
        }))
        .sort((left, right) => left.startTime - right.startTime);

    const out: Word[] = [];
    for (const word of sorted) {
        const floor = out.length > 0 ? out[out.length - 1].endTime : Math.max(0, lineStart);
        const startTime = Math.max(word.startTime, floor);
        out.push({ text: word.text, startTime, endTime: Math.max(word.endTime, startTime + MIN_WORD_DURATION) });
    }
    if (out.length > 0) {
        const last = out[out.length - 1];
        if (lineEnd > last.startTime) last.endTime = Math.max(last.endTime, lineEnd);
    }
    return out;
};

/** 这一行是否已经有逐字时间轴（QRC/KRC 已解析）。 */
export const hasWordTiming = (line: unknown): line is LxQrcLine => {
    if (!line || typeof line !== 'object') return false;
    const words = (line as { words?: unknown }).words;
    return Array.isArray(words) && words.some(word => (
        Boolean(word) && typeof (word as { text?: unknown }).text === 'string'
    ));
};

// ---------------------------------------------------------------------------
// 主转换
// ---------------------------------------------------------------------------

interface PreparedLine {
    start: number;
    text: string;
    translation: string;
    romanization: string;
    words: LxQrcWord[] | null;
}

/**
 * 洛雪 `Line[]` → Folia `Line[]`。
 *
 * - 按 `time` 稳定排序（同秒行保持原顺序）；
 * - 行尾取下一行起点；最后一行取 `duration`（若给出且更晚），否则 `time + fallbackLineDuration`；
 * - 同秒重复行至少 `minLineDuration`，不会得到零长度行；
 * - 有 `words` 且 `preferWordTiming` 时走逐字，否则行级均分。
 */
export const lxLinesToFoliaLines = (
    input: readonly LxLyricLine[] | readonly LxQrcLine[],
    options: LxToFoliaOptions = {},
): Line[] => {
    const opts = { ...DEFAULTS, ...options };
    const prepared: PreparedLine[] = [];

    for (const raw of input) {
        if (!isLxLine(raw)) continue;
        const rawStart = raw.time;
        if (!Number.isFinite(rawStart)) continue;

        const text = typeof raw.text === 'string' ? raw.text : '';
        const translation = typeof raw.translation === 'string' ? raw.translation.trim() : '';
        const romanization = typeof raw.roma === 'string'
            ? raw.roma.trim()
            : typeof raw.romanization === 'string' ? raw.romanization.trim() : '';
        const qrcWords = opts.preferWordTiming && hasWordTiming(raw)
            ? readQrcWords((raw as LxQrcLine).words, opts.qrcTimeUnit)
            : null;

        if (opts.skipEmptyLines && !text.trim() && !translation && !qrcWords) continue;

        prepared.push({
            start: Math.max(0, rawStart + opts.offsetSeconds),
            text,
            translation,
            romanization,
            words: qrcWords,
        });
    }

    prepared.sort((left, right) => left.start - right.start);

    return prepared.map((item, index) => {
        const next = prepared[index + 1];
        let endTime: number;
        if (next) {
            endTime = Math.max(next.start, item.start + opts.minLineDuration);
        } else {
            const byDuration = typeof opts.duration === 'number' && Number.isFinite(opts.duration) && opts.duration > item.start
                ? opts.duration
                : null;
            endTime = byDuration ?? item.start + opts.fallbackLineDuration;
        }
        if (opts.maxLineDuration !== undefined && Number.isFinite(opts.maxLineDuration) && opts.maxLineDuration > 0) {
            endTime = Math.min(endTime, item.start + opts.maxLineDuration);
        }
        if (endTime <= item.start) endTime = item.start + opts.minLineDuration;

        const words = item.words
            ? normalizeQrcWords(item.words, item.start, endTime)
            : splitTextToWords(item.text, item.start, endTime);

        return {
            id: `${opts.idPrefix}${index}`,
            words,
            startTime: item.start,
            endTime,
            fullText: words.map(word => word.text).join('') || item.text,
            ...(item.translation ? { translation: item.translation } : {}),
            ...(item.romanization ? { romanization: item.romanization } : {}),
        };
    });
};

/** 只走逐字路径的入口（QRC/KRC 行），语义与 `lxLinesToFoliaLines` 一致。 */
export const lxQrcLinesToFoliaLines = (
    input: readonly LxQrcLine[],
    options: LxToFoliaOptions = {},
): Line[] => lxLinesToFoliaLines(input, { ...options, preferWordTiming: true });

/** 归一化一条已经符合 Folia 契约的行（来自宿主，可能越界/零长度）。 */
export const normalizeFoliaLine = (line: Line): Line | null => {
    const start = Math.max(0, line.startTime);
    const end = Math.max(start + MIN_WORD_DURATION, line.endTime);
    const words = Array.isArray(line.words)
        ? line.words
            .filter(word => Boolean(word) && typeof word.text === 'string' && Number.isFinite(word.startTime))
            .map(word => ({
                text: word.text,
                startTime: Math.max(start, word.startTime),
                endTime: Math.max(word.endTime, Math.max(start, word.startTime) + MIN_WORD_DURATION),
            }))
            .sort((left, right) => left.startTime - right.startTime)
        : [];
    const fullText = typeof line.fullText === 'string' ? line.fullText : '';
    if (!fullText.trim() && words.length === 0) return null;
    return {
        ...line,
        startTime: start,
        endTime: end,
        words,
        fullText: fullText || words.map(word => word.text).join(''),
    };
};

export type IncomingLineFormat = 'lx' | 'folia' | 'empty';

export interface IncomingLinesResult {
    format: IncomingLineFormat;
    lines: Line[];
    /** 输入里被丢弃的条目数（非法形状、空行）。 */
    dropped: number;
}

/**
 * 桥上的 `setLines` 可能收到两种行：洛雪原始行（`{time,text}`）或已转换的 Folia 行。
 * 这里自动判定并归一化，宿主（RN 侧）不需要关心引擎内部契约。
 */
export const convertIncomingLines = (
    input: unknown,
    options: LxToFoliaOptions = {},
): IncomingLinesResult => {
    if (!Array.isArray(input) || input.length === 0) {
        return { format: 'empty', lines: [], dropped: 0 };
    }
    const lx = input.filter(isLxLine) as LxLyricLine[];
    const folia = input.filter(isFoliaLine) as Line[];

    if (lx.length > 0 && lx.length >= folia.length) {
        const lines = lxLinesToFoliaLines(lx, options);
        return { format: 'lx', lines, dropped: input.length - lines.length };
    }
    if (folia.length > 0) {
        const lines = folia
            .map(normalizeFoliaLine)
            .filter((line): line is Line => line !== null)
            .sort((left, right) => left.startTime - right.startTime);
        return { format: 'folia', lines, dropped: input.length - lines.length };
    }
    return { format: 'empty', lines: [], dropped: input.length };
};
