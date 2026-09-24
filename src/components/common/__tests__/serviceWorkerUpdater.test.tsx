import { act, render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyUpdate } from '@/lib/swUpdate'
import { hasUploadsInFlight } from '@/lib/uploadsInFlight'
import ServiceWorkerUpdater from '../ServiceWorkerUpdater'

// applyUpdate 自己的时序（SKIP_WAITING → 等 controllerchange → reload）在
// lib/__tests__/swUpdate.test.ts 里测；这里只关心「什么时候去调它」。
vi.mock('@/lib/swUpdate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/swUpdate')>()),
  applyUpdate: vi.fn(async () => {}),
}))
vi.mock('@/lib/uploadsInFlight', () => ({ hasUploadsInFlight: vi.fn(() => false) }))

type FakeWorker = EventTarget & { state: string; postMessage: ReturnType<typeof vi.fn> }
type FakeRegistration = EventTarget & {
  waiting: FakeWorker | null
  installing: FakeWorker | null
  update: () => Promise<void>
}

/** 当前页面所属的构建（部署前打开的页面） */
const PAGE_VERSION = 'build-old'
/** 部署后的新构建 */
const NEW_VERSION = 'build-new'

/** 像 sw.ts 那样回答 GET_VERSION；version 为 undefined 表示不回答（旧版 SW / 卡住） */
function fakeWorker(version: string | undefined, state = 'installed'): FakeWorker {
  const postMessage = vi.fn((message: { type: string }, ports?: MessagePort[]) => {
    if (message.type === 'GET_VERSION' && version !== undefined) ports?.[0]?.postMessage({ version })
  })
  return Object.assign(new EventTarget(), { state, postMessage })
}

let container: EventTarget & { controller: FakeWorker | null; register: ReturnType<typeof vi.fn> }
let registration: FakeRegistration
let visibility: DocumentVisibilityState

function setup({ controlled = true, waiting }: { controlled?: boolean; waiting?: string } = {}) {
  registration = Object.assign(new EventTarget(), {
    waiting: waiting ? fakeWorker(waiting) : null,
    installing: null,
    update: vi.fn(async () => {}),
  })
  container = Object.assign(new EventTarget(), {
    controller: controlled ? fakeWorker(PAGE_VERSION, 'activated') : null,
    register: vi.fn(async () => registration),
  })
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
}

async function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '*', element: <ServiceWorkerUpdater /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  await vi.waitFor(() => expect(container.register).toHaveBeenCalled())
  await settle()
  return router
}

/** 等 MessageChannel 上的版本问答走完（消息投递是异步的） */
function settle() {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
}

/** 模拟浏览器装好了新版本 SW：updatefound → installing → installed，并等版本问答结束 */
async function installNewVersion(version: string | undefined = NEW_VERSION) {
  const worker = fakeWorker(version, 'installing')
  registration.installing = worker
  registration.dispatchEvent(new Event('updatefound'))
  worker.state = 'installed'
  registration.installing = null
  registration.waiting = worker
  worker.dispatchEvent(new Event('statechange'))
  await settle()
  return worker
}

function setVisibility(state: DocumentVisibilityState) {
  visibility = state
  document.dispatchEvent(new Event('visibilitychange'))
}

const skipWaitingSent = (worker: FakeWorker) =>
  worker.postMessage.mock.calls.some(([message]) => (message as { type: string }).type === 'SKIP_WAITING')

