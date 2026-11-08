# 洛雪壳（fusion-lx）工程结构笔记

> 目的：为「洛雪 UI/音源/播放壳 × Folia 动态歌词内核」融合提供落地依据。
> 代码基线：`hyi1233/fusion-lx`（fork 自 `lyswhut/lx-music-mobile`，基线 commit `0669d1b`，版本 v1.9.2，RN 0.73.11）。
> 结论先行：洛雪侧**不需要改动任何业务逻辑**，只需在播放页歌词视图处插入一层 Folia 适配组件。

---

## 0. 本地 Android 构建环境（已实测跑通）

| 组件 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 20.20.2 | `.nvmrc` 写的是 v18；npm 12 默认禁止 git 依赖，必须 `npm ci --allow-git=all --allow-remote=all` |
| JDK | Temurin 21.0.13 LTS | 官方 setup action 用的是 JDK 17；本机无 Java，已装 Temurin 21 |
| Android SDK | platforms;android-36 / build-tools;35.0.0 / ndk;26.1.10909125 | 与 `android/build.gradle` 的 `compileSdkVersion=36`、`buildToolsVersion=35.0.0`、`ndkVersion=26.1.10909125` 对齐 |
| Gradle | 8.8（wrapper 自带） | AGP 8.6.1，Kotlin 1.9.24 |
| React Native | 0.73.11 | `react-native-navigation` 7.39.2（非官方导航） |

关键坑位（都已在本地实测修复）：

1. **`android/keystore.properties` 缺失会直接构建失败**。`android/app/build.gradle:138` 在评估项目时就无条件读取该文件（即使只构建 debug），文件不存在 → `A problem occurred evaluating project ':app'`。
   - 解决：本地/CI 均写入 debug 签名的 `keystore.properties`（`storeFile=debug.keystore` 等）。
2. **npm 12 禁止 git 依赖**：`react-native-track-player`、`react-native-background-timer`、`react-native-file-system`、`react-native-local-media-metadata` 都是 `github:lyswhut/...` 依赖，报 `EALLOWGIT`。需 `npm ci --allow-git=all --allow-remote=all`。
3. **Maven Central 偶发 403**：并发拉取 aar 时 `repo.maven.apache.org` 会返回 403（`flipper-*.aar`、`stetho`、`glide` 等）。重跑或降低并发（`--max-workers=2`）即可通过，缓存命中后构建成功。
4. 本机还需 `android/local.properties` 写 `sdk.dir=<ANDROID_SDK>`。

实测命令与产物：

```bash
cd android
./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2
# BUILD SUCCESSFUL
# app/build/outputs/apk/debug/lx-music-mobile-v1.9.2-arm64-v8a.apk  (~25 MB)
# app/build/outputs/apk/debug/lx-music-mobile-v1.9.2-universal.apk  (~64 MB)
```

JS bundle 亦验证通过：
`npx react-native bundle --platform android --dev true --entry-file index.js` → 9.86 MB `index.android.bundle`。

CI：新增 `.github/workflows/fusion-android-build.yml`（Node 20 + Temurin JDK 21 + Android SDK → `assembleDebug` → 上传 APK artifact），与本地产线一致。

---

## 1. 播放页结构：PlayDetail

```
src/screens/PlayDetail/
├── index.tsx                 # 按 useHorizontalMode() 分发 Horizontal / Vertical
├── Horizontal/
│   ├── index.tsx
│   ├── Lyric.tsx             # ★ 横向歌词视图（融合替换点）
│   ├── Pic.tsx  constant.ts
│   ├── MoreBtn/{PlayModeBtn,MusicAddBtn,TimeoutExitBtn}.tsx
│   ├── components/{Btn,CommentBtn,DesktopLyricBtn,Header}.tsx
│   └── Player/{index,PlayInfo,ControlBtn,Status}.tsx
├── Vertical/
│   ├── index.tsx             # PagerView：page0=封面(Pic)，page1=歌词(Lyric)
│   ├── Lyric.tsx             # ★ 纵向歌词视图（融合替换点）
│   ├── Pic.tsx
│   ├── components/{Btn,Header,TimeoutExitBtn}.tsx
│   └── Player/{index.tsx,components/{PlayInfo,MoreBtn/*,Status,CommentBtn,DesktopLyricBtn}.tsx}
└── components/
    ├── PlayLine.tsx          # 歌词进度条（点击跳转）
    └── SettingPopup/settings/{SettingLyricProgress,SettingLrcFontSize,SettingPlaybackRate,SettingLrcAlign,SettingVolume}.tsx
```

要点：
- **横竖两个 Lyric.tsx 逻辑几乎完全相同**（`diff` 后差异仅为：字体尺寸 setting key `playDetail.horizontal.style.lrcFontSize` vs `playDetail.vertical.style.lrcFontSize`、import 顺序、一段注释掉的 useLock）。
  → 融合只需写**一个** `FoliaLyricStage` 组件，在两个 Lyric.tsx 中同样方式挂载。
