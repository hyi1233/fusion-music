// src/components/ui/PlayingView.tsx — 全屏沉浸动态歌词舞台（老大切实定案交互）
// 1. 默认无任何按钮遮挡，100% 全屏展现 Folia 流体背景 + 粒子微动 + 逐字发光歌词。
// 2. 单击屏幕任意位置（或歌词）：浮现半透明磨砂控制栏（上一首、下一首、暂停、进度滑块、动效切换）。
// 3. 3.5 秒无交互自动淡出隱入黑暗，重归视听纯粹。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ListMusic,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import VisualizerStage from '../visualizer/VisualizerStage';
import { VISUALIZER_REGISTRY } from '../visualizer/registry';
import { DEFAULT_VISUALIZER_MODE } from '../../types/visualizerModes';
import { fetchLyric, PLACEHOLDER_LINES } from '../../sources/lyrics';
import type { LyricData, Theme, VisualizerMode } from '../../types';
import { usePlayerStore } from '../../player/playerStore';
import { useFusionUiStore } from '../../stores/useFusionUiStore';
import { useFusionT } from '../../i18n/fusion/useFusionT';
import { LyricStylePicker } from './LyricStylePicker';

/** 沉浸式暗色主题（Folia Theme 契约） */
const IMMERSIVE_THEME: Theme = {
  name: 'Coral Obsidian',
  backgroundColor: '#070a13',
  primaryColor: '#ffffff',
  accentColor: '#ff6b81', // 珊瑚粉红主强调色
  secondaryColor: '#94a3b8',
  fontStyle: 'sans',
  animationIntensity: 'normal',
};

