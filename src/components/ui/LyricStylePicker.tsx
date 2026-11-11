// src/components/ui/LyricStylePicker.tsx — 模块化动态歌词样式选择面板
// 1. 完全基于 VISUALIZER_REGISTRY 动态扫描，新动效即插即显，主架构零改动。
// 2. 纯白话命名，高亮当前选中动效，支持紧凑布局。

import { useEffect, useRef, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { VISUALIZER_REGISTRY } from '../visualizer/registry';
import type { VisualizerMode } from '../../types';
import { useFusionT } from '../../i18n/fusion/useFusionT';

interface LyricStylePickerProps {
  value: VisualizerMode;
  onChange: (mode: VisualizerMode) => void;
  focusIndex?: number;
  onFocusIndexChange?: (index: number) => void;
  compact?: boolean;
}

export function LyricStylePicker({
  value,
  onChange,
  focusIndex,
  onFocusIndexChange,
  compact = false,
}: LyricStylePickerProps): React.JSX.Element {
  const t = useFusionT();
  const [internalIndex, setInternalIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const activeIndex = focusIndex ?? internalIndex;
  const setIndex = onFocusIndexChange ?? setInternalIndex;

  // 动态获取当前所有注册的动效模式列表（即插即用）
  const allModes = VISUALIZER_REGISTRY.map(entry => entry.mode);

  useEffect(() => {
    const idx = allModes.indexOf(value);
    if (idx >= 0) setIndex(idx);
  }, [value, allModes, setIndex]);

  const move = (delta: number) => {
    const next = (activeIndex + delta + allModes.length) % allModes.length;
    setIndex(next);
  };

  return (
    <div
      ref={listRef}
      className="grid grid-cols-2 gap-2"
      onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {allModes.map((mode, i) => {
        const active = mode === value;
        const focused = i === activeIndex;
        // 尝试从 i18n 取中文名，取不到则直接显示模式原名
        const rawLabel = t(`style.${mode}`);
        const label = !rawLabel || rawLabel === `style.${mode}` ? mode : rawLabel;

        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            onMouseEnter={() => setIndex(i)}
            className={`flex items-center justify-between gap-1.5 rounded-xl px-3 py-2 text-left text-xs transition-all ${
              compact ? 'py-2' : 'py-2.5'
            } ${
              active
                ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/80 font-medium'
                : focused
                  ? 'bg-white/10 text-white'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Sparkles size={12} className={active ? 'text-rose-400 shrink-0' : 'text-white/30 shrink-0'} />
              <span className="truncate">{label}</span>
            </div>
            {active && <Check size={14} className="shrink-0 text-rose-400" />}
          </button>
        );
      })}
    </div>
  );
}
