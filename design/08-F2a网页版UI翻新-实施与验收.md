# F2a 网页版 UI 翻新 — 实施与验收笔记

> 任务：t5（attempt `4ffbaf65-a037-40ea-aa57-9c0a2ef235c2`）
> 范围：`src/components/ui`、`src/App.tsx`、`src/stores`、`src/index.css`、`src/i18n`、`tests`（不含 `src/webview`、`src/merge`、android）
> 目标：修掉用户原话「界面太简陋、菜单键/动态歌词的菜单键选择没有动词名字、无法自行添加语言、播放功能不能正常工作、设置菜单太简陋」。

---

## 1. 改了什么

### 1.1 菜单动词化 + 图标化

| 位置 | 之前 | 之后 |
| --- | --- | --- |
| 底部导航 | 两个裸文字 tab「搜索 / 榜单」 | 三个 lucide 图标按钮：搜索（Search）、榜单（ListMusic）、设置（Settings），`aria-label` 全部走 i18n |
| 顶栏 | 无 | `Disc3` 图标 + `Fusion Music` + 副标题 |
| 播放页 | 无返回入口 | `ChevronLeft` 返回按钮 |

### 1.2 动态歌词样式菜单的动词名（关键诉求）

Folia 内建 17 种歌词动画此前只有英文标识符（`cadenza`/`classic`/`monet`…），用户在 UI 上看不到任何有意义的名字。
现按 Folia 上游 `src/i18n/locales/zh-CN.ts:1113-1134` 的中文名落地：

| mode | 中文 | mode | 中文 | mode | 中文 |
| --- | --- | --- | --- | --- | --- |
| cadenza | 心象 | classic | 流光 | diorama | 镜台 |
| cappella | 群唱 | fume | 浮名 | hanabi | 花火 |
| claddagh | 回环 | lumiere | 绘光 | machi | 町景 |
| monet | 莫奈 | partita | 云阶 | pendolo | 时计 |
| sonnet | 商籁 | still | 静止 | tempera | 凝彩 |
| tilt | 倾诉 | nebbia | 雾笺 | — | — |

- 入口两处：**播放页 →「歌词样式」按钮**（弹层面板，17 项网格，当前项高亮 + `Check` 图标）；**设置页 → 外观与播放 → 默认歌词样式**（`LyricStylePicker` 紧凑网格，可设默认并落盘）。
- 面板内标注「共 17 种样式」，`Tab` 键循环切换样式，`Esc` 关闭面板。
- 三语（简/繁/英）各 17 个模式名，繁体表手写（不走上游构建期插件），英文用首字母大写形式。

### 1.3 语言自选（关键诉求）

`设置 → 界面语言` 提供四项：跟随系统 / 简体中文 / 繁體中文 / English，调用既有 `applyAppLanguagePreference()` 落盘 `folia_app_language`。
同时新增 `src/i18n/fusion/locales.ts` 自带 `fusion.*` 命名空间文案（简/繁/英三份），`src/i18n/config.ts` 把三语包挂到 `resources[lang].translation.fusion`，缺失 key 时 `parseMissingKeyHandler` 回退中文表。

### 1.4 音源脚本自填（关键诉求）

`设置 → 音源设置` 提供：脚本地址输入框、保存、**测试连接**、恢复默认。
- 校验只接受 `http/https`（空串 = 用内置默认）。
- 测试连接判定脚本是否走标准洛雪协议（同时含 `musicUrl` 与 `EVENT_NAMES`），并给出可读原因。

### 1.5 播放功能修复（关键诉求）

用户报「播放功能不能正常工作」，实测有 **4 个独立根因**，逐个修掉：

1. **音源沙箱 iframe 读不到 contentDocument**（真 bug，真实浏览器同样复现）
   `src/sources/lx/runner.ts` 原来用 `sandbox="allow-scripts"` + `src='about:blank'` + `contentDocument.write()`。
   sandbox 无 `allow-same-origin` → iframe 是不透明源，父页面拿不到 `contentDocument`，于是恒定抛「无法创建音源沙箱 iframe」。
   改法：改用 `iframe.srcdoc = '<!doctype html>…<script>…</script>'` 注入脚本，并加 `escapeScript()` 把脚本内的 `</script` 转义，避免提前闭合。

