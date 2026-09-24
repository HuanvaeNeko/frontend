import { hasUploadsInFlight } from './uploadsInFlight'
import { ROUTES } from './routes'

/** 会被用户手写内容的 input 类型；checkbox / hidden / file 之类的 value 不是「写了一半的字」 */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number'])

/**
 * 页面上有没有写了一半、整页刷新就会丢的输入。
 *
 * 聊天草稿不落盘（只在输入框组件的 state 里），刷新即丢，所以直接看 DOM 最可靠：
 * 不需要每个输入组件都来登记。搜索框里有字也算——宁可多等一次时机，也不替用户清空。
 */
export function hasUnsavedInput(root: ParentNode = document): boolean {
  for (const el of root.querySelectorAll('textarea, input, [contenteditable]')) {
    if (el instanceof HTMLTextAreaElement) {
      if (el.value.trim()) return true
    } else if (el instanceof HTMLInputElement) {
      if (TEXT_INPUT_TYPES.has(el.type) && el.value.trim()) return true
    } else if (el.getAttribute('contenteditable') !== 'false' && el.textContent?.trim()) {
      return true
    }
  }
  return false
}

/**
 * 现在整页刷新会不会打断用户。以下任一成立都要推迟到下一次时机：
 * - 在视频会议里：刷新 = 挂断通话；
 * - 有文件在上传：刷新会掐断分片上传；
 * - 输入框里有没发出去的内容。
 */
export function isReloadSafe(pathname: string): boolean {
  if (pathname.startsWith(ROUTES.app.videoMeeting)) return false
  if (hasUploadsInFlight()) return false
  return !hasUnsavedInput()
}

/**
 * 当前页面属于哪次构建：React Router 路由清单的 version（`@react-router/dev` 每次构建
 * 生成，清单文件就叫 `assets/manifest-<version>.js`）。sw.ts 的 GET_VERSION 从自己的
 * 预缓存清单里解析出同一个值，两边相等 ⇔ 页面与该 SW 来自同一次构建。
 *
 * `__reactRouterManifest` 是 React Router 水合时读的全局变量，不是公开 API；读不到就
 * 返回 null，调用方按「版本不同」保守处理（照常找时机刷新），不会因此出错。
 */
export function pageBuildVersion(): string | null {
  const manifest = (window as { __reactRouterManifest?: { version?: unknown } }).__reactRouterManifest
  return typeof manifest?.version === 'string' ? manifest.version : null
}

/** 问某个 SW 它属于哪次构建（sw.ts 的 GET_VERSION）；超时或答非所问返回 null */
export function workerBuildVersion(worker: ServiceWorker, timeoutMs = 1000): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const finish = (version: string | null) => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(version)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    channel.port1.onmessage = (event: MessageEvent<{ version?: unknown }>) => {
      finish(typeof event.data?.version === 'string' ? event.data.version : null)
    }
    worker.postMessage({ type: 'GET_VERSION' }, [channel.port2])
  })
}

interface ApplyUpdateOptions {
  container?: ServiceWorkerContainer
  reload?: () => void
  /** 新 SW 迟迟不接管时最多等多久再刷新 */
  timeoutMs?: number
}

/**
 * 应用已下载好的新版本：让等待中的新 SW 立即激活，等它真正接管后整页刷新。
 *
 * 必须等 `controllerchange` 再刷新：新 SW 还没接管就刷新，这次导航仍由旧 SW 处理，
 * 页面拿到的还是旧版本（旧实现用固定 500 ms 赌这个时间差）。超时兜底是为了在
 * 新 SW 激活出错时不让页面永远停在「更新中」——刷新后浏览器会自己再走一遍激活。
 *
 * 没有等待中的 SW 时（新版本已被另一个标签页激活）直接刷新即可。
 */
export async function applyUpdate(
  registration: ServiceWorkerRegistration | null,
  { container = navigator.serviceWorker, reload = () => window.location.reload(), timeoutMs = 3000 }: ApplyUpdateOptions = {},
): Promise<void> {
  const waiting = registration?.waiting
  if (waiting) {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        container.removeEventListener('controllerchange', done)
        resolve()
      }
      const timer = setTimeout(done, timeoutMs)
      container.addEventListener('controllerchange', done)
      waiting.postMessage({ type: 'SKIP_WAITING' })
    })
  }
  reload()
}
