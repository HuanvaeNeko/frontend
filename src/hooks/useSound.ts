'use client'

/**
 * Web Audio API 音效系统
 * 提供全局音效管理，支持各种交互反馈音效
 */

// 音效类型定义
type SoundType = 
  | 'tap'           // 轻触
  | 'button'        // 按钮点击
  | 'toggle'        // 开关切换
  | 'success'       // 成功
  | 'error'         // 错误
  | 'notification'  // 通知
  | 'message'       // 新消息
  | 'send'          // 发送消息
  | 'pop'           // 弹出
  | 'slide'         // 滑动
  | 'type'          // 打字

// 音效配置
interface SoundConfig {
  frequency: number
  duration: number
  type: OscillatorType
  volume: number
  ramp?: 'linear' | 'exponential'
  secondFreq?: number  // 双音调
  delay?: number       // 延迟
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig | SoundConfig[]> = {
  tap: {
    frequency: 800,
    duration: 0.05,
    type: 'sine',
    volume: 0.15,
    ramp: 'exponential'
  },
  button: {
    frequency: 600,
    duration: 0.08,
    type: 'sine',
    volume: 0.2,
    secondFreq: 800,
  },
  toggle: [
    { frequency: 500, duration: 0.06, type: 'sine', volume: 0.15 },
    { frequency: 700, duration: 0.06, type: 'sine', volume: 0.15, delay: 0.06 }
  ],
  success: [
    { frequency: 523, duration: 0.1, type: 'sine', volume: 0.2 },
    { frequency: 659, duration: 0.1, type: 'sine', volume: 0.2, delay: 0.1 },
    { frequency: 784, duration: 0.15, type: 'sine', volume: 0.25, delay: 0.2 }
  ],
  error: {
    frequency: 200,
    duration: 0.2,
    type: 'sawtooth',
    volume: 0.15,
    ramp: 'linear'
  },
  notification: [
    { frequency: 880, duration: 0.1, type: 'sine', volume: 0.2 },
    { frequency: 1100, duration: 0.15, type: 'sine', volume: 0.2, delay: 0.12 }
  ],
  message: [
    { frequency: 700, duration: 0.08, type: 'sine', volume: 0.18 },
    { frequency: 900, duration: 0.1, type: 'sine', volume: 0.18, delay: 0.08 }
  ],
  send: {
    frequency: 600,
    duration: 0.1,
    type: 'sine',
    volume: 0.15,
    secondFreq: 900,
  },
  pop: {
    frequency: 400,
    duration: 0.08,
    type: 'sine',
    volume: 0.2,
    ramp: 'exponential'
  },
  slide: {
    frequency: 300,
    duration: 0.12,
    type: 'sine',
    volume: 0.1,
    secondFreq: 500,
  },
  type: {
    frequency: 1200,
    duration: 0.02,
    type: 'sine',
    volume: 0.08,
  }
}

class SoundManager {
  private audioContext: AudioContext | null = null
  private enabled: boolean = true
  private volume: number = 0.5  // 主音量 0-1
  private lastTypeTime: number = 0
  private typeThrottle: number = 50  // 打字音效节流 ms

  constructor() {
    if (typeof window !== 'undefined') {
      // 从 localStorage 读取设置
      const savedEnabled = localStorage.getItem('sound_enabled')
      const savedVolume = localStorage.getItem('sound_volume')
      
      if (savedEnabled !== null) {
        this.enabled = savedEnabled === 'true'
      }
      if (savedVolume !== null) {
        this.volume = parseFloat(savedVolume)
      }
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      } catch {
        console.warn('Web Audio API not supported')
        return null
      }
    }
    
    // 确保 AudioContext 处于运行状态
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
    }
    