beforeEach(() => {
  vi.stubEnv('DEV', false)
  Object.assign(window, { __reactRouterManifest: { version: PAGE_VERSION } })
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  vi.mocked(applyUpdate).mockClear()
  vi.mocked(hasUploadsInFlight).mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

describe('ServiceWorkerUpdater：页面本身就是新构建（部署后才打开）', () => {
  it('新 SW 直接接管，不刷新——页面 HTML 本来就是从网络拿的新版本，刷新只是白加载一次', async () => {
    Object.assign(window, { __reactRouterManifest: { version: NEW_VERSION } })
    setup()
    const router = await renderAt('/app/chat')
    const worker = await installNewVersion(NEW_VERSION)

    expect(skipWaitingSent(worker)).toBe(true)
    await act(() => router.navigate('/app/contacts'))
    setVisibility('hidden')
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('上次留下的 waiting SW 与页面同版本：同样直接接管、不刷新', async () => {
    Object.assign(window, { __reactRouterManifest: { version: NEW_VERSION } })
    setup({ waiting: NEW_VERSION })
    const router = await renderAt('/app/chat')

    expect(skipWaitingSent(registration.waiting as FakeWorker)).toBe(true)
    await act(() => router.navigate('/app/contacts'))
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('另一个标签页激活的新 SW 与本页同版本：本页不需要刷新', async () => {
    Object.assign(window, { __reactRouterManifest: { version: NEW_VERSION } })
    setup()
    const router = await renderAt('/app/chat')

    container.controller = fakeWorker(NEW_VERSION, 'activated')
    container.dispatchEvent(new Event('controllerchange'))
    await settle()
    await act(() => router.navigate('/app/contacts'))

    expect(applyUpdate).not.toHaveBeenCalled()
  })
})

describe('ServiceWorkerUpdater：页面是部署前打开的旧构建', () => {
  it('注册 /sw.js，且不让 HTTP 缓存挡住 sw.js 本身的更新', async () => {
    setup()
    await renderAt('/app/chat')
    expect(container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
  })

  it('新版本装好后不倒计时自动刷新，也不在用户操作中途让新 SW 接管', async () => {
    setup()
    await renderAt('/app/chat')
    const worker = await installNewVersion()
    // 旧实现是 3 秒倒计时后强制刷新；再等一段确认没有任何定时触发
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 200)))

    expect(applyUpdate).not.toHaveBeenCalled()
    // 旧页面还要靠旧 SW 的预缓存懒加载旧 chunk，不能提前让新 SW 接管
    expect(skipWaitingSent(worker)).toBe(false)
  })

  it('下一次站内跳转时应用更新', async () => {
    setup()
    const router = await renderAt('/app/chat')
    await installNewVersion()

    await act(() => router.navigate('/app/contacts'))

    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(vi.mocked(applyUpdate).mock.calls[0][0]).toBe(registration)
  })

  it('标签页切到后台时应用更新', async () => {
    setup()
    await renderAt('/app/chat')
    await installNewVersion()

    setVisibility('hidden')

    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('没有新版本时跳转、切后台都什么不做', async () => {
    setup()
    const router = await renderAt('/app/chat')

    await act(() => router.navigate('/app/contacts'))
    setVisibility('hidden')

    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('新 SW 不回答版本号：按「版本不同」处理，宁可多刷一次也不留旧页面', async () => {
    setup()
    const router = await renderAt('/app/chat')
    const worker = await installNewVersion(undefined)
    // 等过 GET_VERSION 的超时
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 1100)))

    expect(skipWaitingSent(worker)).toBe(false)
    await act(() => router.navigate('/app/contacts'))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('输入框里有没发出去的内容：跳转、切后台都不刷新；清空后下一次时机再应用', async () => {
    setup()
    const router = await renderAt('/app/chat')
    await installNewVersion()
    const draft = document.createElement('textarea')
    draft.value = '写到一半的消息'
    document.body.appendChild(draft)

    await act(() => router.navigate('/app/contacts'))
    setVisibility('hidden')
    expect(applyUpdate).not.toHaveBeenCalled()

    // 更新并没有被丢掉，只是推迟
    draft.value = ''
    setVisibility('visible')
    setVisibility('hidden')
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('视频会议中切到后台（比如去共享别的窗口）绝不刷新', async () => {
    setup()
    const router = await renderAt('/app/meeting')
    await installNewVersion()

    await act(() => router.navigate('/app/video-meeting?room=r1'))
    setVisibility('hidden')

    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('有上传在进行时不刷新', async () => {
    setup()
    const router = await renderAt('/app/chat')
    await installNewVersion()
    vi.mocked(hasUploadsInFlight).mockReturnValue(true)

    await act(() => router.navigate('/app/contacts'))

    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('上次留下的 waiting SW 是新版本：按时机应用', async () => {
    setup({ waiting: NEW_VERSION })
    const router = await renderAt('/app/chat')

    await act(() => router.navigate('/app/contacts'))

    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('别的标签页激活了新版本（本页的控制者被换掉）：本页也要在下一次时机刷新', async () => {
    // 新 SW 激活时会清掉旧版本的预缓存，本页之后再懒加载旧哈希的 chunk 会 404
    setup()
    const router = await renderAt('/app/chat')

    container.controller = fakeWorker(NEW_VERSION, 'activated')
    container.dispatchEvent(new Event('controllerchange'))
    await settle()
    await act(() => router.navigate('/app/contacts'))

    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('ServiceWorkerUpdater：其他情形', () => {
  it('首次访问（页面原本不受 SW 控制）装好 SW 不算「有更新」', async () => {
    setup({ controlled: false })
    const router = await renderAt('/app/chat')
    await installNewVersion()

    await act(() => router.navigate('/app/contacts'))

    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it('开发环境只注销残留 SW，不注册', async () => {
    vi.stubEnv('DEV', true)
    setup()
    const unregister = vi.fn(async () => true)
    Object.assign(container, { getRegistrations: vi.fn(async () => [{ unregister }]) })
    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <ServiceWorkerUpdater /> }])} />)

    await vi.waitFor(() => expect(unregister).toHaveBeenCalled())
    expect(container.register).not.toHaveBeenCalled()
  })
})
