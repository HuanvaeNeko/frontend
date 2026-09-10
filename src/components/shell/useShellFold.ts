import { useSyncExternalStore } from 'react'

export type ShellFold = 'desktop' | 'tablet' | 'phone'

const DESKTOP = '(min-width: 1024px)'
const TABLET = '(min-width: 768px)'

function read(): ShellFold {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  if (window.matchMedia(DESKTOP).matches) return 'desktop'
  if (window.matchMedia(TABLET).matches) return 'tablet'
  return 'phone'
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const lists = [window.matchMedia(DESKTOP), window.matchMedia(TABLET)]
  for (const list of lists) list.addEventListener('change', onChange)
  return () => { for (const list of lists) list.removeEventListener('change', onChange) }
}

/** spec §3 的三档断点：≥1024 三栏；768–1023 侧栏 + 二选一；<768 底部条 + 二选一。SSR 快照恒为 desktop，水合后再按真实视口重渲染。 */
export function useShellFold(): ShellFold {
  return useSyncExternalStore(subscribe, read, () => 'desktop')
}
