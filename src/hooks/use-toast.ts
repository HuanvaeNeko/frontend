/**
 * Toast 兼容层
 * 使用 Sonner 库，保持旧 API 兼容
 */

import { toast as sonnerToast } from 'sonner'
import { playNotification, playError } from './useSound'

export type ToastProps = {
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success' | 'warning'
}

/**
 * 发送 toast 通知（兼容旧 API）
 */
export function toast(props: ToastProps) {
  const { title, description, variant } = props

  // 播放音效
  if (variant === 'destructive') {
    playError()
  } else {
    playNotification()
  }

  // 根据 variant 调用不同的 toast
  if (variant === 'destructive') {
    return sonnerToast.error(title, { description })
  } else if (variant === 'success') {
    return sonnerToast.success(title, { description })
  } else if (variant === 'warning') {
    return sonnerToast.warning(title, { description })
  } else {
    return sonnerToast(title, { description })
  }
}

/**
 * useToast hook（兼容旧 API）
 */
export function useToast() {
  return {
    toast,
    dismiss: sonnerToast.dismiss,
  }
}
