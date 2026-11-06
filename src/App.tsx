// src/App.tsx — 顶层路由：底部导航切换 搜索页 ⇄ 榜单页（遥控器左右键），播放页 Escape 返回
import { useCallback, useState } from 'react';
import { SearchView } from './components/ui/SearchView';
import { BrowseView } from './components/ui/BrowseView';
import { PlayingView } from './components/ui/PlayingView';
import { usePlayerStore } from './player/playerStore';

type Route = 'search' | 'playing';
type Tab = 'search' | 'browse';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'search', label: '搜索' },
  { id: 'browse', label: '榜单' },
];

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('search');
  const [route, setRoute] = useState<Route>('search');
  const track = usePlayerStore(s => s.track);
  const status = usePlayerStore(s => s.status);

  const switchTab = useCallback((dir: 1 | -1) => {
    setTab(prev => TABS[(TABS.findIndex(t => t.id === prev) + dir + TABS.length) % TABS.length].id);
  }, []);

  // 浏览/搜索页全局左右键切底部导航（搜索输入框内的左右键用于光标，不拦截——
  // 输入框有值时事件不会冒泡到此处被误触，因为 onKeyDown 只处理浏览器未消费的键；
  // 若光标在输入框内，输入框的 keydown 不调用 preventDefault，冒泡到此会把左右键吃掉，
  // 因此这里只在非输入焦点时生效。）
  const onGlobalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (route !== 'search') return; // 播放页自己处理返回
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        switchTab(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        switchTab(1);
      }
    },
    [route, switchTab],
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-white" onKeyDown={onGlobalKeyDown}>
      {route === 'search' ? (
        <div className="h-full pb-14">
          {tab === 'search' ? <SearchView onOpenPlayer={() => setRoute('playing')} /> : <BrowseView onOpenPlayer={() => setRoute('playing')} />}
        </div>
      ) : (
        <PlayingView onBack={() => setRoute('search')} />
      )}

      {/* 底部导航栏（电视遥控器：左右键切换，Enter 确认） */}
      {route === 'search' ? (
        <nav className="absolute bottom-0 left-0 right-0 flex h-14 items-center justify-center gap-3 border-t border-white/10 bg-black/60 backdrop-blur">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'rounded-full px-6 py-1.5 text-sm transition-colors ' +
                (t.id === tab ? 'bg-sky-500 text-white' : 'text-white/70 hover:text-white')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      ) : null}

      {/* 迷你状态：在浏览/搜索页显示当前播放 */}
      {route === 'search' && track && status !== 'stopped' ? (
        <button
          onClick={() => setRoute('playing')}
          className="absolute bottom-16 right-4 rounded-full bg-sky-500/90 px-5 py-2 text-sm shadow-lg"
        >
          ▶ {track.title} · 打开播放页
        </button>
      ) : null}
    </div>
  );
}
