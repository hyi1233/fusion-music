// src/components/ui/SongRow.tsx — 搜索/榜单共用的歌曲行
//
// 一行里放齐了遥控器需要的信息：序号、歌名、歌手·专辑、来源徽章、时长，
// 右侧一个显式的播放按钮（电视遥控器选中整行按 Enter 即可，鼠标用户有按钮可点）。

import { Play } from 'lucide-react';
import type { SongSummary } from '../../sources/types';
import { useFusionT } from '../../i18n/fusion/useFusionT';

const SOURCE_STYLE: Record<SongSummary['source'], string> = {
  kuwo: 'bg-emerald-500/20 text-emerald-300',
  kugou: 'bg-blue-500/20 text-blue-300',
  qq: 'bg-amber-500/20 text-amber-300',
};

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface SongRowProps {
  song: SongSummary;
  index: number;
  active: boolean;
  onFocus: () => void;
  onPlay: () => void;
}

export function SongRow({ song, index, active, onFocus, onPlay }: SongRowProps): React.JSX.Element {
  const t = useFusionT();
  const sourceLabel = t(`source.${song.source}`);

  return (
    <div
      onMouseEnter={onFocus}
      className={[
        'group flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        active ? 'bg-sky-500/20 ring-1 ring-sky-400/50' : 'hover:bg-white/5',
      ].join(' ')}
    >
      <span className="w-6 shrink-0 text-center text-sm tabular-nums text-white/35">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-white">{song.title || t('song.title')}</span>
        <span className="block truncate text-xs text-white/45">
          {song.artist || t('song.unknownArtist')}
          {song.album ? ` · ${song.album}` : ''}
        </span>
      </span>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${SOURCE_STYLE[song.source]}`}>
        {sourceLabel}
      </span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-white/40">
        {formatDuration(song.duration)}
      </span>
      <button
        onClick={onPlay}
        aria-label={t('search.playNow')}
        className="shrink-0 rounded-full bg-white/10 p-1.5 text-white/70 opacity-0 transition group-hover:opacity-100 hover:bg-sky-500 hover:text-white focus-visible:opacity-100"
      >
        <Play size={14} />
      </button>
    </div>
  );
}
