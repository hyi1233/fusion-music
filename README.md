# Fusion Music

一个采用现代 Material 3 界面与模块化全屏动态歌词渲染的开源音乐播放器。

项目基于 React 19 + TypeScript + Vite + Tailwind CSS 构建，集成了多平台音乐聚合检索、免登录流媒体取链播放，以及源自 Folia 的 WebGL / Pixi.js 全屏动态歌词视觉引擎。

---

## 核心设计与特性

### 1. 现代 Material 3 主界面
- **多平台无缝切换**：顶部快捷音源胶囊（全部 / 酷狗音乐 / 网易云音乐 / QQ 音乐 / 酷我音乐 / 咪咕音乐），切换平台时即时拉取对应平台的榜单与推荐。
- **发现与聚合**：精选推荐 Banner、四大核心入口（巅峰榜单、歌单广场、音乐搜索、音源管理）、推荐歌单卡片瀑布流及热歌速递列表。
- **悬浮微晶播放条**：常驻底部 56px 胶囊迷你播放条，显示当前歌曲封面与播放控制，点击平滑展开全屏。

### 2. 全屏沉浸动态歌词舞台
- **点歌秒切全屏**：列表点击歌曲后自动进入全屏动态舞台，无需多步跳转。
- **默认纯净无按键**：播放中默认隐藏所有控制按钮，全屏展示着色器流体背景、粒子微动与逐字发光歌词。
- **轻点屏幕唤出控制栏**：点击屏幕任意位置浮现半透明微晶浮岛，提供上一首、播放/暂停、下一首、细线进度滑块、播放队列展开与动效切换面板。
- **自动隐退**：3.8 秒无操作后，控制栏自动淡出隐退，重归歌词视觉。

### 3. 模块化动效插件体系（接口不写死）
- **即插即用**：全套动效基于 `VISUALIZER_REGISTRY` 动态扫描加载。所有 17 种视觉模式完全模块化解耦，不与主业务逻辑硬编码绑定。
- **支持扩展**：未来若上游更新新动效或团队自行设计新效果，只需在动效目录下新增模式文件夹即可自动发现，主工程与弹窗选择器一行代码无需修改。
- **内置 17 种视觉模式**：
  - 流光（Classic）、心象（Cadenza）、群唱（Cappella）、回环（Claddagh）
  - 镜台（Diorama）、雾笺（Nebbia）、浮名（Fume）、花火（Hanabi）
  - 绘光（Lumiere）、町景（Machi）、莫奈（Monet）、云阶（Partita）
  - 时计（Pendolo）、商籁（Sonnet）、静止（Still）、凝彩（Tempera）、倾斜（Tilt）

### 4. 音频多源回退与免登录播放
- 针对各平台接口特性实现多源重试与降级链，绕开强制扫码登录，实现歌曲点击秒播。

---

## 目录结构

```text
fusion-music/
├── src/
│   ├── App.tsx                     # 主应用入口（底栏导航与路由调度）
│   ├── components/
│   │   ├── ui/                     # 现代应用界面
│   │   │   ├── DiscoverView.tsx    # 发现主页（平台切换、精选 Banner、推荐流）
│   │   │   ├── PlaylistsView.tsx   # 歌单广场（多标签分类与网格卡片）
│   │   │   ├── BrowseView.tsx      # 排行榜视图
│   │   │   ├── SearchView.tsx      # 音乐搜索与结果列表
│   │   │   ├── PlayingView.tsx     # 全屏沉浸动态歌词舞台
│   │   │   ├── MiniPlayer.tsx      # 底部常驻悬浮播放胶囊
│   │   │   └── LyricStylePicker.tsx# 模块化动效样式选择器
│   │   └── visualizer/             # Folia 动态歌词引擎核心
│   │       ├── registry.tsx        # 动效中央注册表（import.meta.glob 动态扫描）
│   │       ├── VisualizerStage.tsx # WebGL / Canvas 渲染宿主
│   │       └── [modes]/            # 各独立动效模块目录（cadenza, hanabi, monet 等）
│   ├── player/                     # 音频状态机与播放核心
│   ├── sources/                    # 音乐接口、免签取链与多源降级
│   └── stores/                     # 全局状态管理
├── dist-webview/                   # 独立 WebView 静态打包产物
└── package.json
```

---

## 如何添加新的动态歌词效果

为了保证系统的可扩展性，动效体系采用了插件式注册机制，添加新动效无需修改主工程代码：

1. **新建模块目录**：在 `src/components/visualizer/` 下新建一个动效目录（例如 `aurora/`）。
2. **实现动效入口**：在目录内编写 `entry.tsx`，导出符合标准的模式契约：
   ```tsx
   import type { VisualizerModule } from '../registry';

   export const entry: VisualizerModule = {
     id: 'aurora',
     name: '极光',
     description: '幽绿与微紫流光在夜空中漫延，逐字歌词随极光带起伏律动',
     component: AuroraRenderer,
   };
   ```
3. **自动生效**：构建系统会自动通过 `import.meta.glob('./*/entry.tsx')` 扫描并加载新模式，弹窗选择器、全屏渲染器会自动识别并渲染该选项。

---

## 本地开发与构建

### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

### 快速启动
```bash
# 1. 安装依赖
npm install

# 2. 启动本地开发服务（网页/桌面端预览）
npm run dev

# 默认访问地址：http://127.0.0.1:5173/
```

### 生产打包
```bash
# 完整编译（含类型检查与 Vite 生产构建）
npm run build

# 单独构建供移动端 WebView 载入的离线动效包
npm run build:webview
```

---

## 开源致谢与借鉴说明 (Acknowledgments)

本项目能够在保持纯净交互的同时呈现高水准的动态视听效果，离不开开源社区多个先锋项目的探索与贡献。我们在此对以下项目及其开发者致以真诚的感谢：

1. **[Folia (folia-major)](https://github.com/chthollyphile/folia-major)**
   - **作者/团队**：chthollyphile 及 Folia 贡献者
   - **借鉴说明**：本项目的全屏动态歌词引擎、17 种视觉模式的着色器流体算法（Shaders）、Pixi.js / Three.js 渲染管线、发光逐字排版与混乱度控制均衍生自 Folia 的开源成果。感谢原作者为社区打造的艺术级视觉表现！
2. **[珊瑚音乐 (Coral Music)](https://github.com/re2005/coral-music)**
   - **借鉴说明**：现代 Material 3 风格界面骨架、顶部多平台胶囊切换、卡片流发现页与微晶悬浮播放条的交互理念主要参考自珊瑚音乐的优秀实践。感谢其在移动端音乐交互上的探索！
3. **[洛雪音乐 (LX Music)](https://github.com/lyswhut/lx-music-mobile)**
   - **作者**：lyswhut
   - **借鉴说明**：音源协议设计、多平台数据聚合规范以及桌面端与移动端歌词格式转换参考了洛雪音乐的成熟体系。感谢 lyswhut 多年来在开源音乐领域的坚守与贡献！
4. **[AMLL (Apple Music Like Lyrics)](https://github.com/Steve-xmh/applemusic-like-lyrics)**
   - **作者**：Steve-xmh
   - **借鉴说明**：卡拉 OK 逐字时间戳对齐逻辑与 TTML 解析方式参考了 AMLL 的开源实现。

---

## 许可证 (License)

本项目代码遵循 [AGPL-3.0 License](LICENSE) 开源协议（因包含并衍生自 Folia 的视觉渲染引擎源码）。
