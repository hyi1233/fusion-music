// src/App.tsx — 现代开源音乐应用主架构（融合珊瑚音乐骨架 × Folia 动态歌词灵魂）
import { useCallback } from 'react';
import {
  Compass,
  Disc3,
  ListMusic,
  Search,
  Settings,
  Trophy,
} from 'lucide-react';
import { DiscoverView } from './components/ui/DiscoverView';
import { PlaylistsView } from './components/ui/PlaylistsView';
import { BrowseView } from './components/ui/BrowseView';
import { SearchView } from './components/ui/SearchView';
import { SettingsView } from './components/ui/SettingsView';
import { PlayingView } from './components/ui/PlayingView';
import { MiniPlayer } from './components/ui/MiniPlayer';
import { useFusionUiStore, type AppTab } from './stores/useFusionUiStore';

const TABS: { id: AppTab; label: string; icon: typeof Compass }[] = [
  { id: 'discover', label: '发现', icon: Compass },
  { id: 'playlists', label: '歌单', icon: ListMusic },
  { id: 'leaderboard', label: '排行榜', icon: Trophy },
  { id: 'search', label: '搜索', icon: Search },
  { id: 'settings', label: '设置', icon: Settings },
];

export default function App(): React.JSX.Element {
  const route = useFusionUiStore(s => s.route);
  const tab = useFusionUiStore(s => s.tab);
  const setRoute = useFusionUiStore(s => s.setRoute);
  const setTab = useFusionUiStore(s => s.setTab);

  // 键盘快捷左右切导航
  const onGlobalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (route !== 'main') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const tabIds = TABS.map(t => t.id);
      const idx = tabIds.indexOf(tab);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setTab(tabIds[(idx - 1 + tabIds.length) % tabIds.length]);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setTab(tabIds[(idx + 1) % tabIds.length]);
      }
    },
    [route, tab, setTab],
  );

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-white select-none font-sans"
      onKeyDown={onGlobalKeyDown}
    >
      {route === 'main' ? (
        <>
          {/* 1. 顶栏：现代化轻奢品牌与状态 */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 shadow-sm">
                <Disc3 size={18} />
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-base font-bold tracking-tight text-white">Fusion Music</span>
                <span className="text-[11px] font-normal text-rose-300/60 hidden sm:inline">珊瑚动态声光版</span>
              </div>
            </div>

            <button
              onClick={() => setTab('search')}
              className="flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs text-white/70 transition"
            >
              <Search size={13} />
              <span>搜索音乐、歌手</span>
            </button>
          </header>

          {/* 2. 主内容展示区（根据当前 Tab 分发页面） */}
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              {tab === 'discover' ? (
                <DiscoverView
                  onOpenPlayer={() => setRoute('playing')}
                  onNavigateTab={setTab}
                />
              ) : tab === 'playlists' ? (
                <PlaylistsView onOpenPlayer={() => setRoute('playing')} />
              ) : tab === 'leaderboard' ? (
                <BrowseView onOpenPlayer={() => setRoute('playing')} />
              ) : tab === 'search' ? (
                <SearchView onOpenPlayer={() => setRoute('playing')} />
              ) : (
                <SettingsView />
              )}
            </div>

            {/* 3. 悬浮迷你播放条（若有正在播放歌曲） */}
            <div className="px-4 pb-2 pt-1">
              <MiniPlayer onOpenPlayer={() => setRoute('playing')} />
            </div>
          </main>

          {/* 4. 底部现代化 Material 3 导航栏 */}
          <nav className="flex h-16 shrink-0 items-center justify-around border-t border-white/5 bg-slate-950/90 px-2 backdrop-blur-xl">
            {TABS.map(item => {
              const Icon = item.icon;
              const active = item.id === tab;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-1.5 transition-all ${
                    active
                      ? 'w-20 bg-rose-500/15 text-rose-300 font-semibold'
                      : 'w-16 text-white/45 hover:text-white/80'
                  }`}
                >
                  <Icon size={18} className={active ? 'text-rose-400' : 'text-current'} />
                  <span className="text-[11px]">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        /* 5. 核心全屏动态歌词大舞台（点歌即弹、单击出控） */
        <PlayingView onBack={() => setRoute('main')} />
      )}
    </div>
  );
}
