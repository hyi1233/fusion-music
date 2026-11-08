import { describe, it, expect } from 'vitest';
import {
    convertIncomingLines,
    hasWordTiming,
    isFoliaLine,
    isLxLine,
    lxLinesToFoliaLines,
    lxQrcLinesToFoliaLines,
    normalizeFoliaLine,
    normalizeQrcWords,
    splitLxLineText,
    splitTextToWords,
    type LxLyricLine,
} from '../src/merge/lxToLine';
import type { Line } from '../src/types';

const joinOf = (line: Line) => line.words.map(word => word.text).join('');

describe('splitLxLineText', () => {
    it('汉字一字一格，标点并入前字，空白并入前字', () => {
        expect(splitLxLineText('Hello 世界！')).toEqual(['Hello ', '世', '界！']);
    });

    it('假名与谚文同样逐字', () => {
        expect(splitLxLineText('こんにちは')).toEqual(['こ', 'ん', 'に', 'ち', 'は']);
        expect(splitLxLineText('사랑해')).toEqual(['사', '랑', '해']);
    });

    it('拉丁词整词一格，行首空白挂到第一个单元', () => {
        expect(splitLxLineText("  don't stop")).toEqual(["  don't ", 'stop']);
    });

    it('数字与连字符不拆', () => {
        expect(splitLxLineText('ABC-123 你好')).toEqual(['ABC-123 ', '你', '好']);
    });

    it('任何输入 join 都等于原文', () => {
        const samples = ['', '   ', '，。！', '君の名は。', 'a b  c', '🎵 夜に駆ける 🎵', '123 456'];
        for (const sample of samples) {
            expect(splitLxLineText(sample).join('')).toBe(sample);
        }
    });
});

describe('splitTextToWords', () => {
    it('行区间均分，末字精确落在行尾', () => {
        const words = splitTextToWords('你好世界', 1, 3);
        expect(words.map(word => word.text)).toEqual(['你', '好', '世', '界']);
        expect(words[0].startTime).toBe(1);
        expect(words[1].startTime).toBeCloseTo(1.5);
        expect(words[3].endTime).toBe(3);
        // 相邻 word 首尾相接，不留缝
        for (let i = 1; i < words.length; i += 1) {
            expect(words[i].startTime).toBeCloseTo(words[i - 1].endTime);
        }
    });

    it('零长度区间兜底成最短字长', () => {
        const words = splitTextToWords('ab', 2, 2);
        expect(words[0].startTime).toBe(2);
        expect(words[words.length - 1].endTime).toBeGreaterThan(2);
    });

    it('空文本没有 word', () => {
        expect(splitTextToWords('', 0, 3)).toEqual([]);
    });
});

describe('lxLinesToFoliaLines', () => {
    it('行尾取下一行起点，末行用 fallback', () => {
        const lines = lxLinesToFoliaLines([
            { time: 0, text: '第一行' },
            { time: 2, text: '第二行' },
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0].startTime).toBe(0);
        expect(lines[0].endTime).toBe(2);
        expect(lines[1].endTime).toBe(6);
        expect(lines[0].id).toBe('lx-0');
        expect(lines[0].fullText).toBe('第一行');
        expect(joinOf(lines[0])).toBe('第一行');
    });

    it('翻译与罗马音保留', () => {
        const [line] = lxLinesToFoliaLines([{ time: 0, text: '君の名は', translation: ' 你的名字 ', roma: 'kimi no na wa' }]);
        expect(line.translation).toBe('你的名字');
        expect(line.romanization).toBe('kimi no na wa');
    });

    it('空行默认跳过，可以关掉', () => {
        const input: LxLyricLine[] = [
            { time: 0, text: '' },
            { time: 1, text: '有词' },
            { time: 2, text: '   ' },
        ];
        expect(lxLinesToFoliaLines(input)).toHaveLength(1);
        expect(lxLinesToFoliaLines(input, { skipEmptyLines: false })).toHaveLength(3);
    });

    it('乱序输入按时间稳定排序', () => {
        const lines = lxLinesToFoliaLines([
            { time: 3, text: 'c' },
            { time: 1, text: 'a' },
            { time: 2, text: 'b' },
        ]);
        expect(lines.map(line => line.fullText)).toEqual(['a', 'b', 'c']);
    });

    it('同秒重复行至少 minLineDuration', () => {
        const lines = lxLinesToFoliaLines([
            { time: 1, text: 'a' },
            { time: 1, text: 'b' },
        ]);
        expect(lines[0].endTime).toBeCloseTo(1.12);
        expect(lines[0].endTime).toBeGreaterThan(lines[0].startTime);
    });

    it('duration 决定末行行尾，maxLineDuration 封顶', () => {
        const byDuration = lxLinesToFoliaLines([{ time: 0, text: 'a' }], { duration: 180 });
        expect(byDuration[0].endTime).toBe(180);

        const capped = lxLinesToFoliaLines(
            [
                { time: 0, text: 'a' },
                { time: 10, text: 'b' },
            ],
            { maxLineDuration: 3 },
        );
        expect(capped[0].endTime).toBe(3);
    });

    it('offsetSeconds 平移时间轴', () => {
        const [line] = lxLinesToFoliaLines([{ time: 1, text: 'a' }], { offsetSeconds: 0.5 });
        expect(line.startTime).toBe(1.5);
    });

    it('非法行被丢弃', () => {
        const lines = lxLinesToFoliaLines([
            { time: Number.NaN, text: 'bad' } as LxLyricLine,
            null as unknown as LxLyricLine,
            { time: 1, text: 'ok' },
        ]);
        expect(lines).toHaveLength(1);
        expect(lines[0].fullText).toBe('ok');
    });

    it('idPrefix 可定制', () => {
        const [line] = lxLinesToFoliaLines([{ time: 0, text: 'a' }], { idPrefix: 'qrc-' });
        expect(line.id).toBe('qrc-0');
    });
});

