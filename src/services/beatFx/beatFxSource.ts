// src/services/beatFx/beatFxSource.ts
//
// FUSION MUSIC fork note (AGPL-3.0, derived from Project Folia):
// Upstream Folia resolves per-track beat grids through an Electron main-process analysis
// pipeline (beat_this / htdemucs on the GPU, the media cache, the playback representation
// registry). None of that is part of this repository: Fusion Music ships the lyric-visual
// core only and has no Electron host.
//
// The visualizer still needs to describe *where* its beats came from, so this module keeps
// the upstream vocabulary (`BeatFxSourceKind`) and the result shape, while the lookup itself
// is supplied by the embedder. With no analyser registered the lookup answers `'none'`,
// which every consumer already treats as "no beats": the pictures fall back to their
// non-beat rendering path exactly as they do upstream on a machine without a usable GPU.

/** Where a track's beats came from. `'beat_this'` is upstream's on-device model. */
export type BeatFxSourceKind = 'beat_this' | 'none';

/** One beat-FX event, kept structurally identical to `clock.ts`'s own `BeatFxEvent`. */
export interface BeatFxTrackBeats {
    events: import('./clock').BeatFxEvent[];
    source: BeatFxSourceKind;
    /** Why there are no beats, when there are none. */
    note?: string;
    /** No beats only because the track's bytes are not to be had yet; worth asking again shortly. */
    retry?: boolean;
    /** The track's dynamics scale (0.45..1); 1 without accents. */
    trackScale: number;
    /** The same beats with accents, when these came without; null if they cannot be measured now. */
    accented?: Promise<BeatFxTrackBeats | null>;
}

/** How a drum-hit lookup ended: hits to play, none for this track, or no bytes yet (ask again). */
export type BeatFxTrackDrums = 'hits' | 'none' | 'retry';

/** Identifies the track (and the representation of it) an analysis belongs to. */
export interface BeatFxTrackRef {
    id: number | string;
    durationMs?: number;
    [key: string]: unknown;
}

/**
 * The embedder's way in. Fusion Music leaves this unset; an embedder that owns an analysis
 * pipeline sets it before any beat FX is shown.
 */
export interface BeatFxAnalyser {
    loadTrackBeats(
        song: BeatFxTrackRef,
        options?: { storedOnly?: boolean },
    ): { key: string; beats: Promise<BeatFxTrackBeats> };
    loadTrackDrums(
        song: BeatFxTrackRef,
        options?: { storedOnly?: boolean; vocals?: boolean },
    ): { key: string; drums: Promise<BeatFxTrackDrums> };
}

let analyser: BeatFxAnalyser | null = null;

/** Installs the embedder's analyser. Passing `null` restores the no-beats answer. */
export const setBeatFxAnalyser = (next: BeatFxAnalyser | null): void => {
    analyser = next;
};

/** The installed analyser, or null when this build has none. */
export const getBeatFxAnalyser = (): BeatFxAnalyser | null => analyser;

/** A stable key for a track whose beats were never analysed, so callers can still dedupe. */
const inertKey = (song: BeatFxTrackRef): string => `none:${String(song?.id ?? '')}`;

const noBeats = (): BeatFxTrackBeats => ({
    events: [],
    source: 'none',
    note: 'no beat analyser in this build (Fusion Music has no on-device analysis host)',
    trackScale: 1,
});

/**
 * The beat list for a track and the analysis key it belongs to. Without an installed analyser
 * this answers `'none'` at once; consumers treat that as "no beats" and render their fallback.
 */
export const loadBeatFxTrackBeats = (
    song: BeatFxTrackRef,
    { storedOnly = false } = {},
): { key: string; beats: Promise<BeatFxTrackBeats> } => {
    if (!analyser) return { key: inertKey(song), beats: Promise.resolve(noBeats()) };
    return analyser.loadTrackBeats(song, { storedOnly });
};

/**
 * Starts reading a track's drum hits. Without an installed analyser this answers `'none'`.
 */
export const loadBeatFxTrackDrums = (
    song: BeatFxTrackRef,
    { storedOnly = false, vocals = false } = {},
): { key: string; drums: Promise<BeatFxTrackDrums> } => {
    if (!analyser) return { key: inertKey(song), drums: Promise.resolve('none') };
    return analyser.loadTrackDrums(song, { storedOnly, vocals });
};
