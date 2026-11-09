// src/components/ui/LyricStylePicker.tsx — 歌词样式选择面板
//
// 播放页和设置页共用。列出 17 种 Folia 内建样式（中文名来自 i18n 的 fusion.style.*），
// 当前选中的高亮。遥控器用上下键移动、Enter 选中。

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { BUILTIN_VISUALIZER_MODES } from '../../types/visualizerModes';
import type { VisualizerMode } from '../../types';
import { useFusionT } from '../../i18n/fusion/useFusionT';

interface LyricStylePickerProps {
  value: VisualizerMode;
  onChange: (mode: VisualizerMode) => void;
  /** 焦点索引由外部遥控器控制时传入；不传则组件内部自己管 */
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

  useEffect(() => {
    const idx = BUILTIN_VISUALIZER_MODES.indexOf(value as (typeof BUILTIN_VISUALIZER_MODES)[number]);
    if (idx >= 0) setIndex(idx);
  }, [value, setIndex]);

  const move = (delta: number) => {
    const next = (activeIndex + delta + BUILTIN_VISUALIZER_MODES.length) % BUILTIN_VISUALIZER_MODES.length;
    setIndex(next);
  };

  return (
    <div
      ref={listRef}
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
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
      {BUILTIN_VISUALIZER_MODES.map((mode, i) => {
        const active = mode === value;
        const focused = i === activeIndex;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            onMouseEnter={() => setIndex(i)}
            className={[
              'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              compact ? 'py-1.5' : '',
              active
                ? 'bg-sky-500/25 text-white ring-1 ring-sky-400/60'
                : 'bg-white/5 text-white/70 hover:bg-white/10',
              focused ? 'ring-2 ring-sky-300/70' : '',
            ].join(' ')}
          >
            <span className="truncate">{t(`style.${mode}`)}</span>
            {active ? <Check size={14} className="shrink-0 text-sky-300" /> : null}
          </button>
        );
      })}
    </div>
  );
}
