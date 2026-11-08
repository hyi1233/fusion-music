// src/webview/playbackClock.ts
//
// 宿主的 `setCurrentTime` 通常只有 10~20Hz（RN 侧 setProgress 回调的节奏），而视觉层要 60fps
// 的时钟才能让逐字光晕、弹簧跟手。这里把"宿主给的锚点"和"本页 rAF 的本地时间"合起来：
//
//   - 播放中：按锚点 + 本地经过时间推算；
//   - 每次新锚点到：漂移小（< snapThreshold）就保留相位、只吸收一部分误差（不抖），
//     漂移大（seek / 换歌 / 暂停恢复）就直接吸附；
//   - 暂停：时钟冻结在宿主给的位置。
//
// 纯函数（`nowMs` 由调用方传入），单测不需要 rAF。

export interface PlaybackClockState {
    /** 锚点处的播放时间（秒）。 */
    time: number;
    /** 锚点的本地时间（performance.now()，毫秒）。 */
    at: number;
    playing: boolean;
    /** 播放速率，正常为 1（预留倍速）。 */
    rate: number;
    /** 歌曲总时长（秒）；有值时时钟封顶，不会推进到曲末之后。 */
    duration?: number;
}

export interface SyncClockOptions {
    /** 本次命令到达时的本地时间（performance.now()）。 */
    nowMs: number;
    playing?: boolean;
    /** 超过这个漂移（秒）直接吸附，默认 0.35。 */
    snapThreshold?: number;
    /** 小漂移时每次吸收的比例，默认 0.25（10Hz 下约 1 秒收敛）。 */
    correction?: number;
    /** 歌曲总时长（秒），用于封顶。 */
    duration?: number;
}

export const DEFAULT_SNAP_THRESHOLD = 0.35;
export const DEFAULT_CORRECTION = 0.25;

export const createPlaybackClock = (
    initialTime = 0,
    nowMs = 0,
    playing = false,
    duration?: number,
): PlaybackClockState => ({
    time: Math.max(0, initialTime),
    at: nowMs,
    playing,
    rate: 1,
    ...(typeof duration === 'number' && duration > 0 ? { duration } : {}),
});

const clampToDuration = (value: number, duration?: number): number => (
    typeof duration === 'number' && duration > 0 ? Math.min(value, duration) : value
);

/** 当前推算出的播放时间（秒）。本地时间倒退（时钟回拨）时按 0 处理，保持单调。 */
export const clockTimeAt = (state: PlaybackClockState, nowMs: number): number => {
    const elapsed = Math.max(0, nowMs - state.at) / 1000;
    const advanced = state.playing ? state.time + elapsed * state.rate : state.time;
    return Math.max(0, clampToDuration(advanced, state.duration));
};

/** 宿主锚点到达：返回新的时钟状态。 */
export const syncPlaybackClock = (
    state: PlaybackClockState,
    target: number,
    options: SyncClockOptions,
): PlaybackClockState => {
    const nowMs = options.nowMs;
    const playing = options.playing ?? state.playing;
    const duration = typeof options.duration === 'number' && options.duration > 0
        ? options.duration
        : state.duration;
    let targetTime = clampToDuration(Math.max(0, Number.isFinite(target) ? target : 0), duration);

    if (!playing) {
        return { time: targetTime, at: nowMs, playing: false, rate: state.rate, ...(duration ? { duration } : {}) };
    }

    const predicted = clockTimeAt(state, nowMs);
    const drift = targetTime - predicted;
    const threshold = options.snapThreshold ?? DEFAULT_SNAP_THRESHOLD;
    if (Math.abs(drift) > threshold) {
        return { time: targetTime, at: nowMs, playing: true, rate: state.rate, ...(duration ? { duration } : {}) };
    }

    const correction = options.correction ?? DEFAULT_CORRECTION;
    const corrected = Math.max(0, predicted + drift * correction);
    return {
        time: clampToDuration(corrected, duration),
        at: nowMs,
        playing: true,
        rate: state.rate,
        ...(duration ? { duration } : {}),
    };
};
