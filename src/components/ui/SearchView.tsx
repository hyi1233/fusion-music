// src/components/ui/SearchView.tsx — 搜索页：搜索框 + 结果列表（电视遥控器可用）
import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, Search, TriangleAlert } from 'lucide-react';
import { searchAll, toTrack } from '../../sources';
import type { SongSummary } from '../../sources/types';
import { usePlayerStore } from '../../player/playerStore';
import { useFusionT } from '../../i18n/fusion/useFusionT';
import { SongRow } from './SongRow';

export function SearchView({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element {
  const t = useFusionT();
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
      setError((e as Error).message || t('search.failed'));
    } finally {
      setLoading(false);
    }
  }, [keyword, t]);

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
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 p-6" onKeyDown={onKeyDown}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
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
            placeholder={t('search.placeholder')}
            className="w-full rounded-lg bg-white/10 py-3 pl-11 pr-4 text-lg text-white outline-none placeholder:text-white/30 focus:bg-white/15"
          />
        </div>
        <button
          onClick={() => void doSearch()}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-sky-500/80 px-6 py-3 text-lg font-medium text-white transition hover:bg-sky-500"
        >
          {loading ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {loading ? t('search.loading') : t('search.submit')}
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
          <TriangleAlert size={16} />
          {error}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="text-xs text-white/40">{t('search.resultCount', { count: results.length })}</div>
      ) : null}

      <div className="flex-1 overflow-y-auto rounded-lg bg-black/20 p-1">
        {results.map((hit, i) => (
          <SongRow
            key={hit.id}
            song={hit}
            index={i}
            active={i === focusIndex}
            onFocus={() => setFocusIndex(i)}
            onPlay={() => void playAt(i)}
          />
        ))}
        {!results.length && !loading ? (
          <div className="p-8 text-center text-white/40">
            {keyword.trim() ? t('search.empty') : t('search.idle')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
