// src/components/ui/SearchView.tsx — 搜索页：搜索框 + 结果列表（电视遥控器可用）
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchAll, toTrack } from '../../sources';
import type { SongSummary } from '../../sources/types';
import { usePlayerStore } from '../../player/playerStore';

export function SearchView({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const playTracks = usePlayerStore(s => s.playTracks);

  const doSearch = useCallback(async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { songs } = await searchAll(keyword.trim());
      setResults(songs);
      setFocusIndex(0);
    } catch (e) {
      setError((e as Error).message || '搜索失败');
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const playAt = useCallback(
    async (index: number) => {
      const hit = results[index];
      if (!hit) return;
      await playTracks([toTrack(hit)], 0);
      onOpenPlayer();
    },
    [results, playTracks, onOpenPlayer],
  );

  // 电视遥控器：结果列表方向键 + Enter；Escape 回搜索框
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void playAt(focusIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    },
    [results.length, focusIndex, playAt],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col p-6 gap-4" onKeyDown={onKeyDown}>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void doSearch();
            }
          }}
          placeholder="搜索歌名 / 歌手"
          className="flex-1 rounded-lg bg-white/10 px-4 py-3 text-lg text-white outline-none focus:bg-white/15"
        />
        <button
          onClick={() => void doSearch()}
          className="rounded-lg bg-sky-500/80 px-6 py-3 text-lg font-medium text-white"
        >
          {loading ? '搜索中…' : '搜索'}
        </button>
      </div>

      {error ? <div className="text-red-400">{error}</div> : null}

      <div className="flex-1 overflow-y-auto rounded-lg bg-black/20">
        {results.map((hit, i) => (
          <div
            key={hit.id}
            onClick={() => void playAt(i)}
            onMouseEnter={() => setFocusIndex(i)}
            className={`flex cursor-pointer items-center gap-4 px-4 py-3 ${
              i === focusIndex ? 'bg-sky-500/25 ring-1 ring-sky-400/60' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-base text-white">{hit.title}</div>
              <div className="truncate text-sm text-white/50">
                {hit.artist} · {hit.album}
              </div>
            </div>
            <div className="text-sm text-white/40">
              {Math.floor(hit.duration / 60)}:{String(hit.duration % 60).padStart(2, '0')}
            </div>
          </div>
        ))}
        {!results.length && !loading ? (
          <div className="p-8 text-center text-white/40">搜索结果会出现在这里</div>
        ) : null}
      </div>
    </div>
  );
}
