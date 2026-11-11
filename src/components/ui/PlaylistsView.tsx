// src/components/ui/PlaylistsView.tsx — 歌单广场（现代卡片网格）
import { useState } from 'react';
import { Play } from 'lucide-react';
import { usePlayerStore } from '../../player/playerStore';
import { fetchChartSongs } from '../../sources/charts';
import { toTrack } from '../../sources/search';

const TAGS = ['全部', '华语流行', '经典民谣', '摇滚盛宴', '电子律动', '治愈纯音', '深夜车载', '动漫ACG'];

const PLAYLIST_CARDS = [
  { id: 'p1', title: '华语流行巅峰热歌榜 Top 100', count: '100首', playCount: '450万', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60' },
  { id: 'p2', title: '温柔民谣：把生活唱成诗歌', count: '60首', playCount: '210万', cover: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=500&auto=format&fit=crop&q=60' },
  { id: 'p3', title: '重低音电音节拍·夜行能量补充', count: '85首', playCount: '340万', cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=60' },
  { id: 'p4', title: '深度专注：钢琴与自然白噪音', count: '45首', playCount: '180万', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60' },
  { id: 'p5', title: '摇滚不死：重燃热血与青春', count: '72首', playCount: '195万', cover: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=500&auto=format&fit=crop&q=60' },
  { id: 'p6', title: '古风雅韵：琵琶古筝戏腔新唱', count: '55首', playCount: '280万', cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=60' },
];

export function PlaylistsView({ onOpenPlayer }: { onOpenPlayer: () => void }): React.JSX.Element {
  const [activeTag, setActiveTag] = useState('全部');
  const playTracks = usePlayerStore(s => s.playTracks);

  const handlePlayPlaylist = async () => {
    // 拉取示例歌曲并立即开启全屏动态歌词
    const songs = await fetchChartSongs('74534');
    if (songs.length) {
      await playTracks(songs.map(toTrack), 0);
      onOpenPlayer();
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-6 py-4 space-y-4 select-none scrollbar-none">
      {/* 标签栏 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => setActiveTag(tag)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              tag === activeTag
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 歌单网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-8">
        {PLAYLIST_CARDS.map(pl => (
          <div
            key={pl.id}
            onClick={() => void handlePlayPlaylist()}
            className="group cursor-pointer flex flex-col gap-2 rounded-2xl bg-white/5 p-3 border border-white/5 hover:border-white/15 hover:bg-white/10 transition"
          >
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-slate-800">
              <img
                src={pl.cover}
                alt={pl.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-md">
                {pl.playCount}
              </span>
              <button className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 shadow-lg group-hover:opacity-100 transition-opacity">
                <Play size={16} className="fill-white ml-0.5" />
              </button>
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-xs font-semibold text-white/90 group-hover:text-white transition">
                {pl.title}
              </p>
              <p className="text-[11px] text-white/40 mt-1">{pl.count}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
