import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { traditionalLocalePlugin } from './dev/i18n/traditionalLocalePlugin.mjs'

// WebView 承载页的独立构建（`npm run build:webview`）。
//
// 与主应用构建的差异只有两点，都是为了嵌进 RN WebView：
//   1. base: './' —— 资源用相对路径。主应用默认 base '/' 的产物一旦被
//      file:// 或任意子路径加载就会 404。
//   2. 入口是 folia-webview.html，产物单独输出到 dist-webview/，不污染 dist/。
// 视觉层的依赖链会带进 i18n（src/i18n/config.ts），所以主应用的 traditionalLocalePlugin
// 也必须挂上——它提供 `virtual:folia-locale-zh-TW`。
//
// 说明：monet 模式的背景管线用 module worker（new Worker(new URL(...))），
// file:// 下 Chromium 会拒绝加载 worker 与 module 脚本。RN 侧请通过
// WebViewAssetLoader（https://appassets.androidplatform.net/...）或本地静态服务
// 承载 dist-webview/，不要直接 file:// 打开。其余 15 种模式不依赖 worker。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), traditionalLocalePlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist-webview',
    emptyOutDir: true,
    target: 'es2020',
    assetsDir: 'assets',
    rollupOptions: {
      input: fileURLToPath(new URL('./folia-webview.html', import.meta.url)),
    },
  },
})
