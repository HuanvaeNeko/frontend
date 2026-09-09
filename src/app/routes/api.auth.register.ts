import type { ActionFunctionArgs } from 'react-router'
import { forwardToUpstream, isCrossSiteWrite } from '../../../server/proxy/forward'
import { crossSiteRejectedResponse } from '../../../server/session'

/**
 * `POST /api/auth/register` —— **不查会话**的转发。
 *
 * 注册是未登录用户发起的：走 `api.$.ts` 那条 catch-all 会被要求会话 cookie，
 * 没有就 401，注册功能直接坏掉。所以它必须是独立一条。
 *
 * 与 login 的差别：注册**不建会话**。后端的注册接口不返回 token（文档
 * `backend-docs/auth/用户登录注册鉴权部分.md:20-27` 的请求体是
 * `{user_id, nickname, password, email}`，响应里没有 token），前端注册成功后
 * 仍然要走一次登录。所以这里只做纯转发，一个字节都不改。
 */
export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (isCrossSiteWrite(request)) return crossSiteRejectedResponse()
  const url = new URL(request.url)
  return forwardToUpstream(request, { pathWithQuery: `${url.pathname}${url.search}` })
}
