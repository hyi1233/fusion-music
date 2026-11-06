// src/sources/types.ts — 音源层数据契约
import type { Track, LyricData, MusicSource } from '../types/music';
export type { Track, LyricData, MusicSource };

/** 平台搜索返回的标准化歌曲条目 */
export interface SongSummary {
  id: string; // 平台内的歌曲 ID（kuwo musicrid / kugou hash / qq songmid）
  title: string;
  artist: string;
  album: string;
  duration: number; // 秒
  source: 'kuwo' | 'kugou' | 'qq';
}

/** 音源层统一错误：message 面向用户可读 */
export class SourceError extends Error {
  /** 供 UI 分类的机器码 */
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SourceError';
    this.code = code;
  }
}

/** 限流（HTTP 429 或平台频控 code） */
export class RateLimitError extends SourceError {
  constructor(msg = '搜索太频繁，请稍后再试') {
    super('RATE_LIMITED', msg);
    this.name = 'RateLimitError';
  }
}

/** IP 被封（HTTP 403 / 平台封禁响应） */
export class IpBanError extends SourceError {
  constructor(msg = '当前 IP 已被音源限制，请稍后更换网络重试') {
    super('IP_BANNED', msg);
    this.name = 'IpBanError';
  }
}
