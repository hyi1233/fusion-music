import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { traditionalLocalePlugin } from './dev/i18n/traditionalLocalePlugin.mjs'
import tailwindcss from '@tailwindcss/vite'

// 洛雪音源 API（onrender.com）不返回 CORS 头，且脚本请求带自定义头
// （X-Request-Key / User-Agent / Content-Type）会触发浏览器预检——预检 OPTIONS
// 转发到 onrender 一样拿不到 CORS 响应，整条链路断。
// 所以 /lxapi 不能用普通 proxy（http-proxy 只会透传 OPTIONS），改用中间件：
// OPTIONS 本地直接应答，其余请求在 Node 侧转发（服务端无 CORS 概念）。
const LX_API_TARGET = 'https://lxmusicapi.onrender.com'
function lxApiProxy(): Plugin {
  return {
    name: 'lx-api-proxy',
    configureServer(server) {
      server.middlewares.use('/lxapi', (req, res) => {
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
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), traditionalLocalePlugin(), lxApiProxy()],
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
