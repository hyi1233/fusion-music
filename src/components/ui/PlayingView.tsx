// src/components/ui/PlayingView.tsx — 播放页：Folia 歌词舞台全屏 + 完整控制条 + 歌词样式面板
//
// t4 集成：把 t1 的 Folia 歌词视觉引擎接到 t2 的播放状态上。
// t5（F2a）：样式选择面板（中文菜单名）、音量、队列、遥控器提示，全部走 i18n。

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import VisualizerStage from '../visualizer/VisualizerStage';
import { BUILTIN_VISUALIZER_MODES, DEFAULT_VISUALIZER_MODE } from '../../types/visualizerModes';
import { fetchLyric, PLACEHOLDER_LINES } from '../../sources/lyrics';
import type { LyricData, Theme, VisualizerMode } from '../../types';
import type { LyricLine } from '../../types/music';
import { usePlayerStore } from '../../player/playerStore';
import { useFusionUiStore } from '../../stores/useFusionUiStore';
import { useFusionT } from '../../i18n/fusion/useFusionT';
import { LyricStylePicker } from './LyricStylePicker';

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

const formatTime = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(Math.max(s, 0) % 60)).padStart(2, '0')}`;

export function PlayingView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const t = useFusionT();
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const volume = usePlayerStore(s => s.volume);
  const queue = usePlayerStore(s => s.queue);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const error = usePlayerStore(s => s.error);
  const toggle = usePlayerStore(s => s.toggle);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const seek = usePlayerStore(s => s.seek);
  const setVolume = usePlayerStore(s => s.setVolume);

  const styleMode = useFusionUiStore(s => s.styleMode);
  const setStyleMode = useFusionUiStore(s => s.setStyleMode);

  const [styleOpen, setStyleOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  // 歌词数据：track 变化时异步取词（内存缓存）；未取到/失败回落占位行，不阻塞播放。
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

  const lyricData: LyricData = useMemo(() => loaded ?? PLACEHOLDER_LINES, [loaded]);

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (styleOpen) setStyleOpen(false);
        else if (queueOpen) setQueueOpen(false);
        else onBack();
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
        const idx = BUILTIN_VISUALIZER_MODES.indexOf(
          styleMode as (typeof BUILTIN_VISUALIZER_MODES)[number],
        );
        setStyleMode(BUILTIN_VISUALIZER_MODES[(idx + 1) % BUILTIN_VISUALIZER_MODES.length]);
      }
    },
    [onBack, toggle, next, previous, seek, currentTime, duration, styleMode, setStyleMode, styleOpen, queueOpen],
  );

  const statusText =
    status === 'playing'
      ? t('playing.nowPlaying')
      : status === 'loading'
        ? t('playing.loading')
        : status === 'paused'
          ? t('playing.paused')
          : t('playing.stopped');

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
          mode={styleMode}
          currentTime={currentTime}
          duration={duration || undefined}
          theme={DEFAULT_THEME}
          seed={track?.id ?? 'fusion'}
          songTitle={track?.title ?? null}
          songArtist={track?.artist ?? null}
          showText
        />
        <button
          onClick={onBack}
          className="absolute left-4 top-3 flex items-center gap-1 rounded-full bg-black/40 px-3 py-1.5 text-sm text-white/80 transition hover:bg-black/60"
        >
          <ChevronLeft size={16} />
          {t('playing.back')}
        </button>
        <div className="pointer-events-none absolute right-4 top-3 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/60">
          {t(`style.${styleMode}`)}
        </div>
      </div>

      {/* 控制条 */}
      <div className="flex flex-col gap-3 bg-black/75 p-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            <TriangleAlert size={14} className="mt-0.5 shrink-0 text-rose-300" />
            <div className="min-w-0">
              <p className="font-medium">{t('playing.errorTitle')}</p>
              <p className="text-rose-100/80">{t('playing.errorHint')}</p>
              <p className="truncate text-rose-100/60">{t('playing.errorDetail', { message: error })}</p>
            </div>
          </div>
        )}
        <div className="flex items-baseline gap-3">
          <span className="truncate text-lg font-medium text-white">{track?.title ?? t('settings.noTrack')}</span>
          <span className="truncate text-sm text-white/50">{track?.artist ?? ''}</span>
          <span className="ml-auto text-xs text-white/40">{statusText}</span>
        </div>

        <div className="flex items-center gap-3 text-sm text-white/60">
          <span className="tabular-nums">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={currentTime}
            onChange={e => seek(Number(e.target.value))}
            aria-label={t('playing.progress')}
            className="flex-1 accent-sky-400"
          />
          <span className="tabular-nums">{formatTime(duration)}</span>
        </div>

        <div className="flex items-center justify-center gap-5 text-white">
          <button
            onClick={previous}
            aria-label={t('playing.previous')}
            className="rounded-full bg-white/10 p-3 transition hover:bg-white/20"
          >
            <SkipBack size={20} />
          </button>
          <button
            onClick={toggle}
            aria-label={status === 'playing' ? t('playing.pause') : t('playing.play')}
            className="rounded-full bg-sky-500 p-4 transition hover:bg-sky-400"
          >
            {status === 'playing' ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button
            onClick={next}
            aria-label={t('playing.next')}
            className="rounded-full bg-white/10 p-3 transition hover:bg-white/20"
          >
            <SkipForward size={20} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              setVolume(nextMuted ? 0 : 1);
            }}
            aria-label={muted ? t('playing.unmute') : t('playing.mute')}
            className="rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20"
          >
            {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={e => {
              setMuted(false);
              setVolume(Number(e.target.value));
            }}
            aria-label={t('playing.volume')}
            className="w-40 accent-sky-400"
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setStyleOpen(v => !v)}
              className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/85 transition hover:bg-white/20"
            >
              {t('playing.styleButton')}
            </button>
            <button
              onClick={() => setQueueOpen(v => !v)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm text-white/85 transition hover:bg-white/20"
            >
              <ListMusic size={15} />
              {t('playing.queue')}
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-white/30">{t('playing.hint')}</div>
      </div>

      {/* 歌词样式面板 */}
      {styleOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-[#0b1220] p-5 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">{t('playing.styleTitle')}</h3>
              <button
                onClick={() => setStyleOpen(false)}
                aria-label={t('common.close')}
                className="rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-xs text-white/45">
              {t('playing.styleHint')} · {t('playing.styleOf', { count: BUILTIN_VISUALIZER_MODES.length })}
            </p>
            <LyricStylePicker value={styleMode} onChange={setStyleMode} />
          </div>
        </div>
      ) : null}

      {/* 播放队列 */}
      {queueOpen ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#0b1220] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">{t('playing.queue')}</h3>
              <button
                onClick={() => setQueueOpen(false)}
                aria-label={t('common.close')}
                className="rounded-full bg-white/10 p-1.5 text-white/70 hover:bg-white/20"
              >
                <X size={16} />
              </button>
            </div>
            {queue.length ? (
              <ol className="flex flex-col gap-1">
                {queue.map((item, i) => (
                  <li
                    key={`${item.id}-${i}`}
                    className={[
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm',
                      i === currentIndex ? 'bg-sky-500/20 text-white' : 'text-white/70',
                    ].join(' ')}
                  >
                    <span className="w-5 text-right tabular-nums text-white/35">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="truncate text-xs text-white/40">{item.artist}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="py-6 text-center text-sm text-white/40">{t('playing.queueEmpty')}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
