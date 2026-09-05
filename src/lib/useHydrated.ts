import { useSyncExternalStore } from 'react'

function subscribe() {
  return () => {}
}

/**
 * 水合守卫：服务端与首次客户端渲染返回 false，水合完成后返回 true。
 * 用 useSyncExternalStore 保证 SSR 与 hydration 的首帧一致，避免 mismatch。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,   // 客户端快照
    () => false,  // 服务端快照
  )
}
