// src/components/ui/MiniPlayer.tsx — 现代悬浮迷你播放胶囊
import { Pause, Play, SkipForward } from 'lucide-react';
import { usePlayerStore } from '../../player/playerStore';
import { formatDuration } from './SongRow';

export function MiniPlayer({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element | null {
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const toggle = usePlayerStore(s => s.toggle);
  const next = usePlayerStore(s => s.next);

  if (!track) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition hover:border-white/20">
      <button
        onClick={onOpenPlayer}
        className="flex min-w-0 flex-1 items-center gap-3 text-left group"
      >
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-rose-500/40 via-purple-500/30 to-indigo-500/40 text-sm font-bold text-white shadow-md">
          {track.cover ? (
            <img src={track.cover} alt={track.title} className="h-full w-full object-cover" />
          ) : (
            track.title.slice(0, 1)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-white group-hover:text-rose-300 transition">
            {track.title}
          </span>
          <span className="block truncate text-[11px] text-white/50">
            {track.artist || '未知歌手'}
          </span>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-white/40">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </button>

      <button
        onClick={toggle}
        title={status === 'playing' ? '暂停' : '播放'}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/20 transition active:scale-95 hover:bg-rose-400"
      >
        {status === 'playing' ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>

      <button
        onClick={next}
        title="下一首"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition active:scale-95 hover:bg-white/20 hover:text-white"
      >
        <SkipForward size={14} />
      </button>
    </div>
  );
}