    return this.audioContext
  }

  private playTone(config: SoundConfig, startTime: number = 0): void {
    const ctx = this.getContext()
    if (!ctx || !this.enabled) return

    const { frequency, duration, type, volume, ramp, secondFreq, delay = 0 } = config
    const actualVolume = volume * this.volume
    const time = ctx.currentTime + startTime + delay

    // 创建振荡器
    const oscillator = ctx.createOscillator()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, time)
    
    if (secondFreq) {
      // 双音调效果
      oscillator.frequency.linearRampToValueAtTime(secondFreq, time + duration)
    }

    // 创建增益节点
    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(actualVolume, time)
    
    if (ramp === 'exponential') {
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + duration)
    } else {
      gainNode.gain.linearRampToValueAtTime(0, time + duration)
    }

    // 连接节点
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // 播放
    oscillator.start(time)
    oscillator.stop(time + duration + 0.01)
  }

  play(soundType: SoundType): void {
    if (!this.enabled) return

    // 打字音效节流
    if (soundType === 'type') {
      const now = Date.now()
      if (now - this.lastTypeTime < this.typeThrottle) return
      this.lastTypeTime = now
    }

    const config = SOUND_CONFIGS[soundType]
    
    if (Array.isArray(config)) {
      config.forEach(cfg => this.playTone(cfg))
    } else {
      this.playTone(config)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (typeof window !== 'undefined') {
      localStorage.setItem('sound_enabled', String(enabled))
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume))
    if (typeof window !== 'undefined') {
      localStorage.setItem('sound_volume', String(this.volume))
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getVolume(): number {
    return this.volume
  }

  // 预热 AudioContext（需要用户交互触发）
  warmup(): void {
    const ctx = this.getContext()
    if (ctx?.state === 'suspended') {
      ctx.resume()
    }
  }
}

// 全局单例
let soundManager: SoundManager | null = null

function getSoundManager(): SoundManager {
  if (!soundManager) {
    soundManager = new SoundManager()
  }
  return soundManager
}

// 导出便捷函数
export const playSound = (type: SoundType) => getSoundManager().play(type)
export const playTap = () => getSoundManager().play('tap')
export const playButton = () => getSoundManager().play('button')
export const playToggle = () => getSoundManager().play('toggle')
export const playSuccess = () => getSoundManager().play('success')
export const playError = () => getSoundManager().play('error')
export const playNotification = () => getSoundManager().play('notification')
export const playMessage = () => getSoundManager().play('message')
export const playSend = () => getSoundManager().play('send')
export const playPop = () => getSoundManager().play('pop')
export const playSlide = () => getSoundManager().play('slide')
export const playType = () => getSoundManager().play('type')

export const setSoundEnabled = (enabled: boolean) => getSoundManager().setEnabled(enabled)
export const setSoundVolume = (volume: number) => getSoundManager().setVolume(volume)
export const isSoundEnabled = () => getSoundManager().isEnabled()
export const getSoundVolume = () => getSoundManager().getVolume()
export const warmupSound = () => getSoundManager().warmup()

// React Hook
import { useState, useCallback, useEffect } from 'react'

export function useSound() {
  const [enabled, setEnabled] = useState(true)
  const [volume, setVolume] = useState(0.5)

  useEffect(() => {
    setEnabled(isSoundEnabled())
    setVolume(getSoundVolume())
  }, [])

  const toggleEnabled = useCallback(() => {
    const newEnabled = !enabled
    setEnabled(newEnabled)
    setSoundEnabled(newEnabled)
    if (newEnabled) {
      playToggle()
    }
  }, [enabled])

  const updateVolume = useCallback((newVolume: number) => {
    setVolume(newVolume)
    setSoundVolume(newVolume)
    playTap()
  }, [])

  return {
    enabled,
    volume,
    toggleEnabled,
    updateVolume,
    play: playSound,
    playTap,
    playButton,
    playToggle,
    playSuccess,
    playError,
    playNotification,
    playMessage,
    playSend,
    playPop,
    playSlide,
    playType,
  }
}

export default useSound
