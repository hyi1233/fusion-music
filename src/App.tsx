// src/App.tsx — 顶层路由：搜索页 ⇄ 播放页（电视遥控器 Escape 在播放页内处理返回）
import { useState } from 'react';
import { SearchView } from './components/ui/SearchView';
import { PlayingView } from './components/ui/PlayingView';
import { usePlayerStore } from './player/playerStore';

type Route = 'search' | 'playing';

export default function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>('search');
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-white">
      {route === 'search' ? (
        <SearchView onOpenPlayer={() => setRoute('playing')} />
      ) : (
        <PlayingView onBack={() => setRoute('search')} />
      )}
      {/* 迷你状态：在搜索页显示当前播放 */}
      {route === 'search' && track && status !== 'stopped' ? (
        <button
          onClick={() => setRoute('playing')}
          className="absolute bottom-4 right-4 rounded-full bg-sky-500/90 px-5 py-2 text-sm shadow-lg"
        >
          ▶ {track.title} · 打开播放页
        </button>
      ) : null}
    </div>
  );
}
