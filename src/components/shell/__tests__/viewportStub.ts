import { vi } from 'vitest'

/** 可控的 matchMedia：按 `min-width` 数字和给定视口宽比较，并记录 change 监听器以便触发 */
export function stubViewport(initialWidth: number) {
  let width = initialWidth
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    return {
      get matches() { return width >= min },
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => { listeners.add(cb) },
      removeEventListener: (_: string, cb: () => void) => { listeners.delete(cb) },
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList
  })
  return { resize(next: number) { width = next; for (const cb of listeners) cb() } }
}
