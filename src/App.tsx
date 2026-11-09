// src/App.tsx — 网页版外壳（F2a）
//
// 顶栏（Logo + 标语）、内容区、底部图标导航（搜索 / 榜单 / 设置）、迷你播放条。
// 遥控器：← → 切换栏目，↑ ↓ 浏览，Enter 确认，Esc 从播放页返回。

import { useCallback } from 'react';
import { Disc3, ListMusic, Search, Settings } from 'lucide-react';
import { SearchView } from './components/ui/SearchView';
import { BrowseView } from './components/ui/BrowseView';
import { SettingsView } from './components/ui/SettingsView';
import { PlayingView } from './components/ui/PlayingView';
import { MiniPlayer } from './components/ui/MiniPlayer';
import { useFusionUiStore, type AppTab } from './stores/useFusionUiStore';
import { useFusionT } from './i18n/fusion/useFusionT';

const TAB_ICONS: Record<AppTab, typeof Search> = {
  search: Search,
  browse: ListMusic,
  settings: Settings,
};

export default function App(): React.JSX.Element {
  const t = useFusionT();
  const route = useFusionUiStore(s => s.route);
  const tab = useFusionUiStore(s => s.tab);
  const setRoute = useFusionUiStore(s => s.setRoute);
  const setTab = useFusionUiStore(s => s.setTab);

  const switchTab = useCallback(
    (dir: 1 | -1) => {
      const tabs: AppTab[] = ['search', 'browse', 'settings'];
      const idx = tabs.indexOf(tab);
      setTab(tabs[(idx + dir + tabs.length) % tabs.length]);
    },
    [tab, setTab],
  );

  // 主界面的左右键切底部导航。输入框/文本域内的左右键留给光标，不拦截。
  const onGlobalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (route !== 'main') return; // 播放页自己处理返回
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
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-white"
      onKeyDown={onGlobalKeyDown}
    >
      {route === 'main' ? (
        <>
          {/* 顶栏 */}
          <header className="flex items-center gap-3 border-b border-white/10 px-6 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
              <Disc3 size={20} />
            </span>
            <div className="leading-tight">
              <div className="text-base font-semibold">{t('app.name')}</div>
              <div className="text-xs text-white/40">{t('app.tagline')}</div>
            </div>
          </header>

          {/* 内容区 */}
          <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-black/20">
              {tab === 'search' ? (
                <SearchView onOpenPlayer={() => setRoute('playing')} />
              ) : tab === 'browse' ? (
                <BrowseView onOpenPlayer={() => setRoute('playing')} />
              ) : (
                <SettingsView />
              )}
            </div>

            {/* 迷你播放条 */}
            <MiniPlayer onOpenPlayer={() => setRoute('playing')} />

            {/* 遥控器提示 */}
            <div className="text-center text-[11px] text-white/25">{t('nav.hint')}</div>
          </main>

          {/* 底部图标导航 */}
          <nav className="flex h-16 items-center justify-center gap-4 border-t border-white/10 bg-black/60 backdrop-blur">
            {(['search', 'browse', 'settings'] as AppTab[]).map(id => {
              const Icon = TAB_ICONS[id];
              const active = id === tab;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-label={t(`nav.${id}`)}
                  className={
                    'flex w-24 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-xs transition-colors ' +
                    (active ? 'bg-sky-500/20 text-sky-200' : 'text-white/55 hover:bg-white/5 hover:text-white/80')
                  }
                >
                  <Icon size={20} />
                  <span>{t(`nav.${id}`)}</span>
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        <PlayingView onBack={() => setRoute('main')} />
      )}
    </div>
  );
}
