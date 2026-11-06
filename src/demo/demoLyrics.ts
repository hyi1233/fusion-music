// src/demo/demoLyrics.ts
//
// The static per-word lyric data the /demo page plays. It is a hand-written sample in the same
// shape the visualizer consumes (Line[] with per-word start/end times), so the demo exercises the
// real rendering path — word-by-word reveal, translations, romanization, background vocals, a
// labelled chorus — without a parser, a network call or an audio file.
//
// Fusion Music code; no upstream file is derived here.

import type { Line, Word } from '../types';

/** Splits `text` into `count` words of roughly equal length, laid evenly across the line. */
const carve = (text: string, start: number, end: number, parts: number): Word[] => {
    const chars = Array.from(text);
    const size = Math.ceil(chars.length / parts);
    const chunks: string[] = [];
    for (let i = 0; i < chars.length; i += size) chunks.push(chars.slice(i, i + size).join(''));
    const span = (end - start) / chunks.length;
    return chunks.map((chunk, i) => ({
        text: chunk,
        startTime: start + span * i,
        endTime: start + span * (i + 1),
    }));
};

/** Splits `text` into one word per token, at the supplied boundaries. */
const tokens = (parts: string[], start: number, end: number): Word[] => {
    const span = (end - start) / parts.length;
    return parts.map((text, i) => ({
        text,
        startTime: start + span * i,
        endTime: start + span * (i + 1),
    }));
};

const line = (
    fullText: string,
    start: number,
    end: number,
    words: Word[],
    extra: Partial<Line> = {},
): Line => ({ fullText, startTime: start, endTime: end, words, ...extra });

/**
 * Eight lines, ~38 seconds, cycling through the three scripts the engine special-cases most
 * (CJK with no spaces, Latin with spaces, and a mixed line), plus a translation, a romanization,
 * a background vocal and a chorus marking.
 */
export const DEMO_LINES: Line[] = [
    line('夜色沿着窗沿慢慢流下来', 0.4, 5.0, carve('夜色沿着窗沿慢慢流下来', 0.4, 5.0, 6), {
        translation: 'Night slides slowly down along the window ledge.',
        romanization: 'Yèsè yánzhe chuāngyán mànman liú xiàlái.',
        id: 'demo-0',
    }),
    line(
        'and every streetlight hums a chord I almost know',
        5.4,
        10.6,
        tokens(['and', 'every', 'streetlight', 'hums', 'a', 'chord', 'I', 'almost', 'know'], 5.4, 10.6),
        {
            translation: '每一盏路灯都在哼一段我几乎认得的和弦。',
            id: 'demo-1',
        },
    ),
    line('我把没说完的话折成纸船', 11.0, 15.8, carve('我把没说完的话折成纸船', 11.0, 15.8, 6), {
        translation: 'I fold the words I never finished into paper boats.',
        romanization: 'Wǒ bǎ méi shuōwán de huà zhé chéng zhǐchuán.',
        backgroundVocal: {
            text: 'let it go, let it drift',
            startTime: 12.0,
            endTime: 15.2,
            words: tokens(['let', 'it', 'go', 'let', 'it', 'drift'], 12.0, 15.2),
            translation: '让它去吧，让它漂走。',
        },
        id: 'demo-2',
    }),
    line(
        '每一道波纹都替我回答',
        16.2,
        20.6,
        carve('每一道波纹都替我回答', 16.2, 20.6, 5),
        { translation: 'Every ripple answers in my place.', id: 'demo-3' },
    ),
    line(
        'so turn the volume up until the silence breaks',
        21.0,
        26.2,
        tokens(['so', 'turn', 'the', 'volume', 'up', 'until', 'the', 'silence', 'breaks'], 21.0, 26.2),
        {
            translation: '所以把音量调大，直到沉默裂开。',
            isChorus: true,
            chorusEffect: 'bars',
            id: 'demo-4',
        },
    ),
    line('光穿过指缝落在琴键上', 26.6, 31.2, carve('光穿过指缝落在琴键上', 26.6, 31.2, 5), {
        translation: 'Light slips between my fingers and lands on the keys.',
        romanization: 'Guāng chuānguò zhǐfèng luò zài qínjiàn shàng.',
        id: 'demo-5',
    }),
    line(
        'we are only ever halfway home',
        31.6,
        36.2,
        tokens(['we', 'are', 'only', 'ever', 'halfway', 'home'], 31.6, 36.2),
        { translation: '我们永远只走到回家的一半。', isChorus: true, chorusEffect: 'bars', id: 'demo-6' },
    ),
    line('于是我把这首歌留在原地等你', 36.6, 41.4, carve('于是我把这首歌留在原地等你', 36.6, 41.4, 6), {
        translation: 'So I leave this song where it is, waiting for you.',
        romanization: 'Yúshì wǒ bǎ zhè shǒu gē liú zài yuándì děng nǐ.',
        id: 'demo-7',
    }),
];

/** How long the demo runs before it loops, in seconds. */
export const DEMO_DURATION = 42.6;
