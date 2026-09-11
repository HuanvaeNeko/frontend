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

const audios: Array<{ src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }> = []
class FakeAudio {
  volume = 1
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  addEventListener() {}
  constructor(public src: string) { audios.push(this) }
}
const CUSTOM = { id: 'custom-1', name: 'Ding', kind: 'custom' as const, src: null }

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
})
