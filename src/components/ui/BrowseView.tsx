// src/components/ui/BrowseView.tsx — 榜单浏览页（M3b）
// 底部榜单切换（遥控器左右键）+ 歌曲列表（上下键 + Enter 点播进播放队列）

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { BUILTIN_CHARTS, fetchChartSongs } from '../../sources/charts';
import type { Chart } from '../../sources/charts';
import { toTrack } from '../../sources/search';
import type { SongSummary } from '../../sources/types';
import { usePlayerStore } from '../../player/playerStore';
import { useFusionT } from '../../i18n/fusion/useFusionT';
import { SongRow } from './SongRow';

export function BrowseView({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element {
  const t = useFusionT();
  const [charts] = useState<Chart[]>(BUILTIN_CHARTS);
  const [chartIndex, setChartIndex] = useState(0);
  const [songs, setSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const playTracks = usePlayerStore(s => s.playTracks);

  const chartId = charts[chartIndex]?.id ?? '';

  useEffect(() => {
    let alive = true;
    setSongs([]);
    setFocusIndex(0);
    setError('');
    setLoading(true);
    fetchChartSongs(chartId)
      .then(list => {
        if (alive) setSongs(list);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message || t('browse.failed'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chartId, t]);

  const playAt = useCallback(
    async (index: number) => {
      const hit = songs[index];
      if (!hit) return;
      // 榜单整页进队列：点播从当前曲目开始
      await playTracks(songs.map(toTrack), index);
      onOpenPlayer();
    },
    [songs, playTracks, onOpenPlayer],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex(i => Math.min(i + 1, songs.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setChartIndex(i => (i - 1 + charts.length) % charts.length);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setChartIndex(i => (i + 1) % charts.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void playAt(focusIndex);
      }
    },
    [songs.length, charts.length, focusIndex, playAt],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-3 p-6" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">{t('browse.title')}</h2>
        <span className="text-xs text-white/40">{charts[chartIndex]?.name}</span>
      </div>

      {/* 榜单页签：左右键切换，同遥控器键位 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {charts.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setChartIndex(i)}
            className={
              'whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ' +
              (i === chartIndex ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15')
            }
          >
            {c.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-6 text-white/60">
          <LoaderCircle size={16} className="animate-spin" />
          {t('browse.loading')}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
          <TriangleAlert size={16} />
          {error}
        </div>
      ) : null}
      {!loading && !error ? (
        <div className="flex-1 overflow-y-auto rounded-lg bg-black/20 p-1">
          {songs.map((s, i) => (
            <SongRow
              key={`${s.source}:${s.id}`}
              song={s}
              index={i}
              active={i === focusIndex}
              onFocus={() => setFocusIndex(i)}
              onPlay={() => void playAt(i)}
            />
          ))}
          {!songs.length ? (
            <div className="p-8 text-center text-white/40">{t('browse.empty')}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