2. **平台搜索接口浏览器直连全部 CORS 失败**（真 bug）
   页面内 `fetch` 酷我/酷狗/QQ 搜索接口全部 `ERR Failed to fetch`；QQ 接口在带 `Origin` 头时甚至直接返回 HTTP 400；三家响应均无 `Access-Control-Allow-*`。
   改法：新增 `dev/searchProxy.mjs`（Node 侧转发 + 补 Referer/Origin/UA），`vite.config.ts` 挂 `searchProxy()` 中间件，`src/sources/search.ts` 三个平台改走 `/search/<platform>/...`。
   附带两处协议修正：
   - 酷我返回的是 **Python 风格伪 JSON**（单引号 + `True/False/None`），新增 `normalizePythonDict()` 归一化后再 `JSON.parse`，并清洗 `&nbsp;`。
   - 酷狗搜索接口是 `mobilecdn.kugou.com`（https 证书与域名不匹配，只能走 http），响应结构是 `data.info[]` 而非 `data.lists`。

3. **歌词取不到**
   - 酷我歌词接口带 `Origin` 头就返回「音乐查询失败」，中继层对 `m.kuwo.cn` 改为 **不发 Origin 只发 Referer**，并加 3 次重试。
   - 酷狗 `krcs.kugou.com` 的 CORS 头写死为 `acsing.kugou.com`，浏览器直连必被拦 → 走本地中继。
   - 新增 `src/sources/amllLyrics.ts`：AMLL 歌词库（`api.amll.dev`，自带 `access-control-allow-origin: *`）作为首选，`fetchLyric` 先走 AMLL、未命中再回退平台接口。
     - AMLL `/v1/lyrics/get` 必须用 `qqMusicId`/`ncmMusicId`/`id`/`filename` 之一；检索 `musicName+artistName` 组合过严（total 0），故依次尝试「歌名+歌手 → 歌名 → q=歌名+歌手」三种策略。
   - `src/services/lyricProxy.ts` 新增 `lyricProxyWebPostUrl()`（body base64），QQ 的 `requestQQ()` 非 Electron 环境改走中继。

4. **榜单/音源接口没走代理**
   `src/sources/charts.ts` 与 `src/sources/lx/keepalive.ts` 去掉 `import.meta.env.DEV` 分支，**所有环境**都走本地 `/kg`、`/lxapi` 代理。

### 1.6 播放失败不再"静默"

之前解析失败只表现为「未播放」，用户完全看不出原因。
现 `src/player/playerStore.ts` 增加 `error` 字段，`hydrateUrls()` 把 `resolvePlayUrl` 的异常文案带回 store；`src/player/audioEngine.ts` 增加 `lastError`（`play()` reject / `error` 事件）。
播放页顶部显示红色错误条：**播放失败** + 「音源服务暂时不可用（可能被限流或封禁 IP），可在『设置 → 音源设置』中更换音源脚本地址后重试。」+ 错误详情。
> 实测当前网络下 `lxmusicapi.onrender.com` 返回 `{"code":1,"msg":"禁止批量下载，请规范使用！"}`（上游按 IP 封禁，换 UA/Referer/去 key 均无效），此为上游服务限制，非本项目代码缺陷；错误条正是为这种情况准备的。

### 1.7 设置页整体重做

`SettingsView` 四张卡片：**外观与播放**（默认歌词样式）/ **界面语言** / **音源设置** / **关于**。原先只有三行平铺控件，无标题、无分组、无层级。

### 1.8 其它 UI

