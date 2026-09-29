import { useEffect } from 'react'
import { postLoginTarget } from '@/features/auth/lib/safeNext'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useRouter } from '@/lib/navigation'

/**
 * 已登录的人打开登录 / 注册页：直接送回应用（有合法的站内 `next` 就去 `next`）。
 * 原来只有登录页这么做；注册页照样能打开，还能以另一个身份再注册一个号。
 */
export function useRedirectIfAuthenticated(nextPath: string | null = null) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!useAuthStore.persist.hasHydrated()) return
    if (!isAuthenticated) return
    router.replace(postLoginTarget(nextPath))
  }, [isAuthenticated, nextPath, router])
}
