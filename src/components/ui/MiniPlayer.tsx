// src/components/ui/MiniPlayer.tsx — 底部迷你播放条
//
// 在搜索/榜单/设置页显示当前曲目，一键回到播放页。遥控器用 Enter 激活。

import { Pause, Play, SkipForward } from 'lucide-react';
import { usePlayerStore } from '../../player/playerStore';
import { useFusionT } from '../../i18n/fusion/useFusionT';
import { formatDuration } from './SongRow';

export function MiniPlayer({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element | null {
  const t = useFusionT();
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const queueLength = usePlayerStore(s => s.queue.length);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const toggle = usePlayerStore(s => s.toggle);
  const next = usePlayerStore(s => s.next);

  if (!track) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
      <button
        onClick={onOpenPlayer}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={t('mini.openPlayer')}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/40 to-indigo-500/40 text-sm font-semibold text-white">
          {track.title.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-white">{track.title}</span>
          <span className="block truncate text-xs text-white/45">
            {track.artist || t('song.unknownArtist')}
            {queueLength > 0 ? ` · ${t('mini.queuePosition', { index: currentIndex + 1, total: queueLength })}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-white/40">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </button>
      <button
        onClick={toggle}
        aria-label={status === 'playing' ? t('playing.pause') : t('playing.play')}
        className="rounded-full bg-white/10 p-2 text-white/85 transition hover:bg-white/20"
      >
        {status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button
        onClick={next}
        aria-label={t('playing.next')}
        className="rounded-full bg-white/10 p-2 text-white/85 transition hover:bg-white/20"
      >
        <SkipForward size={16} />
      </button>
    </div>
  );
}
