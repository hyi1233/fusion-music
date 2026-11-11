// src/components/ui/DiscoverView.tsx — 现代发现主页（参考《珊瑚音乐》架构）
// 1. 顶栏五平台音源切换胶囊（酷狗 / 网易云 / QQ / 酷我 / 咪咕）
// 2. 现代渐变 Banner、四大金刚快捷入口（每日推荐/歌单广场/巅峰榜单/音源管理）
// 3. 热门推荐歌单卡片流与新歌速递列表，点歌秒级自动展开全屏动态歌词

import { useCallback, useEffect, useState } from 'react';
import {
  Flame,
  Headphones,
  ListMusic,
  LoaderCircle,
  Play,
  Radio,
  Search,
  Sliders,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { BUILTIN_CHARTS, fetchChartSongs } from '../../sources/charts';
import { toTrack } from '../../sources/search';
import type { SongSummary } from '../../sources/types';
import { usePlayerStore } from '../../player/playerStore';

export type MusicPlatform = 'all' | 'kugou' | 'netease' | 'qq' | 'kuwo' | 'migu';

const PLATFORMS: { id: MusicPlatform; name: string }[] = [
  { id: 'all', name: '全部平台' },
  { id: 'kugou', name: '酷狗音乐' },
  { id: 'netease', name: '网易云' },
  { id: 'qq', name: 'QQ 音乐' },
  { id: 'kuwo', name: '酷我音乐' },
  { id: 'migu', name: '咪咕音乐' },
];

// 精选歌单卡片展示数据
const FEATURED_PLAYLISTS = [
  {
    id: 'pl-1',
    title: '春日初遇·温柔旋律治愈心灵',
    subtitle: '沉浸在纯净的旋律与光影中',
    playCount: '128.4万',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'pl-2',
    title: '华语流行·榜首热歌实时速递',
    subtitle: '当下最受欢迎的华语流行节拍',
    playCount: '89.2万',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'pl-3',
    title: '夜幕慢调·深夜独处陪伴电台',
    subtitle: '让温柔的流体光影伴你入眠',
    playCount: '54.6万',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60',
  },
  {
    id: 'pl-4',
    title: '纯音星芒·专注学习与轻冥想',
    subtitle: '抚平浮躁，开启心流体验',
    playCount: '42.1万',
    cover: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=500&auto=format&fit=crop&q=60',
  },
];

interface DiscoverViewProps {
  onOpenPlayer: () => void;
  onNavigateTab: (tab: import('../../stores/useFusionUiStore').AppTab) => void;
}

export function DiscoverView({ onOpenPlayer, onNavigateTab }: DiscoverViewProps): React.JSX.Element {
  const [platform, setPlatform] = useState<MusicPlatform>('all');
  const [hotSongs, setHotSongs] = useState<SongSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const playTracks = usePlayerStore(s => s.playTracks);

  // 加载首页热门歌曲
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchChartSongs('74534') // 默认抓取新歌榜
      .then(list => {
        if (alive) setHotSongs(list.slice(0, 15));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [platform]);

  // 点击歌曲播放并自动展开全屏动态歌词
  const handlePlaySong = useCallback(
    async (index: number) => {
      if (!hotSongs[index]) return;
      await playTracks(hotSongs.map(toTrack), index);
      onOpenPlayer();
    },
    [hotSongs, playTracks, onOpenPlayer],
  );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-6 py-4 space-y-6 select-none scrollbar-none">
      {/* 1. 顶部音源平台切换胶囊 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {PLATFORMS.map(p => {
          const active = p.id === platform;
          return (
            <button
              key={p.id}
              onClick={() => setPlatform(p.id)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* 2. 精选主推 Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-900/40 via-purple-900/20 to-slate-900/60 p-6 border border-white/10 shadow-xl backdrop-blur-md">
        <div className="relative z-10 max-w-lg space-y-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
            <Sparkles size={11} />
            <span>精选推荐</span>
          </span>
          <h2 className="text-xl font-bold text-white tracking-wide">
            让音乐，连接美好
          </h2>
          <p className="text-xs text-white/60 leading-relaxed">
            全屏流体视觉与逐字动态歌词深度融合，探索来自各平台的万千旋律。
          </p>
          <div className="pt-2">
            <button
              onClick={() => void handlePlaySong(0)}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 hover:bg-rose-400 active:scale-95 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-500/30 transition"
            >
              <Play size={14} className="fill-white" />
              <span>开始聆听</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. 四大金刚快捷入口（学珊瑚音乐核心导航） */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => onNavigateTab('leaderboard')}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-3 text-center border border-white/5 hover:bg-white/10 hover:border-white/10 active:scale-95 transition"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
            <Trophy size={20} />
          </div>
          <span className="text-xs font-medium text-white/80">巅峰榜单</span>
        </button>

        <button
          onClick={() => onNavigateTab('playlists')}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-3 text-center border border-white/5 hover:bg-white/10 hover:border-white/10 active:scale-95 transition"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/20 text-rose-300">
            <ListMusic size={20} />
          </div>
          <span className="text-xs font-medium text-white/80">歌单广场</span>
        </button>

        <button
          onClick={() => onNavigateTab('search')}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-3 text-center border border-white/5 hover:bg-white/10 hover:border-white/10 active:scale-95 transition"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300">
            <Search size={20} />
          </div>
          <span className="text-xs font-medium text-white/80">音乐搜索</span>
        </button>

        <button
          onClick={() => onNavigateTab('settings')}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 p-3 text-center border border-white/5 hover:bg-white/10 hover:border-white/10 active:scale-95 transition"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
            <Sliders size={20} />
          </div>
          <span className="text-xs font-medium text-white/80">音源管理</span>
        </button>
      </div>

      {/* 4. 热门精选歌单（横向瀑布流） */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90">推荐歌单</h3>
          <button
            onClick={() => onNavigateTab('playlists')}
            className="text-xs text-white/40 hover:text-white transition"
          >
            查看全部
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FEATURED_PLAYLISTS.map(pl => (
            <div
              key={pl.id}
              onClick={() => void handlePlaySong(0)}
              className="group cursor-pointer flex flex-col gap-2 rounded-xl bg-white/5 p-2.5 border border-white/5 hover:border-white/15 hover:bg-white/10 transition"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-800">
                <img
                  src={pl.cover}
                  alt={pl.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <span className="absolute top-1.5 right-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-md">
                  {pl.playCount}
                </span>
                <button className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 shadow-lg group-hover:opacity-100 transition-opacity">
                  <Play size={14} className="fill-white ml-0.5" />
                </button>
              </div>
              <p className="line-clamp-2 text-xs font-medium text-white/80 group-hover:text-white transition">
                {pl.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 今日热歌速递 */}
      <div className="space-y-3 pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Flame size={15} className="text-rose-500" />
            <h3 className="text-sm font-semibold text-white/90">热歌速递</h3>
          </div>
          <button
            onClick={() => onNavigateTab('leaderboard')}
            className="text-xs text-white/40 hover:text-white transition"
          >
            完整榜单
          </button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-white/40">
            <LoaderCircle size={16} className="animate-spin mr-2 text-rose-400" />
            <span>加载热门歌曲中...</span>
          </div>
        ) : (
          <div className="space-y-1.5 rounded-xl bg-white/5 p-2 border border-white/5">
            {hotSongs.map((s, idx) => (
              <div
                key={`${s.id}-${idx}`}
                onClick={() => void handlePlaySong(idx)}
                className="group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-5 text-center font-bold text-xs ${
                      idx < 3 ? 'text-rose-400' : 'text-white/30'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white/90 group-hover:text-rose-300 transition">
                      {s.title}
                    </p>
                    <p className="truncate text-[11px] text-white/40">{s.artist}</p>
                  </div>
                </div>

                <button className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/60 opacity-0 group-hover:opacity-100 hover:bg-rose-500 hover:text-white transition">
                  <Play size={12} className="fill-current ml-0.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
