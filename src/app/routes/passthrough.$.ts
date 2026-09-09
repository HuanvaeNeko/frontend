import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import { forwardToUpstream } from '../../../server/proxy/forward'

/**
 * 透传代理：`/avatars/*`、`/user-file/*`、`/friends-file/*`、`/apps/*`。
 *
 * 与 `api.$.ts` 的差别是**两个不作为**，都是硬约束：
 *
 * 1. **不查会话。** 这些资源自鉴权：预签名 URL 的签名在查询串里，头像是公开可读的。
 *    查会话会让未登录状态下的头像加载全部 401。
 * 2. **绝不注入 `Authorization`。** 预签名请求已经带了查询串签名，S3 兼容存储
 *    对「同时带查询串签名和 Authorization 头」直接拒绝（403）。测试用
 *    `headers.has('authorization') === false` 钉住 —— 断言键**不存在**，
 *    而不是它的值为 null。
 *
 * 那为什么还要经过 BFF？因为浏览器直连 `api.huanvae.cn` 走不通（ICP 拦截 +
 * mTLS），这些字节也必须由服务端代取。客户端的 `toAbsoluteApiUrl` 把后端返回的
 * 相对路径落到同源，自然进这里。
 */
function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  // pathname + search 原样拼接，不重新编码：X-Amz-Signature 对字节敏感
  return forwardToUpstream(request, { pathWithQuery: `${url.pathname}${url.search}` })
}

export const loader = ({ request }: LoaderFunctionArgs): Promise<Response> => handle(request)
export const action = ({ request }: ActionFunctionArgs): Promise<Response> => handle(request)
