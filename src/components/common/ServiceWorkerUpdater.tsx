import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from '@/lib/navigation'
import { applyUpdate, isReloadSafe, pageBuildVersion, workerBuildVersion } from '@/lib/swUpdate'

interface ServiceWorkerUpdaterProps {
  /** 长时间打开的页面多久检查一次 sw.js 是否有新版本（毫秒） */
  checkInterval?: number
}

/**
 * 注册 Service Worker，并在部署后**找合适的时机静默更新**。
 *
 * 旧实现（UpdatePrompt）在新版本装好后弹卡片、3 秒倒计时强制整页刷新：实测部署后
 * 打开页面约 16–20 秒就会被刷一次，常常正好在用户打字的时候，输入直接丢失。
 *
 * 现在先比构建版本：页面本身就是新构建（部署后才打开的，占绝大多数）时，新 SW 直接
 * 接管、完全不刷新。只有部署前就打开着的旧页面才记一个「待更新」，等到下面两个时机
 * 之一、且 {@link isReloadSafe} 通过时才刷新：
 * 1. 下一次站内跳转——用户本来就在换页面，顺手换成整页加载；
 * 2. 标签页切到后台——用户看不见，回来时已经是新版本。
 * 不安全（视频会议中 / 有上传 / 有没发出去的输入）就继续等下一次。
 *
 * 推迟是安全的：新 SW 在 waiting 期间，旧 SW 连同它的预缓存都还在，本页之后懒加载的
 * 旧哈希 chunk 仍然能从旧预缓存取到。
 */
export default function ServiceWorkerUpdater({ checkInterval = 60_000 }: ServiceWorkerUpdaterProps) {
  const pathname = usePathname()
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const pendingRef = useRef(false)
  const applyingRef = useRef(false)

  // 当前路由路径：由下面的跳转 effect 维护，tryApply 只读它
  const pathnameRef = useRef(pathname)

  // 只读 ref，没有需要跟随渲染更新的依赖
  const tryApply = useCallback(() => {
    if (!pendingRef.current || applyingRef.current) return
    if (!isReloadSafe(pathnameRef.current)) return
    applyingRef.current = true
    void applyUpdate(registrationRef.current)
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker

    if (import.meta.env.DEV) {
      void sw.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister()
      })
      return
    }

    let cancelled = false
    const cleanups: Array<() => void> = []
    const markPending = () => {
      pendingRef.current = true
    }
    /** 这个 SW 与本页是否来自同一次构建；问不到版本号时一律按「不是」处理 */
    const sameBuildAsPage = async (worker: ServiceWorker) => {
      const mine = pageBuildVersion()
      return mine !== null && (await workerBuildVersion(worker)) === mine
    }

    // 新 SW 装好了（本次检测到的，或上次留下的 waiting）。
    // 导航请求在 sw.ts 里是 NetworkOnly，部署后才打开的页面 HTML 本来就是新构建：
    // 新旧只差在 SW 和它的预缓存，直接让新 SW 接管即可，刷新只会白加载一次。
    // 只有部署前就打开着的页面（跑的是旧代码）才需要找时机刷新。
    const onNewWorkerInstalled = async (worker: ServiceWorker) => {
      if (await sameBuildAsPage(worker)) {
        if (!cancelled) worker.postMessage({ type: 'SKIP_WAITING' })
        return
      }
      if (!cancelled) markPending()
    }

    // 控制本页的 SW 被换掉了（别的标签页激活了新版本，或上面的静默接管）。
    // 若新 SW 不是本页的构建，旧预缓存已随它激活被清空，之后再懒加载旧哈希的 chunk
    // 会 404——本页也要尽快（在安全时机）刷新。
    // 首次访问时页面原本不受控，sw.ts 也没有 clients.claim()，不会走到这里。
    const wasControlled = !!sw.controller
    const onControllerChange = async () => {
      if (!wasControlled) return
      const controller = sw.controller
      if (controller && (await sameBuildAsPage(controller))) return
      if (!cancelled) markPending()
    }
    sw.addEventListener('controllerchange', onControllerChange)
    cleanups.push(() => sw.removeEventListener('controllerchange', onControllerChange))

    void sw
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        if (cancelled) return
        registrationRef.current = registration

        // 上次留下的新版本（装好了但当时还有别的标签页开着，没能激活）
        if (registration.waiting && sw.controller) void onNewWorkerInstalled(registration.waiting)

        const onUpdateFound = () => {
          const worker = registration.installing
          if (!worker) return
          const onStateChange = () => {
            // 有 controller 才是「更新」；首次安装时页面不受控，不算
            if (worker.state === 'installed' && sw.controller) void onNewWorkerInstalled(worker)
          }
          worker.addEventListener('statechange', onStateChange)
          cleanups.push(() => worker.removeEventListener('statechange', onStateChange))
        }
        registration.addEventListener('updatefound', onUpdateFound)
        cleanups.push(() => registration.removeEventListener('updatefound', onUpdateFound))
      })
      .catch((error: unknown) => console.error('Service Worker 注册失败:', error))

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') tryApply()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange))

    const timer = window.setInterval(() => {
      registrationRef.current?.update().catch(() => {
        // 离线或服务端短暂不可用：下一轮再查
      })
    }, checkInterval)
    cleanups.push(() => window.clearInterval(timer))

    return () => {
      cancelled = true
      for (const cleanup of cleanups) cleanup()
    }
  }, [checkInterval, tryApply])

  // 站内跳转：首次渲染不算，只有路径真的变了才是「用户在换页面」
  useEffect(() => {
    if (pathname === pathnameRef.current) return
    pathnameRef.current = pathname
    tryApply()
  }, [pathname, tryApply])

  return null
}
