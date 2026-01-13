'use client'

import { Toaster as SonnerToaster } from 'sonner'

/**
 * 全局 Toast 通知组件
 * 基于 Sonner 库
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      expand={true}
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12)',
        },
        className: 'sonner-toast',
      }}
    />
  )
}

export default Toaster
