// src/player/playerStore.ts — zustand 播放状态桥：把 AudioEngine 快照映射为 React 可订阅状态
import { create } from 'zustand';
import { audioEngine } from './audioEngine';
import { resolvePlayUrlWithFallback, type ResolveAttempt } from '../sources';
import type { Track, PlaybackStatus } from '../types/music';

interface PlayerState {
  track: Track | null;
  queue: readonly Track[];
  currentIndex: number;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  volume: number;
  /** 播放错误信息（音源解析失败 / 音频加载失败），null 表示正常 */
  error: string | null;
  /** 最近一次取链的逐源尝试记录（成功源 / 每个失败源的原因） */
  resolveAttempts: ResolveAttempt[];
  /** 播放前把无 url 的 Track 经洛雪音源解析为真实流地址 */
  playTracks: (tracks: Track[], startIndex?: number) => Promise<void>;
  playTrack: (track: Track) => Promise<void>;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
}

let unsubscribe: (() => void) | null = null;
let resolveToken = 0;

async function hydrateUrls(
  tracks: Track[],
): Promise<{ tracks: Track[]; error: string | null; attempts: ResolveAttempt[] }> {
  let error: string | null = null;
  const allAttempts: ResolveAttempt[] = [];
  const hydrated = await Promise.all(
    tracks.map(async t => {
      if (t.url) return t;
      try {
        const result = await resolvePlayUrlWithFallback(t);
        allAttempts.push(...result.attempts);
        return { ...t, url: result.url };
      } catch (e) {
        // 解析失败的条目保留占位 url；错误信息带到 UI 上提示，
        // 否则用户只会看到「未播放」而不知道是音源被限流/封 IP。
        error = e instanceof Error ? e.message : String(e);
        const attempts = (e as { attempts?: ResolveAttempt[] }).attempts;
        if (Array.isArray(attempts)) allAttempts.push(...attempts);
        return t;
      }
    }),
  );
  return { tracks: hydrated, error, attempts: allAttempts };
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  if (!unsubscribe) {
    unsubscribe = audioEngine.subscribe(() => {
      set({
        track: audioEngine.currentTrack,
        queue: audioEngine.queueTracks,
        currentIndex: audioEngine.currentIndex,
        status: audioEngine.status,
        currentTime: audioEngine.currentTime,
        duration: audioEngine.duration,
        volume: audioEngine.volume,
        error: audioEngine.lastError,
      });
    });
  }

  return {
    track: null,
    queue: [],
    currentIndex: -1,
    status: 'stopped',
    currentTime: 0,
    duration: 0,
    volume: 1,
    error: null,
    resolveAttempts: [],

    playTracks: async (tracks, startIndex = 0) => {
      const token = ++resolveToken;
      set({ error: null, resolveAttempts: [] });
      const { tracks: hydrated, error, attempts } = await hydrateUrls(tracks);
      if (token !== resolveToken) return; // 期间用户又点了新的，丢弃旧解析
      audioEngine.setQueue(hydrated, startIndex);
      set({
        track: audioEngine.currentTrack,
        queue: audioEngine.queueTracks,
        error,
        resolveAttempts: attempts,
      });
    },

    playTrack: async track => {
      await get().playTracks([track], 0);
    },

    toggle: () => audioEngine.toggle(),
    next: () => audioEngine.next(),
    previous: () => audioEngine.previous(),
    seek: seconds => audioEngine.seek(seconds),
    setVolume: v => audioEngine.setVolume(v),
  };
});
