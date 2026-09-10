import { type LoaderFunctionArgs, redirect } from 'react-router'
import { legacyRedirectTarget } from '@/lib/routes'

/**
 * 旧 URL → 新 URL（spec §3 重定向表）。框架模式下 loader 在整页请求（服务端）与客户端导航（.data 请求）
 * 都会跑，两边都拿到 302；浏览器历史里是 replace 语义。表里没有的路径 404——这个模块只按表办事。
 */
export function loader({ request }: LoaderFunctionArgs): Response {
  const target = legacyRedirectTarget(new URL(request.url).pathname)
  if (!target) throw new Response('Not Found', { status: 404 })
  return redirect(target)
}

export default function LegacyRedirect() {
  return null
}
