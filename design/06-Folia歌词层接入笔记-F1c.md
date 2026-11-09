# F1c 工程笔记：洛雪播放页 → Folia 动态歌词

本文记录融合点 1（F1c）的实现方式、关键约束与踩过的坑，供后续任务（F2/F3）与真机验证参考。

## 1. 整体结构

```
fusion-lx (RN 壳)
├── src/components/FoliaLyricStage/          播放页歌词渲染体（WebView 承载 Folia 视觉层）
│   ├── index.tsx                           壳侧：数据流 → 桥命令 → WebView
│   └── modes.ts                            17 个内建模式 + i18n 键映射
├── src/merge/bridgeProtocol.ts             壳侧桥协议（命令/事件类型 + 序列化/解析）
├── src/utils/nativeModules/folia.ts        FoliaAssetServer 原生模块的 JS 封装
├── src/screens/PlayDetail/{Vertical,Horizontal}/Lyric.tsx
│                                           渲染体换成 <FoliaLyricStage />，布局/控制条不动
├── src/screens/PlayDetail/components/SettingPopup/settings/SettingFoliaMode.tsx
│                                           歌词样式入口：17 个 Folia 模式单选
├── android/app/src/main/java/cn/toside/music/mobile/folia/
│   ├── FoliaAssetServerModule.java         进程内 127.0.0.1 静态服务器（提供 assets/folia）
│   └── FoliaAssetServerPackage.java
└── android/app/src/main/assets/folia/      fusion-music 的 dist-webview 产物（已入库，2095 文件）
```

页面侧（fusion-music，已由 t2 交付）不动：`src/webview/FoliaWebViewPage.tsx` 挂真实的
`VisualizerStage`，`src/webview/transport.ts` 负责 postMessage 通道，
`src/merge/bridgeProtocol.ts` 负责命令解析，`src/merge/lxToLine.ts` 负责洛雪行 → Folia 逐字行。

## 2. 数据流

| 方向 | 内容 |
| --- | --- |
| 壳 → 页面 | `setLines`（洛雪行）/ `setCurrentTime`（10Hz）/ `setMode`（切模式）/ `showControls` |
| 页面 → 壳 | `ready` / `lineChange` / `modeChange` / `controlsChange` / `error` |

- 壳侧数据源全部是洛雪自己的：`useLrcSet()`（歌词行）、`useLrcPlay()`（当前行）、
  `useProgress()`（进度，秒）、`useIsPlay()`、`usePlayerMusicInfo()`（歌名/歌手/专辑/封面）。
- 宿主 → 页面用 `injectJavaScript("window.__FOLIA_RECEIVE__('<json>')")`；
  页面 → 宿主用 `window.ReactNativeWebView.postMessage(string)`。
- 页面收到首条 `setCurrentTime` 前用自己的本地时钟渲染（防黑屏），之后由 rAF 补到 60fps，
  所以壳这边 10Hz 推一次时间就够。

### 单位坑（重要）

- 洛雪的 `Line.time`（lrc-file-parser）单位是**毫秒**；发给页面前必须 `/1000`。
- 洛雪歌词引擎带 100ms 提前量（`plugins/lyric.ts` 里 `new Lyric({ offset: 100 })`），
  壳侧同步减掉这 0.1s，切行时刻才与洛雪一致。
- 播放进度 `useProgress().nowPlayTime` 已经是**秒**（`setNowPlayTime` → `formatPlayTime2`）。
- `TrackPlayer.getPosition()` 也是**秒**（`core/lyric.ts` 里 `handlePlay(position * 1000)` 才转 ms）。

## 3. 为什么不用 WebViewAssetLoader

Folia 的页面产物是 ES module 脚本，`monet` 模式还用了 module worker
（`new Worker(new URL(...))`）。Android Chromium 在 `file://` 下是 opaque origin，
会拒绝加载 module script 与 worker，所以不能直接 `file:///android_asset/folia/...`。

react-native-webview 13.17 也不暴露 `assetLoader` 属性，其 `RNCWebViewClient`
没有覆写 `shouldInterceptRequest`，无法在 RN 层拦截 `assets/` 请求。

因此采用**进程内 HTTP 服务器**：原生模块 `FoliaAssetServerModule` 起一个只监听
`127.0.0.1` 的极简静态服务器，把 `assets/folia/` 按同源资源提供出去，
页面入口是 `http://127.0.0.1:<port>/folia-webview.html`。
`network_security_config.xml` 已开 `cleartextTrafficPermitted="true"`，不需要额外配置。

服务器要点：
- 绑定 `127.0.0.1`（不对外暴露），随机端口。
- **每个连接一个线程**：Chromium 会预连接（连上但不发请求），串行处理会让空连接
  堵住 accept 循环。
- 路径归一化拒绝 `..` 与 `\`，只读 assets，没有写接口。
- 服务器是全局共享的（竖屏/横屏两个歌词页可能同时存在），组件卸载时不 stop，
  由原生模块在进程销毁时回收。

## 4. 模式切换

- 设置项：`playDetail.style.foliaMode`（`src/types/app_setting.d.ts` +
  `src/config/defaultSetting.ts`，默认 `classic`）。
- 入口：`SettingPopup` → `SettingFoliaMode`，列出 17 个内建模式
  （`classic/cadenza/cappella/claddagh/diorama/nebbia/fume/hanabi/lumiere/machi/monet/partita/pendolo/sonnet/still/tempera/tilt`，
  与 fusion-music 的 `BUILTIN_VISUALIZER_MODES` 一致）。
- 切模式走 `setMode` 命令，不重载 WebView；设置里的值若非法会回落到 `classic`。
- i18n：三语各加 18 个键（`play_detail_setting_folia_mode` + 17 个模式名）。

## 5. 已知限制

- `PlayLine`（拖动歌词调进度）依赖原 FlatList 的滚动信息，换成 WebView 后拿不到，
  所以**歌词进度条不再显示**（组件仍按设置挂载，拖动功能失效）。后续若需要，
  应在 Folia 页面里做 seek 交互而不是复用 FlatList 的滚动信息。
- 封面图只有 `http(s)` 的能传给页面（本地路径 WebView 取不到），已做过滤。
- WebView 关掉了滚动与越界回弹（`scrollingEnabled={false}` / `overScrollMode="never"`），
  避免在竖屏播放页抢 PagerView 的滑动手势。

## 6. 产物同步

`android/app/src/main/assets/folia/` 已随仓库提交（2095 个文件），
clone 后即可构建。跟随 fusion-music 更新用：

```bash
scripts/sync-folia-webview.sh /path/to/fusion-music
```

## 7. 构建与验证

```bash
export JAVA_HOME=/path/to/jdk-21.0.13+9/Contents/Home
export ANDROID_HOME=/path/to/android-sdk
export PATH=/path/to/node-v20/bin:$PATH

npx react-native bundle --platform android --dev true --entry-file index.js \
  --bundle-output /tmp/lx/index.android.bundle --assets-dest /tmp/lx
cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2
```

- `npx tsc --noEmit`：新代码零错误（仓库原有 4 处错误与本次改动无关）。
- `npx eslint src`：新代码零错误。
- APK：`android/app/build/outputs/apk/debug/lx-music-mobile-v1.9.2-arm64-v8a.apk`，
  内含 2096 条 `assets/folia/` 资源。
- 真机验证（本机无 Android 设备，留给 t4）：播放页切到歌词页应看到 Folia 动态歌词，
  切模式应即时生效。
