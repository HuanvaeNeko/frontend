import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveSoundSrc } = vi.hoisted(() => ({ resolveSoundSrc: vi.fn() }))
vi.mock('@/features/settings/sounds/soundLibrary', () => ({ resolveSoundSrc }))

/** 可观测的 Audio / AudioContext 桩：Audio 记录 src 与 play；AudioContext 记录振荡器数量（= 合成音走了） */
const audios: Array<{ src: string; volume: number; play: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = []
let oscillators = 0
let playRejects = false
class FakeAudio {
  volume = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(() => (playRejects ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()))
  constructor(public src: string) { audios.push(this) }
  addEventListener(type: string, cb: () => void) { if (type === 'ended') this.onended = cb; if (type === 'error') this.onerror = cb }
}
class FakeAudioContext {
  currentTime = 0
  state = 'running'
  destination = {}
  resume() {}
  createOscillator() { oscillators += 1; return { type: 'sine', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} } }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} } }
}

beforeEach(() => {
  audios.length = 0
  oscillators = 0
  playRejects = false
  resolveSoundSrc.mockReset()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('SoundManager 的提示音选择', () => {
  it('notificationSound=water：playMessage 走文件（Audio(/sounds/water.mp3) + 音量 = 主音量），不走合成音', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled, setSoundVolume } = await import('../useSound')
    setSoundEnabled(true)
    setSoundVolume(0.3)
    setNotificationSound('water')
    resolveSoundSrc.mockResolvedValue({ src: '/sounds/water.mp3', revoke: vi.fn() })
    playMessage()
    await flush()
    expect(resolveSoundSrc).toHaveBeenCalledWith('water')
    expect(audios.map((a) => a.src)).toEqual(['/sounds/water.mp3'])
    expect(audios[0].volume).toBeCloseTo(0.3)
    expect(audios[0].play).toHaveBeenCalledTimes(1)
    expect(oscillators).toBe(0)
  })
  it('notificationSound=classic：走合成音（message 配置两段音 → 两个振荡器），不建 Audio（正对照）', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    setNotificationSound('classic')
    playMessage()
    await flush()
    expect(resolveSoundSrc).not.toHaveBeenCalled()
    expect(audios).toHaveLength(0)
    expect(oscillators).toBe(2)
  })
  it('文件播放失败（play reject）回退合成音；resolve 给 null（自定义音被删）也回退', async () => {
    const { playNotification, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    setNotificationSound('custom-x')
    resolveSoundSrc.mockResolvedValue({ src: 'blob:x', revoke: vi.fn() })
    playRejects = true
    playNotification()
    await flush()
    expect(audios).toHaveLength(1)
    expect(oscillators).toBe(2)
    resolveSoundSrc.mockResolvedValue(null)
    playNotification()
    await flush()
    expect(oscillators).toBe(4)
  })
  it('播放结束调 revoke（blob URL 不泄漏）', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    setNotificationSound('custom-x')
    const revoke = vi.fn()
    resolveSoundSrc.mockResolvedValue({ src: 'blob:x', revoke })
    playMessage()
    await flush()
    expect(revoke).not.toHaveBeenCalled()
    audios[0].onended?.()
    expect(revoke).toHaveBeenCalledTimes(1)
  })
  it('静音时既不建 Audio 也不合成', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(false)
    setNotificationSound('water')
    playMessage()
    await flush()
    expect(resolveSoundSrc).not.toHaveBeenCalled()
    expect(audios).toHaveLength(0)
    expect(oscillators).toBe(0)
  })
  it('playFile 直接调用：成功 true，失败 false', async () => {
    const { playFile, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    expect(await playFile('/sounds/water.mp3')).toBe(true)
    playRejects = true
    expect(await playFile('/sounds/water.mp3')).toBe(false)
  })
})
