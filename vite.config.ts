import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { traditionalLocalePlugin } from './dev/i18n/traditionalLocalePlugin.mjs'
import tailwindcss from '@tailwindcss/vite'

// 洛雪音源 API（onrender.com）不返回 CORS 头，且脚本请求带自定义头
// （X-Request-Key / User-Agent / Content-Type）会触发浏览器预检——预检 OPTIONS
// 转发到 onrender 一样拿不到 CORS 响应，整条链路断。
// 所以 /lxapi 不能用普通 proxy（http-proxy 只会透传 OPTIONS），改用中间件：
// OPTIONS 本地直接应答，其余请求在 Node 侧转发（服务端无 CORS 概念）。
const LX_API_TARGET = 'https://lxmusicapi.onrender.com'
function lxApiProxy(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return
    }
    const url = LX_API_TARGET + (req.url ?? '/')
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string' && k !== 'host' && k !== 'origin' && k !== 'referer') headers[k] = v
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? (req as unknown as BodyInit) : undefined,
      ...(hasBody ? { duplex: 'half' } : {}),
    })
      .then(async (up) => {
        const out: Record<string, string> = { ...cors }
        up.headers.forEach((v, k) => {
          if (k !== 'transfer-encoding' && k !== 'content-encoding' && k !== 'content-length') out[k] = v
        })
        res.writeHead(up.status, out)
        const buf = Buffer.from(await up.arrayBuffer())
        res.end(buf)
      })
      .catch((e) => {
        res.writeHead(502, { ...cors, 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: -1, msg: `lxapi proxy error: ${e.message}` }))
      })
  }
  return {
    name: 'lx-api-proxy',
    configureServer(server) {
      server.middlewares.use('/lxapi', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/lxapi', middleware)
    },
  }
}

// 各平台搜索接口都不带 CORS 头，浏览器直连会被拦；QQ 接口甚至在带 Origin 头时
// 直接返回 400。所以搜索请求统一走本地代理前缀（/search/*），由 Node 侧转发。
function searchProxy(): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/search/') && !req.url?.startsWith('/kg') && !req.url?.startsWith('/api/lyric-proxy')) {
      next()
      return
    }
    const { handleSearchProxy, handleLyricProxy } = await import('./dev/searchProxy.mjs')
    const out = req.url.startsWith('/api/lyric-proxy')
      ? await handleLyricProxy(req.url)
      : await handleSearchProxy(req.url)
    res.writeHead(out.status, out.headers)
    res.end(out.body)
  }
  return {
    name: 'search-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    // vite preview 也挂上，便于本地用生产产物验证搜索/播放
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

// 平台原生取链接口（酷我/QQ/酷狗）全部做来源校验：酷我直连 403、
// QQ 带 Origin 直接 400、酷狗只能 http。页面统一请求 /native/<plat>/...，
// 由 Node 侧按平台规则补 Referer 后转发（且不发 Origin）。
function nativeProxy(): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/native/')) {
      next()
      return
    }
    const { handleNativeProxy } = await import('./dev/nativeProxy.mjs')
    const out = await handleNativeProxy(req.url)
    res.writeHead(out.status, out.headers)
    res.end(out.body)
  }
  return {
    name: 'native-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), traditionalLocalePlugin(), lxApiProxy(), searchProxy(), nativeProxy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 酷狗移动端接口不返回 CORS 头，浏览器直连会被拦；dev 走本地代理
      '/kg': {
        target: 'https://m.kugou.com',
        changeOrigin: true,
        rewrite: p => p.replace(/^\/kg/, ''),
        headers: { Referer: 'https://m.kugou.com/' },
      },
    },
  },
})
