import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isValidScriptUrl, testAudioSourceScript } from '../src/sources/lx/scriptSource';
import { fusionBundles } from '../src/i18n/fusion/locales';
import { BUILTIN_VISUALIZER_MODES, DEFAULT_VISUALIZER_MODE } from '../src/types/visualizerModes';

// Node 26 自带一个实验性的 localStorage 全局（未开 --localstorage-file 时是空壳），
// 会盖掉 jsdom 的实现；这里先换成一个内存实现，再动态导入依赖 localStorage 的 store。
const memoryStorage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  configurable: true,
  writable: true,
});

const {
  STYLE_MODE_STORAGE_KEY,
  SCRIPT_URL_STORAGE_KEY,
  readStoredScriptUrl,
  readStoredStyleMode,
  useFusionUiStore,
} = await import('../src/stores/useFusionUiStore');

describe('useFusionUiStore', () => {
  beforeEach(() => {
    memoryStorage.clear();
    useFusionUiStore.setState({
      styleMode: DEFAULT_VISUALIZER_MODE,
      defaultStyleMode: DEFAULT_VISUALIZER_MODE,
      scriptUrl: '',
    });
  });

  it('非法样式不写入（setStyleMode / setDefaultStyleMode 都会忽略）', () => {
    useFusionUiStore.getState().setStyleMode('not-a-mode');
    expect(useFusionUiStore.getState().styleMode).toBe(DEFAULT_VISUALIZER_MODE);
    useFusionUiStore.getState().setDefaultStyleMode('not-a-mode');
    expect(useFusionUiStore.getState().defaultStyleMode).toBe(DEFAULT_VISUALIZER_MODE);
  });

  it('默认样式落 localStorage，并同步当前播放页样式', () => {
    useFusionUiStore.getState().setDefaultStyleMode('nebbia');
    expect(memoryStorage.getItem(STYLE_MODE_STORAGE_KEY)).toBe('nebbia');
    expect(useFusionUiStore.getState().styleMode).toBe('nebbia');
    expect(readStoredStyleMode()).toBe('nebbia');
  });

  it('音源脚本地址去空白后落盘，空串表示用默认脚本', () => {
    useFusionUiStore.getState().setScriptUrl('  https://example.com/a.js  ');
    expect(memoryStorage.getItem(SCRIPT_URL_STORAGE_KEY)).toBe('https://example.com/a.js');
    expect(readStoredScriptUrl()).toBe('https://example.com/a.js');
    useFusionUiStore.getState().setScriptUrl('   ');
    expect(memoryStorage.getItem(SCRIPT_URL_STORAGE_KEY)).toBe('');
  });

  it('恢复默认可清掉两项设置', () => {
    useFusionUiStore.getState().setDefaultStyleMode('hanabi');
    useFusionUiStore.getState().setScriptUrl('https://example.com/a.js');
    useFusionUiStore.getState().resetSettings();
    expect(readStoredStyleMode()).toBe(DEFAULT_VISUALIZER_MODE);
    expect(readStoredScriptUrl()).toBe('');
  });
});

describe('音源脚本地址校验', () => {
  it('空串合法（走默认脚本）', () => {
    expect(isValidScriptUrl('')).toBe(true);
  });
  it('只接受 http/https', () => {
    expect(isValidScriptUrl('https://example.com/a.js')).toBe(true);
    expect(isValidScriptUrl('http://example.com/a.js')).toBe(true);
    expect(isValidScriptUrl('javascript:alert(1)')).toBe(false);
    expect(isValidScriptUrl('not a url')).toBe(false);
  });
});

describe('testAudioSourceScript', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('空地址直接判定为可用（默认脚本）', async () => {
    await expect(testAudioSourceScript('')).resolves.toEqual({ ok: true, message: 'default script' });
  });

  it('非法地址不发起请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await testAudioSourceScript('ftp://example.com/a.js');
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('标准洛雪脚本判定可用', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('on(EVENT_NAMES.request) ... action: "musicUrl"')),
    );
    const result = await testAudioSourceScript('https://example.com/render_api.js');
    expect(result.ok).toBe(true);
  });

  it('非洛雪协议脚本判定不可用', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('console.log(1)')));
    const result = await testAudioSourceScript('https://example.com/other.js');
    expect(result.ok).toBe(false);
  });
});

describe('fusion i18n 文案', () => {
  it('三份语言包都覆盖全部内建样式名', () => {
    for (const lang of ['zh-CN', 'zh-TW', 'en'] as const) {
      const bundle = fusionBundles[lang] as { style: Record<string, string> };
      for (const mode of BUILTIN_VISUALIZER_MODES) {
        expect(bundle.style[mode], `${lang}.${mode}`).toBeTruthy();
      }
    }
  });

  it('中文样式名不是英文原名（用户抱怨的「动词名字都没有」）', () => {
    const zh = fusionBundles['zh-CN'] as { style: Record<string, string> };
    expect(zh.style.classic).toBe('流光');
    expect(zh.style.monet).toBe('莫奈');
    expect(zh.style.hanabi).toBe('花火');
  });

  it('三份语言包键集合一致', () => {
    const flatten = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return value && typeof value === 'object'
          ? flatten(value as Record<string, unknown>, path)
          : [path];
      });
    const zhCN = flatten(fusionBundles['zh-CN'] as Record<string, unknown>).sort();
    const zhTW = flatten(fusionBundles['zh-TW'] as Record<string, unknown>).sort();
    const en = flatten(fusionBundles.en as Record<string, unknown>).sort();
    expect(zhTW).toEqual(zhCN);
    expect(en).toEqual(zhCN);
  });
});
