// src/types/music.ts — Fusion Music core data contracts (M2a)

/** 一首歌（搜索结果 / 队列条目通用） */
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // 秒
  cover: string; // 图片 URL（mock 阶段可为 data URI 或占位）
  /** 音频流 URL；mock 阶段用静音占位音频 */
  url: string;
}

/** 一行歌词；时间单位为秒（浮点），与 Folia 歌词引擎对齐时再换算 */
export interface LyricLine {
  time: number;
  text: string;
  /** 翻译行（可选，Folia 双语歌词） */
  translation?: string;
}

/** 交给 visualizer 的歌词数据包 */
export interface LyricData {
  lines: LyricLine[];
  /** 是否逐字歌词（karaoke 效果用）；逐行歌词为 false */
  wordByWord: boolean;
}

/** visualizer 需要的播放状态 */
export type PlaybackStatus = 'stopped' | 'playing' | 'paused' | 'loading';

/**
 * VisualizerStage 对外 props 契约 —— Folia visualizer 搬入后唯一对接面。
 * 只依赖这些字段，不 import 播放内核内部状态。
 */
export interface VisualizerStageProps {
  track: Track | null;
  lyrics: LyricData | null;
  /** 当前播放进度（秒），rAF 级刷新由内核 store 提供 */
  currentTime: number;
  duration: number;
  status: PlaybackStatus;
  /** 音量 0..1，供可视化强度参考 */
  volume: number;
}

/** 搜索服务接口：M2b 换成洛雪协议真实实现时签名不变 */
export interface MusicSource {
  name: string;
  search(keyword: string): Promise<Track[]>;
  getLyric(track: Track): Promise<LyricData>;
  /** 取可播放的流地址 */
  getPlayUrl(track: Track): Promise<string>;
}
