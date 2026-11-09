// src/components/ui/SettingsView.tsx — 设置页（F2a）
//
// 三块：外观与播放（默认歌词样式）、界面语言、音源设置（洛雪脚本地址 + 连通性测试）。
// 语言切换走上游既有的 applyAppLanguagePreference，所以和上游设置面板是一套状态。

import { useCallback, useEffect, useState } from 'react';
import { Languages, LoaderCircle, Music, RotateCcw, Sparkles } from 'lucide-react';
import { useFusionT } from '../../i18n/fusion/useFusionT';
import { applyAppLanguagePreference, type AppLanguagePreference } from '../../i18n/config';
import { useFusionUiStore } from '../../stores/useFusionUiStore';
import { LyricStylePicker } from './LyricStylePicker';
import { testAudioSourceScript } from '../../sources/lx/scriptSource';

const LANGUAGES: Array<{ id: AppLanguagePreference; label: string }> = [
  { id: 'system', label: '跟随系统 / System' },
  { id: 'zh-CN', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'en', label: 'English' },
];

export function SettingsView(): React.JSX.Element {
  const t = useFusionT();
  const defaultStyleMode = useFusionUiStore(s => s.defaultStyleMode);
  const setDefaultStyleMode = useFusionUiStore(s => s.setDefaultStyleMode);
  const scriptUrl = useFusionUiStore(s => s.scriptUrl);
  const setScriptUrl = useFusionUiStore(s => s.setScriptUrl);
  const resetSettings = useFusionUiStore(s => s.resetSettings);

  const [urlDraft, setUrlDraft] = useState(scriptUrl);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [language, setLanguage] = useState<AppLanguagePreference>('system');

  useEffect(() => {
    setUrlDraft(scriptUrl);
  }, [scriptUrl]);

  const onSave = useCallback(() => {
    setScriptUrl(urlDraft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }, [urlDraft, setScriptUrl]);

  const onTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAudioSourceScript(urlDraft.trim());
      setTestResult({ ok: result.ok, message: result.ok ? t('settings.testOk') : t('settings.testFail', { message: result.message }) });
    } catch (e) {
      setTestResult({ ok: false, message: t('settings.testFail', { message: (e as Error).message }) });
    } finally {
      setTesting(false);
    }
  }, [urlDraft, t]);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 overflow-y-auto p-6">
      <h2 className="text-lg font-semibold text-white">{t('settings.title')}</h2>

      {/* 外观与播放 */}
      <section className="rounded-xl bg-white/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white">
          <Sparkles size={16} className="text-sky-300" />
          {t('settings.appearance')}
        </div>
        <div className="mb-3 text-xs text-white/45">{t('settings.defaultStyleHint')}</div>
        <div className="mb-2 text-xs text-white/55">{t('settings.defaultStyle')}</div>
        <LyricStylePicker value={defaultStyleMode} onChange={setDefaultStyleMode} />
      </section>

      {/* 语言 */}
      <section className="rounded-xl bg-white/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white">
          <Languages size={16} className="text-sky-300" />
          {t('settings.language')}
        </div>
        <div className="mb-3 text-xs text-white/45">{t('settings.languageHint')}</div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setLanguage(item.id);
                void applyAppLanguagePreference(item.id);
              }}
              className={[
                'rounded-full px-4 py-1.5 text-sm transition-colors',
                language === item.id ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/80 hover:bg-white/15',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* 音源 */}
      <section className="rounded-xl bg-white/5 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white">
          <Music size={16} className="text-sky-300" />
          {t('settings.audioSource')}
        </div>
        <div className="mb-3 text-xs text-white/45">{t('settings.audioSourceHint')}</div>
        <label className="mb-1 block text-xs text-white/55" htmlFor="fusion-script-url">
          {t('settings.scriptUrl')}
        </label>
        <input
          id="fusion-script-url"
          value={urlDraft}
          onChange={e => setUrlDraft(e.target.value)}
          placeholder={t('settings.scriptUrlPlaceholder')}
          className="mb-2 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:bg-white/15"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onSave} className="rounded-lg bg-sky-500/80 px-4 py-1.5 text-sm text-white transition hover:bg-sky-500">
            {t('settings.save')}
          </button>
          <button
            onClick={() => void onTest()}
            disabled={testing}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-1.5 text-sm text-white/80 transition hover:bg-white/15 disabled:opacity-50"
          >
            {testing ? <LoaderCircle size={14} className="animate-spin" /> : null}
            {testing ? t('settings.testing') : t('settings.test')}
          </button>
          <button
            onClick={() => {
              resetSettings();
              setUrlDraft('');
              setTestResult(null);
            }}
            className="flex items-center gap-2 rounded-lg bg-white/5 px-4 py-1.5 text-sm text-white/60 transition hover:bg-white/10"
          >
            <RotateCcw size={14} />
            {t('settings.reset')}
          </button>
          {saved ? <span className="text-xs text-emerald-300">{t('settings.saved')}</span> : null}
        </div>
        {testResult ? (
          <div
            className={[
              'mt-2 rounded-lg px-3 py-2 text-xs',
              testResult.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300',
            ].join(' ')}
          >
            {testResult.message}
          </div>
        ) : null}
      </section>

      {/* 关于 */}
      <section className="rounded-xl bg-white/5 p-4">
        <div className="mb-1 text-sm font-medium text-white">{t('settings.about')}</div>
        <p className="text-xs leading-relaxed text-white/45">{t('settings.aboutBody')}</p>
      </section>
    </div>
  );
}
