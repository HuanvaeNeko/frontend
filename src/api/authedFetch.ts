import { useAuthStore } from '@/features/auth/store/authStore'
import { isBusiness401Path } from '@/lib/business401'
import { ROUTES } from '@/lib/routes'

/**
 * 这个**请求**（方法 + 路径）是不是业务 401 端点。
 *
 * 给 {@link fetchWithAuth} 的 401 分支用：那时手里只有 `url` 与 `options.method`。
 * 业务 401 端点表住在 `src/lib/business401.ts` 的 `BUSINESS_401_ENDPOINTS`
 * （经 {@link isBusiness401Path} 查询）——它有两个消费方，客户端这一份与 BFF
 * 各查一次，所以不能只住在这一侧。
 *
 * `url` 绝对地址或相对路径都行，只比较 pathname（query / hash 不参与）；
 * 解析不出来就判假——判假 = 维持原来的登出行为，不会凭空多出一条静默路径。
 */
export const isBusiness401Request = (method: string | undefined, url: string): boolean => {
  let pathname: string
  try {
    // 同源之后 `url` 都是相对路径，`URL` 解析仍然需要一个基址才能取出
    // pathname；这里只取 pathname、不会真的用它发请求，基址取哪个都不影响结果。
    pathname = new URL(url, 'http://localhost').pathname
  } catch {
    return false
  }
  return isBusiness401Path(method, pathname)
}

/**
 * 401 上的登出跳转。
 *
 * - `typeof window !== 'undefined'`：非浏览器上下文里不报 ReferenceError；
 * - `pathname !== ROUTES.auth.login`：已经在登录页时不再自跳一次。
 */
const redirectToLogin = (): void => {
  if (typeof window !== 'undefined' && window.location.pathname !== ROUTES.auth.login) {
    window.location.href = ROUTES.auth.login
  }
}

/**
 * 同源 fetch。**不带 Authorization、不刷新、不重试。**
 *
 * 凭证是 httpOnly cookie，浏览器自动带上（`credentials: 'same-origin'`）；
 * token 由 BFF 持有，刷新在 BFF 转发**之前**完成（见 `server/session/refresh.ts`）。
 * 客户端在 401 上唯一要做的判断是「这是不是业务 401」：
 * - 是（改密打错旧密码）→ 什么都不做，让调用方读后端文案；
 * - 不是 → 清本地登录态并跳登录页。
 *
 * 刻意**不**做「401 后重试」：BFF 已经保证了新鲜度，重试只会重放一个非幂等请求。
 *
 * ## `Content-Type: application/json` 是保留的默认值，不是新加的
 *
 * 旧 `getAuthHeaders()` 做两件事：拼 `Authorization`，和给一个默认
 * `Content-Type: application/json`。这里删掉的只是前者——全仓没有任何调用点
 * 自带这个头（`grep -rn "Content-Type" src` 的命中全是构造 mock **响应**时写的），
 * 少了它，字符串 `body` 会被浏览器补成 `text/plain;charset=UTF-8`，而 BFF 对
 * 请求侧 `content-type` 原样转发、不做任何归一化（`server/proxy/forward.ts` 的
 * `STRIP_FROM_REQUEST` 不含它）。合并顺序 `{ 默认, ...options.headers }` 与
 * 旧代码 `{ ...getAuthHeaders(), ...options.headers }` 一致：调用方的头仍然
 * 覆盖默认值。
 */
export const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })

  if (response.status === 401 && !isBusiness401Request(options.method, url)) {
    useAuthStore.getState().clearAuth()
    redirectToLogin()
  }

  return response
}
