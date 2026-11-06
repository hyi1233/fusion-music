// src/components/ui/PlayingView.tsx — 播放页：歌词区（VisualizerStage 插槽）+ 控制条
import { useCallback } from 'react';
import { usePlayerStore } from '../../player/playerStore';

export function PlayingView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const toggle = usePlayerStore(s => s.toggle);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const seek = usePlayerStore(s => s.seek);

  const onKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
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
      }
    },
    [onBack, toggle, next, previous, seek, currentTime, duration],
  );

  const fmt = (s: number): string =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div
      className="relative flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={onKeyUp}
      autoFocus
    >
      {/* 歌词区：Folia visualizer 接入点（extractor 的 VisualizerStage 挂这里） */}
      <div
        id="visualizer-stage"
        className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-900 to-black"
      >
        {!track ? (
          <div className="text-white/40">播放时歌词将在这里以全屏动态效果展示</div>
        ) : null}
      </div>

      {/* 控制条 */}
      <div className="flex flex-col gap-2 bg-black/60 p-4">
        <div className="flex items-baseline gap-3">
          <span className="truncate text-lg font-medium text-white">{track?.title ?? '未播放'}</span>
          <span className="truncate text-sm text-white/50">{track?.artist ?? ''}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/60">
          <span>{fmt(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={currentTime}
            onChange={e => seek(Number(e.target.value))}
            className="flex-1 accent-sky-400"
          />
          <span>{fmt(duration)}</span>
        </div>
        <div className="flex items-center justify-center gap-6 text-white">
          <button onClick={previous} className="rounded-full bg-white/10 px-5 py-2 text-xl">
            ⏮
          </button>
          <button onClick={toggle} className="rounded-full bg-sky-500 px-8 py-3 text-2xl">
            {status === 'playing' ? '⏸' : '▶'}
          </button>
          <button onClick={next} className="rounded-full bg-white/10 px-5 py-2 text-xl">
            ⏭
          </button>
        </div>
        <div className="text-center text-xs text-white/30">
          遥控器：↑↓ 切歌 · ←→ 快退/快进 10s · Enter 播放/暂停 · Escape 返回
        </div>
      </div>
    </div>
  );
}
