import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'

/**
 * 终审 C1：登录成功后的 `next` 回跳，只认「解析后同源」，不是字符串前缀猜测。
 *
 * 旧实现是 `nextPath && nextPath.startsWith('/') ? nextPath : DEFAULT_AUTHENTICATED_ROUTE`——
 * 这是本期 Task 6 被判 Critical 的旧版 `isValidRedirectUri` 的逐字同款：只看字符串是不是
 * `/` 开头，既不排除 `//evil.example/phish` 这种协议相对地址，也不挡 `/\t/evil.example/phish`
 * 这种控制字符走私（`new URL()` 解析时会把字符串中间的 tab/LF/CR 直接吃掉，等价于协议相对
 * 地址）。而且这条路径真的会跳出站外：`router.push`/`router.replace` 最终走到
 * `history.push`/`history.replace`，跨源 `pushState`/`replaceState` 会抛 `SecurityError`，
 * react-router 在 `history.js` 里用整页 `window.location.assign(url)` 兜底——不是被
 * React Router 吞掉的死路径。
 *
 * 不能直接复用 `@/features/oauth/lib/redirectUri` 的 `isValidRedirectUri`：它的绝对
 * http(s) 分支是刻意放行站外的（OAuth 外部客户端回调），这里是站内登录回跳，语义完全
 * 不同——把它整个搬过来会把"放行站外"也一起带进来，等于没修。
 */
export function safeNext(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value, location.origin)
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : null
  } catch {
    return null
  }
}

/** 登录成功 / 已登录时该去哪：合法的站内 next，否则默认页（已删除的旧首页也退回默认页） */
export function postLoginTarget(next: string | null): string {
  const target = safeNext(next) ?? DEFAULT_AUTHENTICATED_ROUTE
  return target.includes('/app/home') ? DEFAULT_AUTHENTICATED_ROUTE : target
}
