import { useEffect, useRef } from 'react'
import { usePathname } from '@/lib/navigation'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import type { BackdropVariant } from './backdropScene'

const APP_ROUTE_PREFIX = '/app'

function backdropVariant(pathname: string, particleBackground: boolean): BackdropVariant | null {
  if (pathname === '/') return 'landing'
  if (pathname.startsWith(APP_ROUTE_PREFIX)) return 'app'
  return particleBackground ? 'other' : null
}

/** 水合后等浏览器空闲再加载 three：背景是装饰，不和首屏脚本、会话请求抢主线程和带宽 */
function whenIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(cb, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(cb, 200)
  return () => window.clearTimeout(id)
}

/**
 * 全局粒子背景外壳：只算「该画哪一种背景」，场景本体在 `./backdropScene` 里按需加载。
 *
 * 场景只在 variant（落地页 / 应用内 / 其他）、主题、动效开关变化时重建。以前 effect 依赖
 * 完整 pathname，应用内每切一次会话/页面就销毁并重建一次 WebGL 渲染器（重新编译着色器），
 * 实测 10 次路由切换多出 14 个长任务、约 1.5 s 主线程时间。
 */
export default function GlobalThreeBackdrop() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname() || ''
  const particleBackground = useSettingsStore((s) => s.particleBackground)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)
  const theme = useSettingsStore((s) => s.theme)

  const variant = backdropVariant(pathname, particleBackground)
  const overlayOpacity = variant === 'landing' ? 0.56 : 0.34

  useEffect(() => {
    const container = containerRef.current
    if (!container || !variant) return
    if (!window.WebGLRenderingContext) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    let cancelled = false
    let unmount: (() => void) | null = null
    const cancelIdle = whenIdle(() => {
      import('./backdropScene').then(
        ({ mountBackdrop }) => {
          if (cancelled) return
          unmount = mountBackdrop(container, { variant, isDark, enableMotion: animationsEnabled && !reduceMotion })
        },
        // 只兜 chunk 加载失败（离线、部署切换时旧 chunk 已下线）：装饰层缺席不影响任何功能。
        // 挂载本身抛的错不在这里吞，照常冒出去
        () => {},
      )
    })

    return () => {
      cancelled = true
      cancelIdle()
      unmount?.()
    }
  }, [variant, theme, animationsEnabled])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-20"
      style={{ opacity: overlayOpacity }}
    />
  )
}
