/**
 * Fusion Music 设计系统 · 主题令牌（单一事实来源）
 * 设计语言「灯夜 Lumen Night」：歌词是唯一的光源，一切 chrome 藏进黑暗。
 * 界面代码（G4 之后）只允许引用这里的令牌，禁止散落硬编码色值。
 */

export const colors = {
  /** 深空底色：三层递进 */
  bg0: '#05070d', // 页面最底（深渊）
  bg1: '#0b101c', // 卡片/面板
  bg2: '#141b2e', // 悬浮/弹层
  /** 文字 */
  ink: '#f2f5ff', // 主文字
  inkDim: '#8b93a8', // 次级文字
  inkFaint: '#4d5568', // 弱化文字/占位
  /** 唯一强调：极光青（歌词光源同族） */
  aurora: '#6ee7d8',
  auroraGlow: 'rgba(110,231,216,0.35)',
  /** 歌词光谱（动态歌词渐变专用，仅歌词区使用） */
  lyricSpectrum: ['#7dd3fc', '#6ee7d8', '#c4b5fd'],
  /** 语义色（仅状态，不做装饰） */
  ok: '#34d399',
  warn: '#fbbf24',
  danger: '#f87171',
  /** 焦点 */
  focusRing: 'rgba(110,231,216,0.9)',
  focusFill: 'rgba(110,231,216,0.12)',
} as const

/** 间距（4px 基数） */
export const space = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
} as const

export const radius = {
  sm: 8, md: 14, lg: 20, pill: 999,
} as const

/** 字号（TV 10-foot 大字优先；手机端 ×0.75 缩放） */
export const type = {
  display: 64,   // 播放页歌曲名
  title: 40,     // 页面标题
  body: 28,      // 列表行/正文（TV 最低可读）
  caption: 22,   // 辅助信息
  lyric: 56,     // 当前行歌词
  lyricDim: 40,  // 非当前行歌词
} as const

/** 动效 */
export const motion = {
  fast: 120,      // 焦点移动
  base: 220,      // 页面转场
  slow: 420,      // 弹层/歌词行切换
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)', // out-expo，全站统一
} as const

/** 遥控器焦点规格 */
export const focus = {
  ringWidth: 4,
  ringOffset: 6,
  scaleOnFocus: 1.06,
} as const

/** 布局 */
export const layout = {
  sidebarW: 220,        // TV 左侧导航（TV 布局）
  listRowH: 88,         // 列表行高（TV）
  controlBarH: 96,      // 播放页控制条
  safeTop: 48, safeBottom: 40,
} as const

export type ThemeColors = typeof colors
