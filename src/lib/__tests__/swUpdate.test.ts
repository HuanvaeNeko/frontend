import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasUploadsInFlight } from '@/lib/uploadsInFlight'
import { applyUpdate, hasUnsavedInput, isReloadSafe } from '../swUpdate'

vi.mock('@/lib/uploadsInFlight', () => ({ hasUploadsInFlight: vi.fn(() => false) }))

/** 往页面里放一个已经写了内容的输入元素 */
function field<K extends 'textarea' | 'input'>(tag: K, value: string, type?: string) {
  const el = document.createElement(tag)
  if (type) el.setAttribute('type', type)
  el.value = value
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('hasUnsavedInput', () => {
  it('空页面、空输入框 ⇒ 没有', () => {
    document.body.innerHTML = '<textarea></textarea><input type="text" value="">'
    expect(hasUnsavedInput()).toBe(false)
  })

  it('聊天输入框里写了一半的消息 ⇒ 有（刷新会丢）', () => {
    field('textarea', '写到一半的消息')
    expect(hasUnsavedInput()).toBe(true)
  })

  it('文本类 input 里有内容 ⇒ 有（登录页的账号、搜索框都算）', () => {
    field('input', 'secret', 'password')
    expect(hasUnsavedInput()).toBe(true)
  })

  it('只有空白字符不算', () => {
    field('textarea', '  \n ')
    expect(hasUnsavedInput()).toBe(false)
  })

  it('复选框、隐藏域这类「有 value 但不是用户写的字」不算', () => {
    document.body.innerHTML = '<input type="checkbox" value="on" checked><input type="hidden" value="csrf">'
    expect(hasUnsavedInput()).toBe(false)
  })

  it('contenteditable 里有文字 ⇒ 有', () => {
    document.body.innerHTML = '<div contenteditable="true">草稿</div>'
    // happy-dom 未必实现 isContentEditable 的计算，这里只认属性本身
    expect(hasUnsavedInput()).toBe(true)
  })
})

describe('isReloadSafe', () => {
  beforeEach(() => {
    vi.mocked(hasUploadsInFlight).mockReturnValue(false)
  })

  it('普通页面、无上传、无草稿 ⇒ 可以刷新', () => {
    expect(isReloadSafe('/app/chat')).toBe(true)
  })

  it('视频会议中绝不刷新——会把通话直接挂断', () => {
    expect(isReloadSafe('/app/video-meeting')).toBe(false)
  })

  it('有上传在进行 ⇒ 不刷新', () => {
    vi.mocked(hasUploadsInFlight).mockReturnValue(true)
    expect(isReloadSafe('/app/chat')).toBe(false)
  })

  it('有没发出去的输入 ⇒ 不刷新', () => {
    field('textarea', 'hi')
    expect(isReloadSafe('/app/chat')).toBe(false)
  })
})

describe('applyUpdate', () => {
  function fakeContainer() {
    const target = new EventTarget()
    return Object.assign(target, { controller: {} }) as unknown as ServiceWorkerContainer
  }

  it('有等待中的新 SW：先让它 SKIP_WAITING，等它真正接管（controllerchange）后才刷新', async () => {
    const container = fakeContainer()
    const postMessage = vi.fn()
    const reload = vi.fn()
    const registration = { waiting: { postMessage } } as unknown as ServiceWorkerRegistration

    const done = applyUpdate(registration, { container, reload, timeoutMs: 60_000 })
    await Promise.resolve()
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    // 新 SW 还没接管就刷新，会被旧 SW 再服务一次旧 HTML——这正是要避免的
    expect(reload).not.toHaveBeenCalled()

    container.dispatchEvent(new Event('controllerchange'))
    await done
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('新 SW 迟迟不接管：超时后照样刷新，不让页面卡在「更新中」', async () => {
    vi.useFakeTimers()
    try {
      const reload = vi.fn()
      const registration = { waiting: { postMessage: vi.fn() } } as unknown as ServiceWorkerRegistration
      const done = applyUpdate(registration, { container: fakeContainer(), reload, timeoutMs: 3000 })
      await vi.advanceTimersByTimeAsync(2999)
      expect(reload).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await done
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('没有等待中的 SW（新版本已被别的标签页激活）：直接刷新', async () => {
    const reload = vi.fn()
    await applyUpdate({ waiting: null } as unknown as ServiceWorkerRegistration, { container: fakeContainer(), reload })
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
