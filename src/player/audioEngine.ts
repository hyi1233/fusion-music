// src/player/audioEngine.ts — HTMLAudioElement 封装：播放/暂停/seek/队列/上下首
import type { Track, PlaybackStatus } from '../types/music';

type Listener = () => void;

export class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private queue: Track[] = [];
  private index = -1;
  private listeners = new Set<Listener>();

  // 供 store 轮询/订阅的快照字段
  status: PlaybackStatus = 'stopped';
  currentTime = 0;
  duration = 0;
  volume = 1;
  /** 最近一次播放错误（音源解析失败 / 网络错误），用于在界面上提示 */
  lastError: string | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    this.listeners.forEach(fn => fn());
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const el = new Audio();
    el.preload = 'auto';
    el.addEventListener('timeupdate', () => {
      this.currentTime = el.currentTime;
      this.emit();
    });
    el.addEventListener('durationchange', () => {
      this.duration = Number.isFinite(el.duration) ? el.duration : 0;
      this.emit();
    });
    el.addEventListener('play', () => {
      this.status = 'playing';
      this.emit();
    });
    el.addEventListener('pause', () => {
      if (this.status !== 'loading') this.status = 'paused';
      this.emit();
    });
    el.addEventListener('ended', () => this.next());
    el.addEventListener('waiting', () => {
      this.status = 'loading';
      this.emit();
    });
    el.addEventListener('playing', () => {
      this.status = 'playing';
      this.emit();
    });
    el.addEventListener('error', () => {
      this.status = 'stopped';
      this.lastError = 'audio-load-failed';
      this.emit();
    });
    this.audio = el;
    return el;
  }

  get currentTrack(): Track | null {
    return this.queue[this.index] ?? null;
  }

  get queueTracks(): readonly Track[] {
    return this.queue;
  }

  get currentIndex(): number {
    return this.index;
  }

  setQueue(tracks: Track[], startIndex = 0): void {
    this.queue = [...tracks];
    this.index = startIndex;
    this.lastError = null;
    this.loadCurrent();
  }

  async addToQueue(track: Track): Promise<void> {
    this.queue.push(track);
    if (this.index === -1) {
      this.index = this.queue.length - 1;
      this.loadCurrent();
    }
    this.emit();
  }

  private loadCurrent(): void {
    const track = this.currentTrack;
    if (!track) return;
    const el = this.ensureAudio();
    this.status = 'loading';
    el.src = track.url;
    this.safePlay(el);
    this.emit();
  }

  /** play() 在部分环境（jsdom、旧浏览器）不返回 Promise，这里统一兜住 */
  private safePlay(el: HTMLAudioElement): void {
    try {
      const p = el.play() as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') {
        p.catch((e) => {
          this.lastError = e instanceof Error ? e.message : 'play-failed';
          this.status = 'stopped';
          this.emit();
        });
      }
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : 'play-failed';
      this.status = 'stopped';
      this.emit();
    }
  }

  toggle(): void {
    const el = this.ensureAudio();
    if (this.status === 'playing') el.pause();
    else this.safePlay(el);
  }

  pause(): void {
    this.ensureAudio().pause();
  }

  async play(): Promise<void> {
    const el = this.ensureAudio();
    try {
      const p = el.play() as Promise<void> | undefined;
      if (p && typeof p.then === 'function') await p.catch(() => undefined);
    } catch {
      /* 忽略：交由 error 事件兜底 */
    }
  }

  seek(seconds: number): void {
    if (!this.audio) return;
    this.audio.currentTime = seconds;
    this.currentTime = seconds;
    this.emit();
  }

  next(): void {
    if (this.index < this.queue.length - 1) {
      this.index += 1;
      this.loadCurrent();
    } else {
      this.pause();
      this.status = 'stopped';
      this.emit();
    }
  }

  previous(): void {
    if (this.index > 0) {
      this.index -= 1;
      this.loadCurrent();
    }
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.audio) this.audio.volume = this.volume;
    this.emit();
  }

  destroy(): void {
    this.audio?.pause();
    this.audio?.remove();
    this.audio = null;
    this.queue = [];
    this.index = -1;
    this.status = 'stopped';
    this.emit();
  }
}

export const audioEngine = new AudioEngine();