- `SongRow`：序号 / 歌名 / 歌手·专辑 / 来源徽章（酷我·酷狗·QQ 三色）/ 时长 / 播放按钮。
- `MiniPlayer`：底部常驻迷你播放条（封面首字 / 歌名 / 歌手 / 队列位置 / 时间 / 播放暂停 / 下一首）。
- `PlayingView`：可拖动进度条、上一首/播放暂停/下一首、音量（静音切换）、歌词样式面板、播放队列面板、遥控器提示行。
- `SearchView` / `BrowseView`：输入框带图标、结果数提示、错误条、空态、榜单页签。

---

## 2. 新增/改动文件

**新增**
- `src/i18n/fusion/locales.ts`（fusion.* 命名空间三语文案）
- `src/i18n/fusion/useFusionT.ts`
- `src/stores/useFusionUiStore.ts`
- `src/components/ui/{SongRow,LyricStylePicker,SettingsView,MiniPlayer}.tsx`
- `src/sources/amllLyrics.ts`、`src/sources/lx/scriptSource.ts`
- `dev/searchProxy.mjs`、`dev/serve.mjs`
- `tests/fusionUi.test.ts`、`tests/playerStore.test.ts`

**改动**
`src/App.tsx`、`src/components/ui/{SearchView,BrowseView,PlayingView}.tsx`、`src/i18n/config.ts`、`src/player/{audioEngine,playerStore}.ts`、`src/services/lyricProxy.ts`、`src/services/onlineMusic/qq/qqLyricProvider.ts`、`src/sources/{charts,search,lyrics}.ts`、`src/sources/lx/{keepalive,runner}.ts`、`vite.config.ts`、`package.json`（加 `serve` 脚本）、`tests/sources.{search,lyrics}.test.ts`

**生产化**：`dev/serve.mjs` —— Node 静态服务（MIME 表、CORS、SPA 回退、`/search/`、`/kg`、`/lxapi`、`/api/lyric-proxy` 代理），`npm run serve -- --port 5300` 可直接跑生产构建产物。`lxApiProxy()` 与 `searchProxy()` 同时挂了 `configurePreviewServer`，`vite preview` 也可用。

---

## 3. 验证

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc -b` | 0 error |
| 测试 | `npx vitest run` | **121 passed / 10 files**（原有 97 + fusionUi 13 + playerStore 3 + 原有新增共 121） |
| 构建 | `npm run build` | ✓ built in ~2.2s |
| 生产服务 | `node dev/serve.mjs --port 5300` | index / search / kg / lxapi 全 200 |
| 浏览器自查 | ego-browser（1408×698） | 搜索→30 条结果→播放页→样式面板 17 项中文名→队列→错误条，见 `design/08-F2a截图/` |

截图：`design/08-F2a截图/t5-1{0..6}-*.png`（搜索/榜单/设置/搜索结果/播放页/样式面板/莫奈模式）。

### 测试补强说明
- `tests/fusionUi.test.ts`：store 持久化、非法样式忽略、脚本地址 trim、resetSettings、脚本地址校验、`testAudioSourceScript` 四种情形、三语包覆盖 17 个模式名、中文名≠英文原名、三语键集合一致。
- `tests/playerStore.test.ts`（本次新增）：音源解析失败时错误写进 state、解析成功时 `error` 为 null、重播覆盖旧错误。
- ⚠️ Node 26 自带实验性 `localStorage`，会盖掉 jsdom 实现 → 测试里必须**先 `defineProperty` 替换再 `await import` store**，否则报 `Cannot read properties of undefined (reading 'getItem')`。

---

## 4. 已知限制

1. **上游音源按 IP 封禁**：`lxmusicapi.onrender.com` 对当前网络返回 `code:1 禁止批量下载`，播放链接解析会失败。UI 已给出可操作的错误提示与「更换音源脚本地址」入口；换用可用的音源脚本即可恢复播放。
2. **榜单页偶发长时间"加载中"**：依赖 `/kg` 代理取数，酷狗限流时会挂起（外部依赖）。
3. `PlayLine` 拖动进度条在 Android 壳内失效（t3 遗留，本次不动安卓）。
4. `artifacts/`（68M，含 evidence/original/fixtures）未入库，避免仓库膨胀；本任务交付的 7 张截图已放 `design/08-F2a截图/`。
