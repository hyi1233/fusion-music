// src/components/ui/PlayingView.tsx — 播放页：VisualizerStage 全屏动态歌词 + 控制条
// t4 集成：把 t1 的 Folia 歌词视觉引擎接到 t2 的播放状态上。
import { useCallback, useEffect, useMemo, useState } from 'react';
import VisualizerStage from '../visualizer/VisualizerStage';
import { BUILTIN_VISUALIZER_MODES, DEFAULT_VISUALIZER_MODE } from '../../types/visualizerModes';
import { parseLRC } from '../../utils/lyrics/parserCore';
import type { LyricData } from '../../types';
import type { Theme } from '../../types';
import { usePlayerStore } from '../../player/playerStore';
import { fetchLyric, PLACEHOLDER_LINES } from '../../sources/lyrics';
import type { LyricLine } from '../../types/music';

/** 默认主题（Folia 的 Theme 契约） */
const DEFAULT_THEME: Theme = {
    name: 'Fusion Night',
    backgroundColor: '#05070d',
    primaryColor: '#e8f0ff',
    accentColor: '#7cc7ff',
    secondaryColor: '#9aa7bd',
    fontStyle: 'sans',
    animationIntensity: 'normal',
};

/**
 * 占位歌词已移到 sources/lyrics.ts（PLACEHOLDER_LINES）：取词失败/无词时回落，
 * 播放不阻塞。
 */

/** LyricLine[]（music.ts 简版）→ Folia Line[]（types.ts 完整契约） */
function toFoliaLines(simple: LyricLine[]): import('../../types').Line[] {
    return simple.map((l, i) => {
        const next = simple[i + 1];
        return {
            words: [{ text: l.text, startTime: l.time, endTime: next ? next.time : l.time + 5 }],
            startTime: l.time,
            endTime: next ? next.time : l.time + 5,
            fullText: l.text,
            translation: l.translation,
            id: `L${i}`,
        };
    });
}

export function PlayingView({ onBack }: { onBack: () => void }): React.JSX.Element {
    const track = usePlayerStore(s => s.track);
    const status = usePlayerStore(s => s.status);
    const currentTime = usePlayerStore(s => s.currentTime);
    const duration = usePlayerStore(s => s.duration);
    const toggle = usePlayerStore(s => s.toggle);
    const next = usePlayerStore(s => s.next);
    const previous = usePlayerStore(s => s.previous);
    const seek = usePlayerStore(s => s.seek);
    const [mode, setMode] = useState<import('../../types').VisualizerMode>(DEFAULT_VISUALIZER_MODE);

    // 歌词数据：track 变化时异步取词（内存缓存）；未取到/失败回落占位行，不阻塞播放。
    // 保留完整 Folia Line[]（QRC 逐字时间不丢失）
    const [loaded, setLoaded] = useState<LyricData | null>(null);
    useEffect(() => {
        let alive = true;
        setLoaded(null);
        if (track) {
            void fetchLyric(track).then(data => {
                if (alive) setLoaded(data);
            });
        }
        return () => {
            alive = false;
        };
    }, [track]);

    const lyricData: LyricData = useMemo(
        () => loaded ?? PLACEHOLDER_LINES,
        [loaded],
    );

    const onKeyUp = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onBack();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                toggle();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                seek(Math.min(currentTime + 10, duration));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                seek(Math.max(currentTime - 10, 0));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                next();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                previous();
            } else if (e.key === 'Tab') {
                // 电视上没有鼠标，用 Tab 循环切换歌词样式
                e.preventDefault();
                const idx = BUILTIN_VISUALIZER_MODES.indexOf(mode as (typeof BUILTIN_VISUALIZER_MODES)[number]);
                setMode(BUILTIN_VISUALIZER_MODES[(idx + 1) % BUILTIN_VISUALIZER_MODES.length]);
            }
        },
        [onBack, toggle, next, previous, seek, currentTime, duration, mode],
    );

    const fmt = (s: number): string =>
        `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

    return (
        <div
            className="relative flex h-full flex-col outline-none"
            tabIndex={0}
            onKeyDown={onKeyUp}
            autoFocus
        >
            {/* Folia 歌词引擎全屏舞台 */}
            <div className="relative flex-1 overflow-hidden">
                <VisualizerStage
                    lines={lyricData.lines}
                    mode={mode}
                    currentTime={currentTime}
                    duration={duration || undefined}
                    theme={DEFAULT_THEME}
                    seed={track?.id ?? 'fusion'}
                    songTitle={track?.title ?? null}
                    songArtist={track?.artist ?? null}
                    showText
                />
                <div className="pointer-events-none absolute left-4 top-3 text-xs text-white/40">
                    样式: {mode}（Tab 键切换）
                </div>
            </div>

            {/* 控制条 */}
            <div className="flex flex-col gap-2 bg-black/70 p-4">
                <div className="flex items-baseline gap-3">
                    <span className="truncate text-lg font-medium text-white">{track?.title ?? '未播放'}</span>
                    <span className="truncate text-sm text-white/50">{track?.artist ?? ''}</span>
                    <span className="ml-auto text-xs text-white/40">
                        {status === 'playing' ? '播放中' : status === 'loading' ? '缓冲中…' : '已暂停'}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/60">
                    <span>{fmt(currentTime)}</span>
                    <input
                        type="range"
                        min={0}
                        max={Math.max(duration, 1)}
                        step={1}
                        value={currentTime}
                        onChange={e => seek(Number(e.target.value))}
                        className="flex-1 accent-sky-400"
                    />
                    <span>{fmt(duration)}</span>
                </div>
                <div className="flex items-center justify-center gap-6 text-white">
                    <button onClick={previous} className="rounded-full bg-white/10 px-5 py-2 text-xl">
                        ⏮
                    </button>
                    <button onClick={toggle} className="rounded-full bg-sky-500 px-8 py-3 text-2xl">
                        {status === 'playing' ? '⏸' : '▶'}
                    </button>
                    <button onClick={next} className="rounded-full bg-white/10 px-5 py-2 text-xl">
                        ⏭
                    </button>
                </div>
                <div className="text-center text-xs text-white/30">
                    遥控器：↑↓ 切歌 · ←→ ±10s · Enter 播放/暂停 · Tab 换歌词样式 · Escape 返回
                </div>
            </div>
        </div>
    );
}
