// src/components/visualizer/VisualizerStage.tsx
//
// FUSION MUSIC — the mountable entry point for the Folia lyric-visual core.
//
// Upstream Project Folia drives the visualizer from a live playback pipeline (audio element →
// AnalyserNode → motion values, an automix crossfade graph, a song hand-off). Fusion Music has no
// such pipeline inside the visual core: it exposes one component that takes lyric lines and a
// playback clock, and builds the motion values the visualizer contract expects itself.
//
// Two ways to drive it:
//   * `currentTime` + `duration` (seconds) — the host owns the clock (a real <audio> element, a
//     video, a scrubber). The stage follows it.
//   * neither — the stage runs its own looping clock over the lines it was given, which is what the
//     /demo page uses so a browser can show the animation with no media at all.
//
// The visual style renders through the upstream registry (all builtin modes), so every AGPL-covered
// renderer keeps its original file header. This file is new Fusion Music code.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motionValue, useMotionValue, useSpring, type MotionValue } from 'framer-motion';
import VisualizerRenderer from './VisualizerRenderer';
import { BUILTIN_VISUALIZER_MODES, DEFAULT_VISUALIZER_MODE } from '../../types/visualizerModes';
import type { AudioBands, Line, Theme, VisualizerMode } from '../../types';

/** The silent stand-in a band motion value holds when nothing is analysing audio. */
const SILENT_BAND: MotionValue<number> = motionValue(0);

/** The theme Fusion Music falls back to when the caller does not supply one. */
export const DEFAULT_STAGE_THEME: Theme = {
    name: 'Fusion Night',
    backgroundColor: '#05070d',
    primaryColor: '#e8f0ff',
    accentColor: '#7cc7ff',
    secondaryColor: '#9aa7bd',
    fontStyle: 'sans',
    animationIntensity: 'normal',
};

export interface VisualizerStageProps {
    /** The lyric lines to render, in time order. */
    lines: Line[];
    /** The style to draw. Defaults to the builtin default (`classic`). */
    mode?: VisualizerMode;
    /** The playback clock in seconds. When omitted the stage runs its own looping clock. */
    currentTime?: number;
    /**
     * A host-driven clock as a motion value, for hosts that advance it every animation frame
     * (the RN WebView layer does: `setCurrentTime` arrives at 10–20 Hz, the local rAF clock at 60).
     * When given it wins over `currentTime`, and the stage does not re-render per frame.
     */
    clock?: MotionValue<number>;
    /** The song length in seconds, used by styles that read it. */
    duration?: number;
    /** The colours and typography the styles draw with. */
    theme?: Theme;
    /** A stable seed for the random choices a style makes, so one song always looks the same. */
    seed?: string | number;
    songTitle?: string | null;
    songArtist?: string | null;
    songAlbum?: string | null;
    coverUrl?: string | null;
    /** Whether the lyric text itself is drawn (styles that draw their own text ignore it). */
    showText?: boolean;
    /** Freezes the style's own motion while keeping the lyric clock running. */
    staticMode?: boolean;
    /** A 0..1 multiplier on the visualizer layer's opacity. */
    visualizerOpacity?: number;
    /** Extra classes on the full-bleed wrapper. */
    className?: string;
    /** Reports the line index currently on screen, for a host that follows the stage's own clock. */
    onLineIndexChange?: (index: number) => void;
}

/**
 * The index of the line that should be on screen at `time`: the last line whose start has passed,
 * or -1 before the first one. The visualizer expects -1 (not 0) before the first line, which is how
 * upstream's runtime reports it too.
 */
export const findActiveLineIndex = (lines: Line[], time: number): number => {
    let active = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (time >= lines[i].startTime) active = i;
        else break;
    }
    return active;
};

/** Where a set of lines ends, for the stage's own looping clock. */
export const getLinesEndTime = (lines: Line[]): number => (
    lines.reduce((end, line) => Math.max(end, line.endTime || line.startTime || 0), 0)
);

/**
 * A looping clock over `lines`, used when the host supplies no `currentTime`. It advances with the
 * browser's animation frames so the visualizer's spring-driven motion values stay smooth, and wraps
 * back to the first line once the last one has been held for `holdSeconds`.
 */
