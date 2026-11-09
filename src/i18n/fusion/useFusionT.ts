// src/i18n/fusion/useFusionT.ts — 网页版（F2a）专用文案 hook
//
// 上游 Folia 的文案在 defaultNS 'translation' 里，几千条；F2a 新增的网页外壳文案
// 统一放在 `fusion.*` 键前缀下，避免和上游撞键，也不用把新文案塞进上游那几份大表。
//
// 用法：const t = useFusionT(); t('nav.search') / t('playing.styleOf', { count: 17 })

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export type FusionT = (key: string, options?: Record<string, unknown>) => string;

export function useFusionT(): FusionT {
  const { t } = useTranslation();
  // 保持引用稳定：否则每次渲染都会产生新的 t，放进 useEffect 依赖会造成取数死循环。
  return useCallback(
    (key: string, options?: Record<string, unknown>) =>
      t(`fusion.${key}`, options as never) as unknown as string,
    [t],
  );
}
