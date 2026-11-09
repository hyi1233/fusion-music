// dev/nativeProxy.mjs — 平台原生取链接口的服务端转发（dev middleware 与 prod server 共用）
//
// 背景：三个平台的原生取链接口都做来源校验，且浏览器直连必然被拦：
//   - 酷我 antiserver.kuwo.cn/anti/s：直连 403；带 Origin 更糟
//   - QQ c.y.qq.com：带 Origin 头直接 400
//   - 酷狗 mobilecdn.kugou.com：https 证书与域名不匹配，只能 http；带 Origin 会被 Access Deny
// 所以页面一律请求 /native/<plat>/<path>，由 Node 侧按平台规则补 Referer/Origin 后转发。
//
// 每个平台规则的 sendOrigin=false 表示「不要发 Origin 头」——
// 酷我与 QQ 在带 Origin 时会直接拒绝（illegal / 400）。

const NATIVE_TARGETS = {
  // 酷我 antiserver 取链接口：rid 需要 MUSIC_ 前缀
  kuwo: {
    target: 'https://antiserver.kuwo.cn',
    referer: 'https://www.kuwo.cn/',
    sendOrigin: false,
  },
  // 酷我 www 取链接口（api/www/play/url），必须走 www 主域，不能复用 antiserver
  kuwoWww: {
    target: 'https://www.kuwo.cn',
    referer: 'https://www.kuwo.cn/',
    sendOrigin: false,
  },
  // 酷狗：https 证书域名不匹配，只能 http
  kugou: {
    target: 'http://mobilecdn.kugou.com',
    referer: 'https://m.kugou.com/',
    sendOrigin: false,
  },
  // 酷狗 www 取链接口（getdata）
  kugouWww: {
    target: 'https://www.kugou.com',
    referer: 'https://www.kugou.com/',
    sendOrigin: false,
  },
  // QQ 播放地址接口（v8 fcgi-bin）
  qq: {
    target: 'https://c.y.qq.com',
    referer: 'https://y.qq.com/',
    sendOrigin: false,
  },
  // QQ musicu.fcg（POST，需要 vkey）
  qqMusicu: {
    target: 'https://u.y.qq.com',
    referer: 'https://y.qq.com/',
    sendOrigin: false,
  },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

/** 页面侧使用的原生取链代理路径 */
export function nativeProxyPath(plat, pathAndQuery) {
  return `/native/${plat}${pathAndQuery}`
}

/**
 * 处理一次 /native/<plat>/... 请求。
 * @param {string} url 例如 /native/kuwo/anti/s?type=convert_url3&rid=MUSIC_1
 * @returns {Promise<{status:number, headers:Record<string,string>, body:Buffer}>}
 */
export async function handleNativeProxy(url) {
  const m = /^\/native\/(kuwo|kuwoWww|kugou|kugouWww|qq|qqMusicu)(\/.*)?$/.exec(url.split('?')[0])
  if (!m) return { status: 404, headers: { ...CORS }, body: Buffer.from('not found') }
  const plat = m[1]
  const cfg = NATIVE_TARGETS[plat]
  const rest = url.slice(`/native/${plat}`.length)
  const qIndex = rest.indexOf('?')
  const params = new URLSearchParams(qIndex >= 0 ? rest.slice(qIndex + 1) : '')
  // QQ musicu.fcg 需要 POST + JSON body，body 走查询参数 base64 传（与歌词中继同约定）
  const method = (params.get('__method') ?? 'GET').toUpperCase()
  const bodyParam = params.get('__body')
  params.delete('__method')
  params.delete('__body')
  const query = params.toString() ? `?${params.toString()}` : ''
  const pathOnly = qIndex >= 0 ? rest.slice(0, qIndex) : rest
  const target = cfg.target + pathOnly + query
  let body
  if (bodyParam) body = Buffer.from(bodyParam, 'base64')
  const headers = {
    Referer: cfg.referer,
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  }
  if (cfg.sendOrigin !== false) headers.Origin = cfg.referer.replace(/\/$/, '')
  try {
    const up = await fetch(target, {
      method,
      headers,
      body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
      redirect: 'follow',
    })
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
      body: Buffer.from(JSON.stringify({ code: -1, msg: `native proxy error: ${e.message}` })),
    }
  }
}
