import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { useHydrated } from './useHydrated'

interface DynamicOptions {
  /** 加载期间的占位内容，等价于 next/dynamic 的 loading 选项。 */
  loading?: () => ReactNode
}

/**
 * 懒加载适配层，等价于 next/dynamic(loader, { ssr: false })。
 *
 * 全仓库 13 处 dynamic 调用都是 ssr: false，所以此处统一用水合守卫
 * 在服务端与首次客户端渲染时返回占位，避免 hydration mismatch。
 */
export function dynamic<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const Lazy = lazy(loader)
  const fallback = options.loading ? options.loading() : null

  return function DynamicComponent(props: P) {
    const hydrated = useHydrated()
    if (!hydrated) return <>{fallback}</>
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    )
  }
}
