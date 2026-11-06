// src/components/ui/BrowseView.tsx — 榜单浏览页（M3b）
// 底部榜单切换（遥控器左右键）+ 歌曲列表（上下键 + Enter 点播进播放队列）

import { useCallback, useEffect, useState } from 'react';
import { BUILTIN_CHARTS, fetchChartSongs } from '../../sources/charts';
import type { Chart } from '../../sources/charts';
import { toTrack } from '../../sources/search';
import type { SongSummary } from '../../sources/types';
import { usePlayerStore } from '../../player/playerStore';

export function BrowseView({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element {
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
        if (alive) setError(e.message || '榜单加载失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chartId]);

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
    <div className="flex h-full flex-col gap-3 p-6" onKeyDown={onKeyDown}>
      <h2 className="text-xl font-semibold">浏览 · 榜单</h2>

      {/* 榜单页签：左右键切换，同遥控器键位 */}
      <div className="flex gap-2 overflow-x-auto">
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

      {loading ? <div className="p-6 text-center text-white/60">加载中…</div> : null}
      {error ? <div className="p-6 text-center text-red-300">{error}</div> : null}
      {!loading && !error ? (
        <ul className="flex-1 divide-y divide-white/5 overflow-y-auto">
          {songs.map((s, i) => (
            <li key={`${s.source}:${s.id}`}>
              <button
                onClick={() => void playAt(i)}
                className={
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ' +
                  (i === focusIndex ? 'rounded-lg bg-white/15' : 'hover:bg-white/5')
                }
              >
                <span className="w-6 shrink-0 text-center text-sm text-white/40">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base">{s.title}</span>
                  <span className="block truncate text-sm text-white/50">
                    {s.artist}
                    {s.album ? ` · ${s.album}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-white/40">{formatSec(s.duration)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatSec(sec: number): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
