'use client'

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useRouter } from '@/lib/navigation'
import { useAuthStore } from '../store/authStore'
import SimpleLoading from '@/components/common/SimpleLoading'
import { Button } from '@/components/ui/button'
import { DEFAULT_AUTHENTICATED_ROUTE, DEFAULT_UNAUTHENTICATED_ROUTE } from '@/lib/routes'

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * 会话制下没有「水合完成」这件事可等了——落盘的只剩 `user`（首帧渲染用，
 * 不当授权依据），`isAuthenticated` 干脆不落盘。这里等的是 `restoreSession()`
 * 问完 BFF 那一次。
 *
 * ## 状态机
 *
 * 三个信号：`isAuthenticated`、`isRestoring`、`error`（`restoreSession` 502 /
 * 网络失败时的可重试错误，401 时是 `null`）。两个 ref 记的是"跨渲染的既成事实"，
 * 不是派生状态：
 *
 * - `attemptedRef`：本次挂载**已经**发起过 `restoreSession()`。挡的是
 *   `!isAuthenticated && !isRestoring` 在 401 之后**再次**成立时的无限重试——
 *   `restoreSession` 的 401 分支会把 `isAuthenticated` / `isRestoring` 都落回
 *   `false`，触发条件原样复现，没有这个挡板会不断反复问 BFF。
 * - `hasBeenRestoringRef`：本次挂载**真的**观察到过 `isRestoring === true`。
 *   跳转只认这个，不认 `attemptedRef`——原因见下面「为什么不能只用
 *   attemptedRef」。
 *
 * 挂载时若 `!isAuthenticated && !isRestoring` 就调一次 `restoreSession()`；
 * `isRestoring` 为真、或者还没confirmed 出结果时渲染 `<SimpleLoading />`；
 * 只有在**真的**过完一次 `isRestoring: true → false` 的完整周期、且落地时
 * `!isAuthenticated && !error`（= 确认是 401，不是 502 / 网络失败）才跳转。
 *
 * ## 为什么不能只用 attemptedRef（这里就是"双跳"陷阱）
 *
 * `restoreSession()` 内部先同步 `set({isRestoring: true})`，这个更新要等到
 * **下一次渲染**才会被这个组件看见——调用 `restoreSession()` 的那个 effect
 * 和"要不要跳转"的 effect 若在**同一次**渲染里都读同一份（尚未更新的）
 * `isRestoring` 闭包值，会在 `restoreSession()` 的响应回来之前就以为
 * "没在 restoring、也没登录" 而立刻跳转——这个挂载甚至还没真的问过 BFF。
 * `hasBeenRestoringRef` 只在**观察到** `isRestoring === true` 之后才置真，
 * 天然要求至少经过一次真实的重渲染，跳转因此不可能抢在第一次 `restoreSession`
 * 落地之前发生。
 *
 * ## 502 / 网络失败为什么不跳转
 *
 * 那种情况下 `isAuthenticated` 还是初始值 `false`（没人动过它），但 `error`
 * 非空——"问不到" 不等于 "问到了说没登录"。后端挂了不该把还在线的用户踢去
 * 登录页，这里靠 `!error` 这个条件把两者分开。
 *
 * ## I3 / M2：502 / 网络失败不是无限转圈
 *
 * 不跳转不等于什么都不做——`error` 非空、且不在 restoring、也还没登录时，
 * 渲染一个带错误文案和「重试」按钮的状态，替掉 `<SimpleLoading />`。按钮直接
 * 调 `restoreSession()`：`isRestoring` 会重新变真、`error` 被清空，界面回到
 * loading，成功或失败后再落回对应分支——不是一个独立的状态机，只是重新走一遍
 * 挂载时那条路径。
 *
 * `useRouter()` 的引用稳定性见 `lib/navigation.ts`（`be14018` 修的那个无限
 * 循环）——这里把 `router` 放进依赖数组是安全的，不需要绕开它。
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isRestoring = useAuthStore((state) => state.isRestoring)
  const error = useAuthStore((state) => state.error)
  const restoreSession = useAuthStore((state) => state.restoreSession)

  const attemptedRef = useRef(false)
  const hasBeenRestoringRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated && !isRestoring && !attemptedRef.current) {
      attemptedRef.current = true
      void restoreSession()
    }
  }, [isAuthenticated, isRestoring, restoreSession])

  useEffect(() => {
    if (isRestoring) {
      hasBeenRestoringRef.current = true
    }
  }, [isRestoring])

  useEffect(() => {
    if (hasBeenRestoringRef.current && !isRestoring && !isAuthenticated && !error) {
      // 登录后回到原来要去的页面（spec §3 / §6.4：授权页链接会被未登录用户点开）。
      // 默认页本身不带 next——LoginForm 没有 next 时本来就去 DEFAULT_AUTHENTICATED_ROUTE。
      const current = `${location.pathname}${location.search}`
      const target = current === DEFAULT_AUTHENTICATED_ROUTE
        ? DEFAULT_UNAUTHENTICATED_ROUTE
        : `${DEFAULT_UNAUTHENTICATED_ROUTE}?next=${encodeURIComponent(current)}`
      router.replace(target)
    }
  }, [isAuthenticated, isRestoring, error, router, location.pathname, location.search])

  if (error && !isRestoring && !isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        <div className="text-center space-y-4 px-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => void restoreSession()}>重试</Button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <SimpleLoading />
  }

  return <div className="h-full overflow-hidden">{children}</div>
}
