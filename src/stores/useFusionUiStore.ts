// src/stores/useFusionUiStore.ts — 现代应用全局界面状态
import { create } from 'zustand';
import { getStoredString, setStoredString } from './storagePrimitives';
import { DEFAULT_VISUALIZER_MODE, isBuiltinVisualizerMode } from '../types/visualizerModes';
import type { VisualizerMode } from '../types';

export const STYLE_MODE_STORAGE_KEY = 'fusion_default_lyric_style';
export const SCRIPT_URL_STORAGE_KEY = 'fusion_lx_script_url';

export type AppRoute = 'main' | 'playing';
export type AppTab = 'discover' | 'playlists' | 'leaderboard' | 'search' | 'settings';

export const readStoredStyleMode = (): VisualizerMode => {
  const saved = getStoredString(STYLE_MODE_STORAGE_KEY, '');
  return isBuiltinVisualizerMode(saved) ? saved : DEFAULT_VISUALIZER_MODE;
};

export const readStoredScriptUrl = (): string => getStoredString(SCRIPT_URL_STORAGE_KEY, '');

interface FusionUiState {
  route: AppRoute;
  tab: AppTab;
  /** 播放页当前使用的歌词样式 */
  styleMode: VisualizerMode;
  /** 设置页里的「默认歌词样式」 */
  defaultStyleMode: VisualizerMode;
  /** 自定义音源脚本地址 */
  scriptUrl: string;
  setRoute: (route: AppRoute) => void;
  setTab: (tab: AppTab) => void;
  setStyleMode: (mode: VisualizerMode) => void;
  setDefaultStyleMode: (mode: VisualizerMode) => void;
  setScriptUrl: (url: string) => void;
  resetSettings: () => void;
}

export const useFusionUiStore = create<FusionUiState>((set, get) => ({
  route: 'main',
  tab: 'discover',
  styleMode: readStoredStyleMode(),
  defaultStyleMode: readStoredStyleMode(),
  scriptUrl: readStoredScriptUrl(),

  setRoute: route => set({ route }),
  setTab: tab => set({ tab }),

  setStyleMode: mode => {
    if (!isBuiltinVisualizerMode(mode)) return;
    set({ styleMode: mode });
  },

  setDefaultStyleMode: mode => {
    if (!isBuiltinVisualizerMode(mode)) return;
    setStoredString(STYLE_MODE_STORAGE_KEY, mode);
    set({ defaultStyleMode: mode, styleMode: mode });
  },

  setScriptUrl: url => {
    const trimmed = url.trim();
    setStoredString(SCRIPT_URL_STORAGE_KEY, trimmed);
    set({ scriptUrl: trimmed });
  },

  resetSettings: () => {
    setStoredString(STYLE_MODE_STORAGE_KEY, '');
    setStoredString(SCRIPT_URL_STORAGE_KEY, '');
    set({
      styleMode: DEFAULT_VISUALIZER_MODE,
      defaultStyleMode: DEFAULT_VISUALIZER_MODE,
      scriptUrl: '',
    });
  },
}));