const useDemoClock = (
    enabled: boolean,
    lines: Line[],
    holdSeconds: number,
): { time: MotionValue<number>; index: number } => {
    const clock = useMotionValue(0);
    const [index, setIndex] = useState(-1);
    const end = useMemo(() => getLinesEndTime(lines), [lines]);
    const loopEnd = end > 0 ? end + holdSeconds : 0;

    useEffect(() => {
        if (!enabled || loopEnd <= 0) return undefined;
        let frame = 0;
        let startedAt = performance.now();
        const tick = () => {
            const elapsed = (performance.now() - startedAt) / 1000;
            if (elapsed >= loopEnd) {
                // Wrap rather than stop: the demo is an animation, not a playback.
                startedAt = performance.now();
                clock.set(0);
            } else {
                clock.set(elapsed);
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [enabled, loopEnd, clock]);

    useEffect(() => {
        if (!enabled) return undefined;
        const update = (value: number) => setIndex(findActiveLineIndex(lines, value));
        update(clock.get());
        return clock.on('change', update);
    }, [enabled, lines, clock]);

    return { time: clock, index };
};

const VisualizerStage: React.FC<VisualizerStageProps> = ({
    lines,
    mode = DEFAULT_VISUALIZER_MODE,
    currentTime,
    clock: hostClock,
    duration,
    theme = DEFAULT_STAGE_THEME,
    seed,
    songTitle,
    songArtist,
    songAlbum,
    coverUrl,
    showText = true,
    staticMode = false,
    visualizerOpacity,
    className,
    onLineIndexChange,
}) => {
    const driven = typeof currentTime === 'number' || hostClock !== undefined;
    // Only one of the two clocks runs; the other is inert but still a valid motion value, because
    // the visualizer contract requires one either way.
    const { time: demoTime, index: demoIndex } = useDemoClock(!driven, lines, 1.6);
    const externalTime = useMotionValue(currentTime ?? 0);

    useEffect(() => {
        if (driven && !hostClock) externalTime.set(currentTime as number);
    }, [driven, currentTime, hostClock, externalTime]);

    const clock = hostClock ?? (driven ? externalTime : demoTime);
    const [trackedIndex, setTrackedIndex] = useState(-1);

    useEffect(() => {
        if (driven) {
            const update = (value: number) => setTrackedIndex(findActiveLineIndex(lines, value));
            update(clock.get());
            return clock.on('change', update);
        }
        return undefined;
    }, [driven, lines, clock]);

    const index = driven ? trackedIndex : demoIndex;

    useEffect(() => {
        onLineIndexChange?.(index);
    }, [index, onLineIndexChange]);

    // A smoothed 0..1 "loudness" derived from the lyric clock, so effects that pulse with the music
    // still have something to move to. It is deliberately gentle: a fake, aggressive envelope reads
    // as a glitch rather than as music.
    const pulse = useMotionValue(0);
    useEffect(() => {
        const update = (value: number) => {
            const beat = 0.5 + 0.5 * Math.sin(value * Math.PI * 1.6);
            pulse.set(0.35 + 0.65 * beat);
        };
        update(clock.get());
        return clock.on('change', update);
    }, [clock, pulse]);
    const audioPower = useSpring(pulse, { stiffness: 90, damping: 18, mass: 0.6 });

    // The five bands share the single pulse: with no analyser there is nothing that could separate
    // them, and inventing five unrelated signals would make the styles jitter incoherently.
    const audioBands: AudioBands = useMemo(
        () => ({ bass: audioPower, lowMid: audioPower, mid: audioPower, vocal: audioPower, treble: SILENT_BAND }),
        [audioPower],
    );

    const resolvedDuration = duration ?? getLinesEndTime(lines);

    return (
        <div className={className ?? 'relative h-full w-full overflow-hidden'} style={{ background: theme.backgroundColor }}>
            <VisualizerRenderer
                mode={mode}
                currentTime={clock}
                duration={resolvedDuration}
                currentLineIndex={index}
                lines={lines}
                theme={theme}
                audioPower={audioPower}
                audioBands={audioBands}
                showText={showText}
                songTitle={songTitle}
                songArtist={songArtist}
                songAlbum={songAlbum}
                coverUrl={coverUrl}
                seed={seed ?? resolvedDuration}
                staticMode={staticMode}
                visualizerOpacity={visualizerOpacity}
            />
        </div>
    );
};

export default VisualizerStage;

/** The style ids the stage can be asked for, for a host that builds a picker. */
export const STAGE_MODES = BUILTIN_VISUALIZER_MODES;
