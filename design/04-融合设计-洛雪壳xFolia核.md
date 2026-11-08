# 04 · 融合设计：洛雪 UI 壳 × Folia 动态歌词内核 — G2-v2 评审稿

> 方向（用户定案，推翻此前自创设计）：**不发明设计。** 洛雪的 UI 已被验证成功，直接采用其布局与交互为壳；Folia 的动态歌词引擎为灵魂；二者缝合即产品。

## 一、两个软件的分工

| 层 | 来源 | 取什么 |
|---|---|---|
| 全部界面/导航/交互 | **洛雪 lx-music-mobile**（AGPL-3.0，React Native） | Home（横/竖双布局：Leaderboard/SongList/Mylist/Search/Setting）、PlayDetail（横/竖双布局）、SourceSelector、主题系统（theme/themes 多主题）、列表/弹窗组件 |
| 动态歌词 | **Folia folia-major**（AGPL-3.0，Web/React） | `src/components/visualizer/**` 全部视觉模式（classic/星象/雾笺/町景/hanabi/...）、VisualizerStage 契约、逐字歌词解析 `src/utils/lyrics/**` |
| 音源数据 | 洛雪 musicSdk（kw/kg/wy/tx/mg 内置多平台）+ 洛雪自定义音源脚本（userApi） | 多平台搜索/榜单/歌单/取链接/歌词 |
| 播放内核 | 洛雪播放器状态机（player store） | 队列/播放模式/进度 |

## 二、融合点分析（源码级，已核实两侧代码）

### 融合点 1：替换洛雪播放页歌词视图 → Folia 引擎
- 洛雪播放页：`screens/PlayDetail/{Vertical,Horizontal}/Lyric.tsx` — 基于 `plugins/lyric.ts` 的 `useLrcPlay()（返回当前时间）/useLrcSet()（返回 lines: Line[]）` 驱动 FlatList 滚动 + AnimatedColorText 逐字变色。
- Folia 侧：`VisualizerStage`（props：lines: Folia Line[]、currentTime、duration、mode、theme、songTitle/Artist、coverUrl、showText…）。
- **缝合法**：新组件 `FoliaLyricStage`——内部用洛雪的 `useLrcPlay/useLrcSet` 取时间与行（保持洛雪数据流不变），把洛雪 `Line{time,text,translation}` 转成 Folia `Line{words[],startTime,endTime,fullText,translation}`（无逐字时间轴时按行均分生成 words），挂 `VisualizerStage`。替换 Lyric.tsx 的渲染体，**布局不动**。

### 融合点 2：逐字歌词来源增强
- 洛雪 musicSdk 各平台 lyric.js 返回 lrc/tlrc/rlrc 文本（行级）。
- 增强（可选渐进）：酷狗 krc/QRC 逐字源（Folia 的 qrcDecrypt 已在 fusion-music 仓库）→ 转成逐字 Line 传给引擎，效果升级为真逐字。先按行级跑通，逐字为 P1。

### 融合点 3：音源与平台（沿用洛雪真实模型）
- 洛雪内置 musicSdk 即"一个音源生态覆盖多平台"（kw/kg/wy/tx/mg）；SourceSelector 下拉切平台；leaderboard `musicSdk[source].leaderboard.getBoards()` 各平台返回各自榜单。
- 自定义音源脚本（userApi importUserScript）按洛雪协议兼容，作为"添加音源"入口。
- **UI 完全复用洛雪的 SourceSelector + Leaderboard/SongList 视图，不改结构。**

### 融合点 4：宿主形态
- 洛雪是 React Native（Android APK 成熟，自带 TV 遥控可用性）；Folia 是 Web。
- **融合载体**：以洛雪 RN 工程为宿主；Folia 的 visualizer 是 Canvas/WebGL 代码，需在 RN 侧以 **WebView 全屏层**承载（React Native WebView 加载 fusion-music 构建产物的小页面，postMessage 传 lines/currentTime/模式切换），或调研 react-native-webgpu/家 RN 三方 canvas。**首选 WebView 层方案**（工程确定性高，Folia 代码零改动）。

## 三、实施路径（融合优先，每步可验证）

1. **F1 歌词桥**：洛雪 Line→Folia Line 转换器 + `FoliaLyricStage`（WebView 承载 VisualizerStage，行级歌词驱动）→ 替换 PlayDetail/Lyric.tsx。
2. **F2 模式切换**：播放页歌词样式入口接入 Folia 模式列表（星象/雾笺/…至少 3 种可切）。
3. **F3 逐字升级**：接 QRC/KRC 逐字源 → 逐字 Line 直驱。
4. **F4 双端验证**：手机（触屏）+ 电视（遥控器）真机验证。

## 四、审核关卡更新
- G2-v2（本文档）：融合方案过审 → G3-v2：**不再做设计稿**，直接以洛雪真机界面为基准做"Folia 引擎替换前/后"对比演示 → G4 功能实现 → G5 测试。
