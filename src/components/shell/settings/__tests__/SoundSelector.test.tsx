import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { SoundSelector } from '../SoundSelector'

const lib = vi.hoisted(() => ({
  listCustom: vi.fn(), saveCustom: vi.fn(), deleteCustom: vi.fn(), resolveSoundSrc: vi.fn(), isIndexedDbAvailable: vi.fn(() => true),
}))
vi.mock('@/features/settings/sounds/soundLibrary', async () => {
  const actual = await vi.importActual<typeof import('@/features/settings/sounds/soundLibrary')>('@/features/settings/sounds/soundLibrary')
  return { ...actual, ...lib }
})
const sound = vi.hoisted(() => ({ playSound: vi.fn() }))
vi.mock('@/hooks/useSound', () => ({ playSound: sound.playSound }))
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const audios: Array<{ src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = []
class FakeAudio {
  volume = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  addEventListener(type: string, cb: () => void) { if (type === 'ended') this.onended = cb; if (type === 'error') this.onerror = cb }
  constructor(public src: string) { audios.push(this) }
}
const CUSTOM = { id: 'custom-1', name: 'Ding', kind: 'custom' as const, src: null }

/** 可手动控制何时 resolve 的 promise：用来模拟"卸载/切换发生在 resolveSoundSrc 还没回来之前"的时序。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  audios.length = 0
  sound.playSound.mockClear()
  lib.isIndexedDbAvailable.mockReturnValue(true)
  lib.listCustom.mockResolvedValue([CUSTOM])
  lib.resolveSoundSrc.mockImplementation(async (id: string) => (id === 'water' ? { src: '/sounds/water.mp3', revoke: () => {} } : id === 'custom-1' ? { src: 'blob:ding', revoke: () => {} } : null))
  lib.saveCustom.mockResolvedValue({ id: 'custom-2', name: 'Dong', kind: 'custom', src: null })
  lib.deleteCustom.mockResolvedValue(undefined)
  vi.stubGlobal('Audio', FakeAudio)
  useSettingsStore.setState({ notificationSound: 'water', soundVolume: 0.5 })
})
afterEach(() => vi.unstubAllGlobals())

describe('SoundSelector', () => {
  it('列出内置两项 + 自定义；当前选中 water', async () => {
    render(<SoundSelector />)
    expect(await screen.findByRole('radio', { name: 'Ding' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '水滴（内置）' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '经典（合成音）' })).not.toBeChecked()
  })
  it('选中即写 store 并试听（文件用 Audio；classic 用合成音）', async () => {
    render(<SoundSelector />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Ding' }))
    expect(useSettingsStore.getState().notificationSound).toBe('custom-1')
    await waitFor(() => expect(audios.map((a) => a.src)).toEqual(['blob:ding']))
    fireEvent.click(screen.getByRole('radio', { name: '经典（合成音）' }))
    expect(useSettingsStore.getState().notificationSound).toBe('classic')
    expect(sound.playSound).toHaveBeenCalledWith('message')
  })
  it('试听按钮播放 ⇄ 停止', async () => {
    render(<SoundSelector />)
    await screen.findByRole('radio', { name: 'Ding' })
    fireEvent.click(screen.getAllByRole('button', { name: '试听' })[0])
    await waitFor(() => expect(audios).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: '停止' }))
    expect(audios[0].pause).toHaveBeenCalled()
  })
  it('上传：saveCustom 收到文件，新项出现并被选中；类型错误显示文案', async () => {
    render(<SoundSelector />)
    await screen.findByRole('radio', { name: 'Ding' })
    const input = screen.getByLabelText('上传自定义提示音') as HTMLInputElement
    expect(input.accept).toBe('audio/mpeg')
    const file = new File([new Uint8Array(10)], 'Dong.mp3', { type: 'audio/mpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(lib.saveCustom).toHaveBeenCalledWith(file))
    expect(await screen.findByRole('radio', { name: 'Dong' })).toBeChecked()
    expect(useSettingsStore.getState().notificationSound).toBe('custom-2')
    const { SoundLibraryError } = await vi.importActual<typeof import('@/features/settings/sounds/soundLibrary')>('@/features/settings/sounds/soundLibrary')
    lib.saveCustom.mockRejectedValueOnce(new SoundLibraryError('type', 'x'))
    fireEvent.change(input, { target: { files: [new File([''], 'a.wav', { type: 'audio/wav' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('只支持 MP3（audio/mpeg）')
  })
  it('删除自定义两步确认；删掉的是选中项时回到 water', async () => {
    useSettingsStore.setState({ notificationSound: 'custom-1' })
    render(<SoundSelector />)
    await screen.findByRole('radio', { name: 'Ding' })
    expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(lib.deleteCustom).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(lib.deleteCustom).toHaveBeenCalledWith('custom-1'))
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Ding' })).toBeNull())
    expect(useSettingsStore.getState().notificationSound).toBe('water')
  })
  it('IndexedDB 不可用：隐藏上传按钮、显示提示，内置项照常', async () => {
    lib.isIndexedDbAvailable.mockReturnValue(false)
    lib.listCustom.mockResolvedValue([])
    render(<SoundSelector />)
    expect(await screen.findByRole('radio', { name: '水滴（内置）' })).toBeInTheDocument()
    expect(screen.queryByLabelText('上传自定义提示音')).toBeNull()
    expect(screen.getByText(/当前浏览器无法保存自定义提示音/)).toBeInTheDocument()
  })
  it('组件卸载后 resolveSoundSrc 才回来：不构造 Audio，且 revoke 照样被调用（不泄漏 blob）', async () => {
    const revoke = vi.fn()
    const gate = deferred<{ src: string; revoke: () => void } | null>()
    lib.resolveSoundSrc.mockImplementation((id: string) => (id === 'custom-1' ? gate.promise : Promise.resolve(null)))
    const { unmount } = render(<SoundSelector />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Ding' }))
    unmount()
    gate.resolve({ src: 'blob:ding', revoke })
    await waitFor(() => expect(revoke).toHaveBeenCalledTimes(1))
    expect(audios).toHaveLength(0)
  })
  it('快速切换试听目标：先选的一个在解析回来后被丢弃并 revoke，后选的一个正常构造并播放', async () => {
    const revokeWater = vi.fn()
    const revokeDing = vi.fn()
    const gateWater = deferred<{ src: string; revoke: () => void } | null>()
    const gateDing = deferred<{ src: string; revoke: () => void } | null>()
    lib.resolveSoundSrc.mockImplementation((id: string) => {
      if (id === 'water') return gateWater.promise
      if (id === 'custom-1') return gateDing.promise
      return Promise.resolve(null)
    })
    // 默认选中就是 water（见 beforeEach）：点一个已经选中的 radio 不会触发
    // onChange（没有实际状态变化），所以这里先改成 classic，好让接下来点水滴
    // 是一次真正的变更、真正会调用一次 preview('water')。
    useSettingsStore.setState({ notificationSound: 'classic' })
    render(<SoundSelector />)
    // 水滴、经典这两个内置项跟自定义列表一样，都挡在同一个"custom !== null"的挂载
    // 拉取之后才渲染（组件把整张列表一起收在 ListLoading 后面），所以要先等 Ding
    // 出现（代表列表已经加载完）,水滴才会同一时刻出现在 DOM 里,不能反过来先同步找水滴。
    await screen.findByRole('radio', { name: 'Ding' })
    fireEvent.click(screen.getByRole('radio', { name: '水滴（内置）' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ding' }))
    gateWater.resolve({ src: '/sounds/water.mp3', revoke: revokeWater })
    gateDing.resolve({ src: 'blob:ding', revoke: revokeDing })
    await waitFor(() => expect(revokeWater).toHaveBeenCalledTimes(1))
    expect(audios).toHaveLength(1)
    expect(audios[0].src).toBe('blob:ding')
    expect(revokeDing).not.toHaveBeenCalled()
  })
  it('正常播放结束仍会 revoke（正对照：过期保护没有把正常路径一起挡住）', async () => {
    const revoke = vi.fn()
    lib.resolveSoundSrc.mockImplementation(async (id: string) => (id === 'custom-1' ? { src: 'blob:ding', revoke } : null))
    render(<SoundSelector />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Ding' }))
    await waitFor(() => expect(audios).toHaveLength(1))
    expect(revoke).not.toHaveBeenCalled()
    audios[0].onended?.()
    expect(revoke).toHaveBeenCalledTimes(1)
  })
  it('listCustom 失败：非 SoundLibraryError 的错误按 loadFailed 译文展示，不泄漏原始 message', async () => {
    lib.listCustom.mockRejectedValue(new Error('quota exceeded on native IDB'))
    render(<SoundSelector />)
    expect(await screen.findByRole('alert')).toHaveTextContent('提示音列表加载失败')
    expect(screen.queryByText(/quota exceeded/)).toBeNull()
  })
})
