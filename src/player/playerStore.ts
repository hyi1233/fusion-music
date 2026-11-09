// src/player/playerStore.ts — zustand 播放状态桥：把 AudioEngine 快照映射为 React 可订阅状态
import { create } from 'zustand';
import { audioEngine } from './audioEngine';
import { resolvePlayUrl } from '../sources';
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

async function hydrateUrls(tracks: Track[]): Promise<{ tracks: Track[]; error: string | null }> {
  let error: string | null = null;
  const hydrated = await Promise.all(
    tracks.map(async t => {
      if (t.url) return t;
      try {
        return { ...t, url: await resolvePlayUrl(t) };
      } catch (e) {
        // 解析失败的条目保留占位 url；错误信息带到 UI 上提示，
        // 否则用户只会看到「未播放」而不知道是音源被限流/封 IP。
        error = e instanceof Error ? e.message : String(e);
        return t;
      }
    }),
  );
  return { tracks: hydrated, error };
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

    playTracks: async (tracks, startIndex = 0) => {
      const token = ++resolveToken;
      set({ error: null });
      const { tracks: hydrated, error } = await hydrateUrls(tracks);
      if (token !== resolveToken) return; // 期间用户又点了新的，丢弃旧解析
      audioEngine.setQueue(hydrated, startIndex);
      set({ track: audioEngine.currentTrack, queue: audioEngine.queueTracks, error });
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
