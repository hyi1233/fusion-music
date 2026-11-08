// src/webview/main.tsx — WebView 承载页入口
//
// 与主应用入口分开：这一页只挂 `FoliaWebViewPage`，不引入路由 / store / 音源，
// 产物由 `npm run build:webview` 单独构建到 dist-webview/（base './'，可放在任意路径下）。
import React from 'react';
import { createRoot } from 'react-dom/client';
import FoliaWebViewPage from './FoliaWebViewPage';
import { readPageOptions } from './pageOptions';
import './webview.css';

const container = document.getElementById('root');
if (!container) throw new Error('[folia-webview] 缺少 #root 容器');

const options = readPageOptions(window.location.search);

// 不开 StrictMode：页面是单次挂载的长驻视觉层，StrictMode 的重复挂载会重复发 ready
// 事件、重复注册 transport 监听，对宿主（RN 侧）是噪声。
createRoot(container).render(<FoliaWebViewPage options={options} />);