const formatTime = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(Math.max(s, 0) % 60)).padStart(2, '0')}`;

export function PlayingView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const t = useFusionT();
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const queue = usePlayerStore(s => s.queue);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const toggle = usePlayerStore(s => s.toggle);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const seek = usePlayerStore(s => s.seek);
  const playTracks = usePlayerStore(s => s.playTracks);

  const styleMode = useFusionUiStore(s => s.styleMode);
  const setStyleMode = useFusionUiStore(s => s.setStyleMode);

  // 核心交互状态：控制栏是否显示（默认纯净隐藏）
  const [showControls, setShowControls] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 歌词数据获取
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

  // 重置自动隐藏定时器（唤醒后 3.5 秒无操作自动淡出）
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
      setStyleOpen(false);
      setQueueOpen(false);
    }, 3800);
  }, []);

  const handleStageClick = useCallback(() => {
    setShowControls(prev => {
      const nextState = !prev;
      if (nextState) {
        resetHideTimer();
      } else {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setStyleOpen(false);
        setQueueOpen(false);
      }
      return nextState;
    });
  }, [resetHideTimer]);

  // 当处于控制显示状态且有交互时延长时间
  const handleUserActivity = useCallback(() => {
    if (showControls) resetHideTimer();
  }, [showControls, resetHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // 键盘快捷键响应
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      handleUserActivity();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (styleOpen) setStyleOpen(false);
        else if (queueOpen) setQueueOpen(false);
        else onBack();
      } else if (e.key === ' ') {
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
      }
    },
    [onBack, toggle, next, previous, seek, currentTime, duration, styleOpen, queueOpen, handleUserActivity],
  );

  return (
    <div
      className="relative h-screen w-screen overflow-hidden select-none bg-slate-950 font-sans outline-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={handleStageClick}
      onMouseMove={handleUserActivity}
      autoFocus
    >
      {/* 1. 100% 绝对铺满全屏的 Folia 动态歌词舞台 */}
      <div className="absolute inset-0 h-full w-full">
        <VisualizerStage
          lines={lyricData.lines}
          mode={styleMode}
          currentTime={currentTime}
          duration={duration || undefined}
          theme={IMMERSIVE_THEME}
          seed={track?.id ?? 'coral-fusion'}
          songTitle={track?.title ?? null}
          songArtist={track?.artist ?? null}
          showText
        />
      </div>

      {/* 2. 单击唤出：顶部轻量浮动信息条 */}
      <div
        onClick={e => e.stopPropagation()}
        className={`pointer-events-auto absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 px-3.5 py-2 text-sm font-medium text-white/90 backdrop-blur-md transition"
        >
          <ChevronLeft size={18} />
          <span>返回</span>
        </button>

        <div className="flex flex-col items-center max-w-[60%] text-center">
          <span className="truncate text-base font-semibold text-white drop-shadow">
            {track?.title ?? '暂无播放歌曲'}
          </span>
          <span className="truncate text-xs text-white/60 drop-shadow">
            {track?.artist ?? '未知歌手'}
          </span>
        </div>

        <button
          onClick={() => {
            setStyleOpen(v => !v);
            resetHideTimer();
          }}
          className="flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 px-3 py-1.5 text-xs text-white/80 backdrop-blur-md transition"
        >
          <SlidersHorizontal size={14} className="text-rose-400" />
          <span>{t(`style.${styleMode}`)}</span>
        </button>
      </div>

      {/* 3. 单击唤出：底部悬浮半透明控制胶囊 */}
      <div
        onClick={e => e.stopPropagation()}
        className={`pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-xl flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/60 p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95 pointer-events-none'
        }`}
      >
        {/* 进度条与播放时间 */}
        <div className="flex items-center gap-3 text-xs text-white/70">
          <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={currentTime}
            onChange={e => {
              seek(Number(e.target.value));
              resetHideTimer();
            }}
            className="flex-1 accent-rose-500 hover:accent-rose-400 transition cursor-pointer"
          />
          <span className="w-10 tabular-nums">{formatTime(duration)}</span>
        </div>

        {/* 核心播放控制器：上一首 / 播放暂停 / 下一首 */}
        <div className="flex items-center justify-between px-2 pt-1">
          <button
            onClick={() => {
              setQueueOpen(v => !v);
              resetHideTimer();
            }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white transition"
          >
            <ListMusic size={16} />
            <span>队列 ({queue.length})</span>
          </button>

          <div className="flex items-center gap-6">
            <button
              onClick={() => {
                previous();
                resetHideTimer();
              }}
              title="上一首"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition"
            >
              <SkipBack size={18} />
            </button>

            <button
              onClick={() => {
                toggle();
                resetHideTimer();
              }}
              title={status === 'playing' ? '暂停' : '播放'}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 hover:bg-rose-400 active:scale-95 transition"
            >
              {status === 'playing' ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
            </button>

            <button
              onClick={() => {
                next();
                resetHideTimer();
              }}
              title="下一首"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition"
            >
              <SkipForward size={18} />
            </button>
          </div>

          <button
            onClick={() => {
              setStyleOpen(v => !v);
              resetHideTimer();
            }}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 transition"
          >
            <SlidersHorizontal size={15} />
            <span>动效</span>
          </button>
        </div>
      </div>

      {/* 4. 动态歌词样式抽屉选择面板 */}
      {styleOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute right-4 bottom-28 z-40 w-80 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <SlidersHorizontal size={15} className="text-rose-400" />
              <span>动态歌词效果</span>
            </div>
            <button
              onClick={() => setStyleOpen(false)}
              className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <LyricStylePicker
            value={styleMode}
            onChange={m => {
              setStyleMode(m);
              resetHideTimer();
            }}
            compact
          />
        </div>
      )}

      {/* 5. 播放队列抽屉面板 */}
      {queueOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute left-4 bottom-28 z-40 w-80 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/15 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-sm font-semibold text-white">当前播放队列 ({queue.length})</span>
            <button
              onClick={() => setQueueOpen(false)}
              className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="space-y-1">
            {queue.map((item, idx) => {
              const isCurrent = idx === currentIndex;
              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => {
                    void playTracks([...queue], idx);
                    resetHideTimer();
                  }}
                  className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition ${
                    isCurrent
                      ? 'bg-rose-500/20 text-rose-300 font-medium'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="truncate pr-2">{item.title}</span>
                  <span className="shrink-0 text-white/40">{item.artist}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