- `Vertical/index.tsx` 用 `PagerView` 的 `onPageSelected` 判断是否在歌词页（`position == 1`），并据此 `screenkeepAwake()/screenUnkeepAwake()`。歌词页是**独立的一页**，WebView 承载方案不会破坏这个结构。

---

## 2. 歌词数据流：plugins/lyric.ts

`src/plugins/lyric.ts` 是整个歌词链路的**唯一中枢**，内部持有 `lrc-file-parser` 的 `Lyric` 实例（offset 100ms）。

### 2.1 对外 API

| 导出 | 作用 |
| --- | --- |
| `init()` | 初始化 `lrcTools`（内部 `Lyric` 实例） |
| `setLyric(lyric, translation?, romalrc?)` | 写入歌词原文/翻译/罗马音，触发 `onSetLyric` |
| `play(time)` / `pause()` | 播放/暂停驱动（time 单位 ms） |
| `setPlaybackRate(rate)` | 变速（影响歌词推进） |
| `toggleTranslation(isShow)` / `toggleRoma(isShow)` | 切换翻译/罗马音显示 |
| **`useLrcPlay(autoUpdate=true)`** | React Hook，返回 `{ line: number, text: string }` —— 当前行号与当前行文本 |
| **`useLrcSet()`** | React Hook，返回 `Lines`（`lrc-file-parser` 的行数组） |

### 2.2 钩子机制（事件总线）

```ts
lrcTools.playHooks: PlayHook[]      // (line, text) => void
lrcTools.setLyricHooks: SetLyricHook[] // (lines) => void
```
- `onPlay(line, text)` → 广播给所有 playHooks
- `onSetLyric(lines)` → 先广播 `playHooks` 复位（`hook(-1, '')`），再广播 `setLyricHooks(lines)`
- Hook 在挂载时立即收到当前值（`addPlayHook` / `addSetLyricHook` 内部先回调一次当前状态）

### 2.3 Line 类型

来自 `lrc-file-parser` 的 `Lines[number]`：
```ts
{ time: number /* 秒 */, text: string, extendedLyrics: string[] /* 翻译/罗马音 */ }
```
> ⚠️ 只有**行级**时间轴，没有逐字（word-level）时间轴。这是 F3（QRC/KRC 逐字）需要补的缺口。

### 2.4 上游链路（歌词从哪来）

```
musicSdk[source].getLyric(songInfo)         // src/utils/musicSdk/<source>/lyric.js
      ↓  lrc / tlyric / rlyric 文本
src/core/music/online.ts :: getLyricInfo()  // 缓存 + 失败换源
      ↓  LX.Player.LyricInfo
src/store/player/state.ts :: musicInfo.{lrc,tlrc,rlrc,lxlrc,rawlrc}
      ↓
src/core/lyric.ts :: setLyric() → handleSetLyric()
      ├─ lrcSetLyric(lyric, tlrc, rlrc)      → plugins/lyric.ts
      ├─ setDesktopLyric(...)                → 桌面歌词
      └─ updateNowPlayingTitles({lyric})     → 蓝牙/通知栏
```

`src/core/lyric.ts` 还负责 `handlePlay(time)` / `pause()` / `setPlaybackRate()` / `toggleTranslation()` / `toggleRoma()`，全部**双写**（屏幕歌词 + 桌面歌词）。

**融合接入点结论**：
- Folia 引擎的输入 = `useLrcSet()` 返回的 `Lines` + `useLrcPlay()` 返回的当前 `line`。
- 时间源：`src/core/lyric.ts` 的 `handlePlay(time)` 里 `time` 是**毫秒**；Folia `Line.time` 用**秒** → 需 /1000。
- 若要 WebView 层，需要新增一个与 `setDesktopLyric` 对称的 `setFoliaLyric(lines)`，在 `handleSetLyric` 里一并调用，保持「一处设置、多处渲染」的一致性。

---

## 3. 音源结构：musicSdk

```
src/utils/musicSdk/
├── index.js          # 汇总导出：sources = { sources[], kw, kg, tx, wy, mg, xm }，含 init()
├── api-source.js     # 各平台 API 源配置 + supportQuality
├── options.js        # 请求选项（UA、超时等）
├── utils.js          # 公共工具
├── versionChars.ts
├── xm.js             # 虾米（仅搜索辅助）
├── kw/  kg/  tx/  wy/  mg/   # 五个平台
└── bd/               # 百度（已注释掉）
```

每个平台目录的统一模块划分：

| 模块 | 作用 |
| --- | --- |
| `index.js` | 平台聚合入口：`musicSearch`、`leaderboard`、`songList`、`hotSearch`、`comment`、`getLyric()`、`getMusicUrl()`、`handleMusicInfo()` 等 |
| `musicSearch.js` | 搜索 |
| `tipSearch.js` | 搜索建议 |
| `leaderboard.js` | 榜单（`getBoards()` / `getList()`） |
| `songList.js` | 歌单/专辑详情、歌曲列表 |
| `album.js` / `singer.js` | 专辑 / 歌手（平台支持度不同） |
| `lyric.js` | **歌词获取**（返回 lrc / tlyric / rlyric 文本） |
| `pic.js` | 封面 |
| `musicInfo.js` | 歌曲详情（含 kw 的 `musicInfo`、kg 的 `musicInfo`） |
| `comment.js` | 评论 |
| `hotSearch.js` | 热搜 |
| `util.js` / `utils/` | 平台私有工具与解码 |

