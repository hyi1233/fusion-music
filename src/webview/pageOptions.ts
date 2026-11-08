// src/webview/pageOptions.ts
//
// WebView 页的启动参数（query string）。与页面组件分开，单测不需要拉起 pixi/three。
//
//   folia-webview.html?demo=1&mode=hanabi&controls=0&tap=1&title=...&artist=...

import { isBuiltinVisualizerMode } from '../types/visualizerModes';
import type { VisualizerMode } from '../types';

export interface WebViewPageOptions {
    /** 没有宿主驱动时播放内置示例歌词（截图/自测用）。 */
    demo: boolean;
    /** 初始模式；非法值回落默认模式。 */
    mode?: string;
    /** 控制条初始可见性，默认 true。 */
    controls: boolean;
    /** 页面本地轻触切换控制条（默认关：触摸手势归宿主，避免和 RN 的返回/下拉冲突）。 */
    tapToggle: boolean;
    title?: string;
    artist?: string;
}

const readBool = (params: URLSearchParams, key: string, fallback: boolean): boolean => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    return raw !== '0' && raw !== 'false' && raw !== 'off';
};

const readText = (params: URLSearchParams, key: string): string | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = raw.trim();
    return value ? value : undefined;
};

export const readPageOptions = (search: string): WebViewPageOptions => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return {
        demo: readBool(params, 'demo', false),
        mode: readText(params, 'mode'),
        controls: readBool(params, 'controls', true),
        tapToggle: readBool(params, 'tap', false),
        title: readText(params, 'title'),
        artist: readText(params, 'artist'),
    };
};

/** 模式名 → 内建模式；未知模式返回 null，由调用方回一条 error 并保持当前模式。 */
export const resolveMode = (mode: string | undefined | null): VisualizerMode | null => {
    if (!mode) return null;
    return isBuiltinVisualizerMode(mode) ? mode : null;
};
