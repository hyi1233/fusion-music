# Fusion Music

自研音乐播放器。核心组合：

- **歌词视觉核心**：来自 [Folia (folia-major)](https://github.com/chthollyphile/folia-major)（AGPL-3.0）的全屏动态歌词引擎（逐字渲染、雾笺/町景等着色器视觉）
- **音乐能力**：兼容洛雪（LX Music）音源协议的第三方音源（完整播放），平台公开接口的搜索 / 歌单 / 排行榜
- **壳**：React + Vite，Capacitor 打包 Android APK（电视遥控器 + 手机触屏）

## 许可

AGPL-3.0（因包含 Folia 源码衍生部分）。

## 状态

🚧 MVP 开发中。里程碑：
- [ ] M1 Folia 歌词视觉核心搬移并跑通（网页验证）
- [ ] M2 搜索 + 音源播放 + 动态歌词全屏页
- [ ] M3 排行榜 / 新歌榜 / 歌单浏览
- [ ] M4 收藏 / 下载 / 设置
- [ ] M5 Capacitor APK（电视适配）