平台能力差异（对融合有意义的部分）：
- **kw（酷我）**：`lyric.js` + `decodeLyric.js`（自有解码）。
- **kg（酷狗）**：`lyric.js` 解析 `[mm,ss]` 时间戳 + base64 翻译块；`temp/`、`vendors/` 为私有接口补丁。
- **tx（QQ）**：`lyric.js` + **`qrcDecode.js`** —— **已有逐字 QRC 解码**，是 F3（逐字歌词）最省力的落点。
- **wy（网易）**：`lyric.js` + `musicDetail.js`。
- **mg（咪咕）**：`lyric.js` + `songId.js` + `utils/`。

自定义音源（userApi）：
- `src/core/init/userApi/index.ts` + `request.js` —— 走洛雪自定义音源脚本协议（importUserScript）。
- `src/core/userApi.ts`、`src/store/userApi/` —— 音源脚本管理（增删改、启用状态）。
- `src/core/apiSource.ts` —— API 源选择（`api-source.js` 的封装）。

**结论**：音源层完全复用，融合不需要改动 musicSdk 任何文件。

---

## 4. 其他与融合相关的结构

| 位置 | 说明 |
| --- | --- |
| `src/theme/themes/{themes.ts,index.ts,createThemes.js}` | 主题系统（多主题）。Folia 侧 theme 需从中取主色映射 |
| `src/store/{player,setting,theme,common,list,songlist,search,leaderboard,hotSearch,sync,userApi,version,dislikeList}` | 状态管理，每个域一个目录（`state.ts` + `action.ts` + `hook.ts`） |
| `src/navigation/{registerScreens.tsx,screenNames.ts,navigation.ts,hooks.ts}` | 基于 `react-native-navigation` 的注册式导航（非 React Navigation） |
| `src/plugins/{lyric.ts,player/,storage.ts,sync/}` | 原生/外部能力插件层（歌词、播放、存储、同步） |
| `src/core/{init,music,player,search,userApi.ts,lyric.ts,desktopLyric.ts,apiSource.ts,leaderboard.ts,list.ts,songlist.ts}` | 业务编排层 |
| `src/components/{common,player,OnlineList,MusicAddModal,...}` | 通用 UI 组件 |

播放内核：`src/plugins/player/index.ts` 基于 `react-native-track-player`（`TrackPlayer.setupPlayer`），`src/core/player/{player,playInfo,playStatus,progress,playedList,tempPlayList}.ts` 封装状态机。

---

## 5. 融合落点小结（给 F1/F2/F3 的接口契约）

1. **新组件**：`src/screens/PlayDetail/components/FoliaLyricStage.tsx`
   - props：`lines: Line[]`（洛雪 Lines）、`currentLine: number`、`currentTimeMs: number`、`durationMs: number`、`visible: boolean`
   - 内部：WebView 加载 Folia 构建产物，postMessage 传 `setLines` / `setCurrentTime`（协议见 fusion-music 的 `src/merge/bridgeProtocol.ts`，版本号 `FOLIA_BRIDGE_VERSION = 1`）。
2. **替换点**：横竖两个 `Lyric.tsx` 的 FlatList 渲染体 → 换成 `FoliaLyricStage`；**布局不动**（保留 `PlayLine` 进度条与滚动逻辑，或整体切到 Folia 层）。
3. **数据转换**：洛雪 `Line{time(s), text, extendedLyrics[]}` → Folia `Line{words[], startTime, endTime, fullText, translation}`；无逐字时按行均分 words。fusion-music 已有 `src/merge/lxToLine.ts` 实现该转换（行级均分 + QRC 优先）。
4. **模式切换（F2）**：入口放在 `PlayDetail/components/SettingPopup/settings/` 或播放页 Header，与 Folia 的 `src/types/visualizerModes.ts` 对齐，至少 classic/星象/雾笺 三种。
5. **逐字（F3）**：优先接 tx 的 `qrcDecode.js`（QQ QRC 逐字），把逐字 words 塞进洛雪行的扩展字段，再由 `lxToLine.ts` 的 `preferWordTiming` 直通。

## 6. 尚未验证的事项

- **真机/模拟器运行**：本机无 Android 设备（`adb devices` 无设备），只验证到「APK 构建成功 + JS bundle 生成成功」。首次安装运行需在有设备的机器上做。
- **release 构建**：只验证 debug；release 需真实 keystore（CI 用 secrets，参考 `.github/workflows/beta-pack.yml`）。
- **WebView 承载**：洛雪 `package.json` 当前**没有** `react-native-webview` 依赖，F1 需新增该依赖（RN 0.73 兼容版本 `^13.x`）。
