/**
 * 边缘验收探针 —— 只在 alice 上、`edge` 容器起来之后跑。
 *
 * 判据：未鉴权请求应当拿到**后端的 401**（`{"success":false,"code":401,...}`）。
 * 拿到 401 就证明整条链路通了：TLS 握手成功、客户端证书被接受、Host 路由正确、
 * 请求真的到了 Rust 后端。任何非 401（连接错误、502、超时）都是失败。
 *
 * 40 串行 + 40 并行的形状来自 nginx 那次实测：边缘对**新建**的 mTLS 连接约有
 * 1/8 会 RST，而复用已有连接的请求从不失败。并发那一组就是在压这个行为。
 * nginx 加上 keepalive 之后是 40+40 全过（之前 10%~25% 失败），这里用同一个基线。
 *
 * 用法：bun run edge/probe.ts [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://edge:8787'
const PATH = '/api/friends'

async function once(i: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}${PATH}`)
    if (res.status === 401) return null
    return `#${i} 状态码 ${res.status}（期望 401）`
  } catch (error) {
    return `#${i} ${error instanceof Error ? error.message : String(error)}`
  }
}

const serial: (string | null)[] = []
for (let i = 0; i < 40; i++) serial.push(await once(i))

const parallel = await Promise.all(Array.from({ length: 40 }, (_, i) => once(40 + i)))

const failures = [...serial, ...parallel].filter((x): x is string => x !== null)

// WS 握手：不带 token 时后端回 HTTP 400 `missing field token`（已实测记录）。
// 拿到 400 说明升级请求真的到了后端，而不是被边缘或 Caddy 挡下。
let wsNote = ''
try {
  const res = await fetch(`${BASE}/ws`, {
    headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
  })
  wsNote = `WS 握手状态码 ${res.status}（期望 400 missing field token）`
} catch (error) {
  wsNote = `WS 握手失败：${error instanceof Error ? error.message : String(error)}`
}

console.warn(`串行 40 + 并行 40：失败 ${failures.length} / 80`)
for (const f of failures.slice(0, 10)) console.warn('  ', f)
console.warn(wsNote)
process.exit(failures.length === 0 ? 0 : 1)

// 顶层 await 要求本文件是一个 module；本文件没有 import/export，tsc 会把它当
// script 处理并报 TS1375。加一个空 export 让 tsc 认定这是 module——不影响
// Bun 的运行时行为（Bun 本就把每个文件当 ESM 跑）。
export {}
