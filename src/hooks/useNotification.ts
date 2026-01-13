'use client'

/**
 * 通知系统 - 基于 Sonner
 * 整合 Sonner toast + 浏览器 Notifications API + 音效
 */

import { toast } from 'sonner'
import { playNotification, playSuccess, playError, playMessage } from './useSound'

export type NotificationType = 'info' | 'success' | 'warning' | 'error' | 'message'

export interface NotificationOptions {
  /** 通知内容/描述 */
  description?: string
  /** 自动关闭时间(ms) */
  duration?: number
  /** 是否播放音效 */
  sound?: boolean
  /** 是否发送浏览器通知 */
  native?: boolean
  /** 通知图标 */
  icon?: string
  /** 点击回调 */
  onClick?: () => void
  /** 操作按钮 */
  action?: {
    label: string
    onClick: () => void
  }
}

// 播放对应类型的音效
function playSoundForType(type: NotificationType) {
  switch (type) {
    case 'success':
      playSuccess()
      break
    case 'error':
    case 'warning':
      playError()
      break
    case 'message':
      playMessage()
      break
    default:
      playNotification()
  }
}

// 发送浏览器原生通知
async function sendNativeNotification(title: string, options?: NotificationOptions): Promise<globalThis.Notification | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null
  }

  if (Notification.permission !== 'granted') {
    return null
  }

  try {
    const notification = new Notification(title, {
      body: options?.description,
      icon: options?.icon || '/logo.svg',
      silent: true,
    })

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus()
        options.onClick?.()
        notification.close()
      }
    }

    return notification
  } catch {
    return null
  }
}

/**
 * 发送通知
 */
export function notify(title: string, options?: NotificationOptions & { type?: NotificationType }) {
  const type = options?.type || 'info'
  const sound = options?.sound ?? true
  const native = options?.native ?? false

  // 播放音效
  if (sound) {
    playSoundForType(type)
  }

  // 发送浏览器通知（页面不可见时）
  if (native && typeof document !== 'undefined' && document.hidden) {
    sendNativeNotification(title, options)
  }

  // Sonner toast 配置
  const toastOptions = {
    description: options?.description,
    duration: options?.duration ?? 5000,
    action: options?.action ? {
      label: options.action.label,
      onClick: options.action.onClick,
    } : undefined,
  }

  // 根据类型调用不同的 toast
  switch (type) {
    case 'success':
      return toast.success(title, toastOptions)
    case 'error':
      return toast.error(title, toastOptions)
    case 'warning':
      return toast.warning(title, toastOptions)
    case 'message':
      return toast.message(title, toastOptions)
    default:
      return toast.info(title, toastOptions)
  }
}

// 便捷方法
export const notifyInfo = (title: string, description?: string, options?: NotificationOptions) =>
  notify(title, { ...options, description, type: 'info' })

export const notifySuccess = (title: string, description?: string, options?: NotificationOptions) =>
  notify(title, { ...options, description, type: 'success' })

export const notifyWarning = (title: string, description?: string, options?: NotificationOptions) =>
  notify(title, { ...options, description, type: 'warning' })

export const notifyError = (title: string, description?: string, options?: NotificationOptions) =>
  notify(title, { ...options, description, type: 'error' })

export const notifyMessage = (title: string, description?: string, options?: NotificationOptions) =>
  notify(title, { ...options, description, type: 'message', native: true })

// Promise toast
export const notifyPromise = <T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: unknown) => string)
  }
) => {
  playNotification()
  return toast.promise(promise, messages)
}

/**
 * 请求浏览器通知权限
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission === 'denied') {
    return 'denied'
  }

  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * 通知 Hook
 */
export function useNotification() {
  return {
    notify,
    notifyInfo,
    notifySuccess,
    notifyWarning,
    notifyError,
    notifyMessage,
    notifyPromise,
    dismiss: toast.dismiss,
    requestPermission: requestNotificationPermission,
  }
}

export default useNotification
