// src/stores/useFusionUiStore.ts — 网页版外壳状态（F2a）
//
// 这里只放「跨页面、需要记住」的界面状态：当前栏目 / 路由、默认歌词样式、
// 音源脚本地址。全部落 localStorage，刷新后还在。
//
// 播放状态（当前曲目、进度、音量）在 player/playerStore 里，不重复一份。

import { create } from 'zustand';
import { getStoredString, setStoredString } from './storagePrimitives';
import { DEFAULT_VISUALIZER_MODE, isBuiltinVisualizerMode } from '../types/visualizerModes';
import type { VisualizerMode } from '../types';

export const STYLE_MODE_STORAGE_KEY = 'fusion_default_lyric_style';
export const SCRIPT_URL_STORAGE_KEY = 'fusion_lx_script_url';

export type AppRoute = 'main' | 'playing';
export type AppTab = 'search' | 'browse' | 'settings';

export const readStoredStyleMode = (): VisualizerMode => {
  const saved = getStoredString(STYLE_MODE_STORAGE_KEY, '');
  return isBuiltinVisualizerMode(saved) ? saved : DEFAULT_VISUALIZER_MODE;
};

export const readStoredScriptUrl = (): string => getStoredString(SCRIPT_URL_STORAGE_KEY, '');

interface FusionUiState {
  route: AppRoute;
  tab: AppTab;
  /** 播放页当前使用的歌词样式（可在播放页面板里改） */
  styleMode: VisualizerMode;
  /** 设置页里的「默认歌词样式」 */
  defaultStyleMode: VisualizerMode;
  /** 洛雪音源脚本地址，空串表示用内置默认脚本 */
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
  tab: 'search',
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
    setStoredString(STYLE_MODE_STORAGE_KEY, DEFAULT_VISUALIZER_MODE);
    setStoredString(SCRIPT_URL_STORAGE_KEY, '');
    set({
      defaultStyleMode: DEFAULT_VISUALIZER_MODE,
      styleMode: get().styleMode,
      scriptUrl: '',
    });
  },
}));