describe('QRC 逐字时间轴', () => {
    it('有 words 时不再均分，末字补到行尾', () => {
        const lines = lxQrcLinesToFoliaLines([
            {
                time: 0,
                text: '你好',
                words: [
                    { text: '你', startTime: 0.2, endTime: 0.5 },
                    { text: '好', startTime: 0.5, endTime: 0.8 },
                ],
            },
            { time: 2, text: '下一行' },
        ]);
        expect(lines[0].words.map(word => word.text)).toEqual(['你', '好']);
        expect(lines[0].words[0].startTime).toBe(0.2);
        expect(lines[0].words[1].endTime).toBe(2);
    });

    it('毫秒源按 qrcTimeUnit 换算', () => {
        const [line] = lxQrcLinesToFoliaLines(
            [
                {
                    time: 0,
                    text: '你好',
                    words: [
                        { text: '你', startTime: 200, endTime: 500 },
                        { text: '好', startTime: 500, endTime: 800 },
                    ],
                },
            ],
            { qrcTimeUnit: 'milliseconds', duration: 1 },
        );
        expect(line.words[0].startTime).toBeCloseTo(0.2);
        expect(line.words[1].endTime).toBe(1);
    });

    it('重叠与乱序的逐字被归一化', () => {
        const words = normalizeQrcWords(
            [
                { text: 'b', startTime: 0.5, endTime: 0.9 },
                { text: 'a', startTime: 0.1, endTime: 0.6 },
            ],
            0,
            1,
        );
        expect(words.map(word => word.text)).toEqual(['a', 'b']);
        expect(words[0].endTime).toBeLessThanOrEqual(words[1].startTime);
        expect(words[1].endTime).toBe(1);
    });

    it('preferWordTiming=false 时退回均分', () => {
        const [line] = lxLinesToFoliaLines(
            [{ time: 0, text: '你好', words: [{ text: '你', startTime: 0.2, endTime: 0.5 }] }],
            { preferWordTiming: false, duration: 1 },
        );
        expect(line.words).toHaveLength(2);
        expect(line.words[0].startTime).toBe(0);
    });

    it('hasWordTiming 只认非空 words', () => {
        expect(hasWordTiming({ time: 0, text: 'a', words: [{ text: 'a', startTime: 0, endTime: 1 }] })).toBe(true);
        expect(hasWordTiming({ time: 0, text: 'a', words: [] })).toBe(false);
        expect(hasWordTiming({ time: 0, text: 'a' })).toBe(false);
    });
});

describe('normalizeFoliaLine', () => {
    it('夹紧负时间并补齐行尾', () => {
        const line = normalizeFoliaLine({
            words: [{ text: 'a', startTime: -1, endTime: -0.5 }],
            startTime: -2,
            endTime: -1,
            fullText: 'a',
        } as Line);
        expect(line).not.toBeNull();
        expect(line!.startTime).toBe(0);
        expect(line!.endTime).toBeGreaterThan(0);
        expect(line!.words[0].startTime).toBe(0);
    });

    it('空行返回 null', () => {
        expect(normalizeFoliaLine({ words: [], startTime: 0, endTime: 1, fullText: '  ' } as Line)).toBeNull();
    });
});

describe('convertIncomingLines', () => {
    it('识别洛雪行并转换', () => {
        const result = convertIncomingLines([
            { time: 0, text: 'a' },
            { time: 1, text: 'b' },
        ]);
        expect(result.format).toBe('lx');
        expect(result.lines).toHaveLength(2);
        expect(result.dropped).toBe(0);
    });

    it('识别 Folia 行并归一化', () => {
        const folia: Line[] = [
            { words: [{ text: 'a', startTime: 0, endTime: 1 }], startTime: 0, endTime: 1, fullText: 'a' },
        ];
        const result = convertIncomingLines(folia);
        expect(result.format).toBe('folia');
        expect(result.lines[0].fullText).toBe('a');
    });

    it('空输入与非法输入', () => {
        expect(convertIncomingLines([]).format).toBe('empty');
        expect(convertIncomingLines(null).format).toBe('empty');
        expect(convertIncomingLines([1, 'x', {}]).format).toBe('empty');
        expect(convertIncomingLines([1, 'x']).dropped).toBe(2);
    });

    it('混合输入按多数判定，丢弃的条目计数', () => {
        const result = convertIncomingLines([
            { time: 0, text: 'a' },
            { time: 1, text: 'b' },
            { words: [], startTime: 2, endTime: 3, fullText: 'c' },
            'junk',
        ]);
        expect(result.format).toBe('lx');
        expect(result.dropped).toBe(2);
    });

    it('isLxLine / isFoliaLine 形状判定互斥', () => {
        expect(isLxLine({ time: 0, text: 'a' })).toBe(true);
        expect(isLxLine({ startTime: 0, text: 'a' })).toBe(false);
        expect(isFoliaLine({ words: [], startTime: 0, endTime: 1, fullText: 'a' })).toBe(true);
        expect(isFoliaLine({ time: 0, text: 'a' })).toBe(false);
    });
});
