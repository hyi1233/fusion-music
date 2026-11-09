// dev/serve.mjs — 生产环境静态服务（含搜索/榜单/音源 API 代理）
//
// 浏览器无法直连酷我/酷狗/QQ 搜索接口、酷狗榜单接口与洛雪音源 API：
// 它们都不返回 CORS 头（QQ 接口在带 Origin 头时甚至直接 400）。
// dev 下由 vite 中间件代理；生产用这个 Node 服务托管 dist/ 并挂同样的代理。
//
// 用法：node dev/serve.mjs [--port 8080] [--root dist]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleSearchProxy, handleLyricProxy } from './searchProxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PORT = Number(getArg('port', process.env.PORT || 8080));
const ROOT = path.resolve(__dirname, '..', getArg('root', 'dist'));

const LX_API_TARGET = 'https://lxmusicapi.onrender.com';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

/** 洛雪音源 API 代理（与 vite 的 lxApiProxy 同语义） */
async function proxyLxApi(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string' && !['host', 'origin', 'referer'].includes(k)) headers[k] = v;
  }
  try {
    const up = await fetch(LX_API_TARGET + (req.url ?? '/'), {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
      duplex: 'half',
    });
    const out = { ...CORS };
    up.headers.forEach((v, k) => {
      if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(k)) out[k] = v;
    });
    res.writeHead(up.status, out);
    res.end(Buffer.from(await up.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: -1, msg: `lxapi proxy error: ${e.message}` }));
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA 回退
      fs.readFile(path.join(ROOT, 'index.html'), (e2, idx) => {
        if (e2) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(idx);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/api/lyric-proxy')) {
    const out = await handleLyricProxy(url);
    res.writeHead(out.status, out.headers);
    res.end(out.body);
    return;
  }
  if (url.startsWith('/search/') || url.startsWith('/kg')) {
    const out = await handleSearchProxy(url);
    res.writeHead(out.status, out.headers);
    res.end(out.body);
    return;
  }
  if (url.startsWith('/lxapi')) {
    req.url = url.slice('/lxapi'.length) || '/';
    await proxyLxApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`fusion-music serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
