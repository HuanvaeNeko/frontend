/**
 * 上游地址只从环境变量读，**绝不硬编码 api.huanvae.cn**。
 *
 * 生产：`http://edge:8787` / `ws://edge:8787`（docker 网络内的 Caddy sidecar）。
 * 本地：`http://127.0.0.1:8787` / `ws://127.0.0.1:8787`（compose override 发布出来的同一个容器）。
 * e2e：指向 `tests/fixtures/fake-backend.ts`。
 *
 * 缺失时直接抛错，不回退到任何默认值：一个悄悄指错地方的 BFF 比起不来的 BFF 难查得多。
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}——BFF 不知道该把请求转到哪里`)
  }
  return value.replace(/\/+$/, '')
}

export const upstreamHttp = (): string => required('BFF_UPSTREAM_HTTP')
export const upstreamWs = (): string => required('BFF_UPSTREAM_WS')
