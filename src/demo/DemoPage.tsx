// src/demo/DemoPage.tsx
//
// The /demo page: the Folia lyric-visual core rendering static per-word lyric data, with no audio
// file, no network and no playback pipeline. It exists to prove the move — open it in a browser and
// the animation runs.
//
// It also doubles as a style browser: the mode picker switches between every builtin visualizer, so
// a reviewer can confirm the registry, the lazy renderers and the tuning layer all came across.
//
// Fusion Music code.

import React, { useMemo, useState } from 'react';
import VisualizerStage from '../components/visualizer/VisualizerStage';
import { BUILTIN_VISUALIZER_MODES } from '../types/visualizerModes';
import type { Theme, VisualizerMode } from '../types';
import { DEMO_DURATION, DEMO_LINES } from './demoLyrics';

/** Three palettes, so the theme plumbing is visible too and not just the lyrics. */
const DEMO_THEMES: Record<string, Theme> = {
    'Fusion Night': {
        name: 'Fusion Night',
        backgroundColor: '#05070d',
        primaryColor: '#e8f0ff',
        accentColor: '#7cc7ff',
        secondaryColor: '#9aa7bd',
        fontStyle: 'sans',
        animationIntensity: 'normal',
    },
    'Neon Riot': {
        name: 'Neon Riot',
        backgroundColor: '#12021c',
        primaryColor: '#ffe9fb',
        accentColor: '#ff4d9d',
        secondaryColor: '#b98cff',
        fontStyle: 'sans',
        animationIntensity: 'chaotic',
    },
    'Paper Ink': {
        name: 'Paper Ink',
        backgroundColor: '#f4efe6',
        primaryColor: '#221c14',
        accentColor: '#a8642a',
        secondaryColor: '#6b5c46',
        fontStyle: 'serif',
        animationIntensity: 'calm',
    },
};

const THEME_NAMES = Object.keys(DEMO_THEMES);

export default function DemoPage(): React.JSX.Element {
    const [mode, setMode] = useState<VisualizerMode>('classic');
    const [themeName, setThemeName] = useState(THEME_NAMES[0]);
    const [lineIndex, setLineIndex] = useState(-1);
    const [showText, setShowText] = useState(true);

    // The stage's own looping clock reports the line it is on; shown so a reviewer can see the
    // lyric data is really being walked, not just that pixels moved.
    const activeText = useMemo(() => {
        if (lineIndex < 0 || lineIndex >= DEMO_LINES.length) return '— 等待第一行 —';
        return DEMO_LINES[lineIndex].fullText;
    }, [lineIndex]);

    return (
        <div className="flex h-screen w-screen flex-col bg-slate-950 text-white">
            <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2 text-sm">
                <strong className="text-base">Fusion Music · Folia 歌词视觉 Demo</strong>
                <span className="text-white/40">静态逐字歌词 · 无音频 · {DEMO_LINES.length} 行</span>

                <label className="ml-auto flex items-center gap-2">
                    <span className="text-white/50">风格</span>
                    <select
                        value={mode}
                        onChange={e => setMode(e.target.value)}
                        className="rounded bg-white/10 px-2 py-1"
                    >
                        {BUILTIN_VISUALIZER_MODES.map(m => (
                            <option key={m} value={m} className="bg-slate-900">
                                {m}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex items-center gap-2">
                    <span className="text-white/50">主题</span>
                    <select
                        value={themeName}
                        onChange={e => setThemeName(e.target.value)}
                        className="rounded bg-white/10 px-2 py-1"
                    >
                        {THEME_NAMES.map(t => (
                            <option key={t} value={t} className="bg-slate-900">
                                {t}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showText} onChange={e => setShowText(e.target.checked)} />
                    <span className="text-white/50">歌词文字</span>
                </label>
            </header>

            <main className="relative flex-1">
                <VisualizerStage
                    lines={DEMO_LINES}
                    mode={mode}
                    theme={DEMO_THEMES[themeName]}
                    duration={DEMO_DURATION}
                    seed="fusion-demo"
                    songTitle="Fusion Music Demo"
                    songArtist="Folia visual core"
                    showText={showText}
                    onLineIndexChange={setLineIndex}
                />
            </main>

            <footer className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-xs text-white/50">
                <span className="tabular-nums">行 {lineIndex + 1} / {DEMO_LINES.length}</span>
                <span className="truncate text-white/80">{activeText}</span>
            </footer>
        </div>
    );
}
