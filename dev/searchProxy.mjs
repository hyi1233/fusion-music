// dev/searchProxy.mjs — 搜索接口的服务端转发（dev middleware 与 prod server 共用）
//
// 背景：酷我/酷狗/QQ 的搜索接口都不返回 CORS 头，浏览器直连会被拦；
// QQ 接口在带 Origin 头时直接 400。所以浏览器一律请求 /search/<plat>/...，
// 由 Node 侧补 Referer/Origin 后转发，返回时补 CORS 头。

const TARGETS = {
  kuwo: { target: 'https://search.kuwo.cn', referer: 'https://www.kuwo.cn/' },
  // mobilecdn.kugou.com 的 https 证书与域名不匹配，只能走 http
  kugou: { target: 'http://mobilecdn.kugou.com', referer: 'https://m.kugou.com/' },
  qq: { target: 'https://c.y.qq.com', referer: 'https://y.qq.com/' },
  // 酷狗榜单接口只在 m.kugou.com 上
  kg: { target: 'https://m.kugou.com', referer: 'https://m.kugou.com/' },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

/** 生成 /search/<plat> 前缀的 fetch 目标地址（页面侧用） */
export function searchProxyPath(plat, pathAndQuery) {
  return `/search/${plat}${pathAndQuery}`
}

/**
 * 歌词/封面等第三方主机的转发（白名单）。
 * 这些接口要么不带 CORS 头，要么对来源敏感（QQ 的 u.y.qq.com 需要特定 UA）。
 */
const LYRIC_TARGETS = [
  { host: 'u.y.qq.com', origin: 'https://y.qq.com' },
  { host: 'c.y.qq.com', origin: 'https://y.qq.com' },
  { host: 'y.gtimg.cn', origin: 'https://y.qq.com' },
  { host: 'krcs.kugou.com', origin: 'https://m.kugou.com' },
  { host: 'kgimg.com', origin: 'https://m.kugou.com' },
  { host: 'kugou.com', origin: 'https://m.kugou.com' },
  // 酷我在带 Origin 头时会返回「音乐查询失败」，只能发 Referer
  { host: 'm.kuwo.cn', origin: 'https://www.kuwo.cn', sendOrigin: false },
]

/**
 * 处理一次 /api/lyric-proxy?url=<encodeURIComponent(target)> 请求。
 * @returns {Promise<{status:number, headers:Record<string,string>, body:Buffer}>}
 */
export async function handleLyricProxy(url) {
  const q = url.indexOf('?')
  const params = new URLSearchParams(q >= 0 ? url.slice(q + 1) : '')
  const target = params.get('url')
  if (!target) {
    return { status: 400, headers: { ...CORS }, body: Buffer.from('missing url') }
  }
  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return { status: 400, headers: { ...CORS }, body: Buffer.from('bad url') }
  }
  const rule = LYRIC_TARGETS.find(t => parsed.hostname === t.host || parsed.hostname.endsWith('.' + t.host))
  if (!rule) {
    return { status: 403, headers: { ...CORS }, body: Buffer.from(`host not allowed: ${parsed.hostname}`) }
  }
  // 方法与请求体通过查询参数传递（QQ 音乐 u.y.qq.com 需要 POST + JSON body）
  const method = (params.get('method') ?? 'GET').toUpperCase()
  const bodyParam = params.get('body')
  let body
  if (bodyParam) {
    body = Buffer.from(bodyParam, 'base64')
  }
  try {
    const up = await fetch(parsed.toString(), {
      method,
      headers: {
        Referer: rule.origin,
        ...(rule.sendOrigin === false ? {} : { Origin: rule.origin }),
        'User-Agent': params.get('ua') ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
      redirect: 'follow',
    })
    const buf = Buffer.from(await up.arrayBuffer())
    const out = { ...CORS }
    up.headers.forEach((v, k) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) out[k] = v
    })
    return { status: up.status, headers: out, body: buf }
  } catch (e) {
    return {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ code: -1, msg: `lyric proxy error: ${e.message}` })),
    }
  }
}

/**
 * 处理一次 /search/<plat>/... 请求。
 * @param {string} url 例如 /search/kuwo/r.s?all=xx
 * @returns {Promise<{status:number, headers:Record<string,string>, body:Buffer}>}
 */
export async function handleSearchProxy(url) {
  const m = /^\/(search\/(kuwo|kugou|qq)|kg)(\/.*)?$/.exec(url.split('?')[0])
  if (!m) return { status: 404, headers: { ...CORS }, body: Buffer.from('not found') }
  const plat = m[2] ?? 'kg'
  const cfg = TARGETS[plat]
  const prefix = plat === 'kg' ? '/kg' : `/search/${plat}`
  const rest = url.slice(prefix.length)
  const target = cfg.target + rest
  const headers = {
    Referer: cfg.referer,
    Origin: cfg.referer.replace(/\/$/, ''),
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  }
  try {
    const up = await fetch(target, { headers, redirect: 'follow' })
    const buf = Buffer.from(await up.arrayBuffer())
    const out = { ...CORS }
    up.headers.forEach((v, k) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'access-control-allow-origin'].includes(k)) {
        out[k] = v
      }
    })
    return { status: up.status, headers: out, body: buf }
  } catch (e) {
    return {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ code: -1, msg: `search proxy error: ${e.message}` })),
    }
  }
}
