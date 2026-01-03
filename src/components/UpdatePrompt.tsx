import { useEffect, useState, useCallback, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'

interface UpdatePromptProps {
  autoUpdateDelay?: number // 自动更新延迟（毫秒），默认 3000
}

export function UpdatePrompt({ autoUpdateDelay = 3000 }: UpdatePromptProps) {
  const initialSeconds = Math.ceil(autoUpdateDelay / 1000)
  const [countdown, setCountdown] = useState<number>(initialSeconds)
  const [dismissed, setDismissed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const updateCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      console.log('✅ SW 已注册:', swUrl)
      
      // 定期检查更新（每 60 秒）
      if (registration) {
        // 清理可能存在的旧 interval
        if (updateCheckIntervalRef.current) {
          clearInterval(updateCheckIntervalRef.current)
        }
        updateCheckIntervalRef.current = setInterval(() => {
          registration.update()
        }, 60 * 1000)
      }
    },
    onRegisterError(error) {
      console.error('❌ SW 注册失败:', error)
    },
  })

  // 组件卸载时清理更新检查 interval
  useEffect(() => {
    return () => {
      if (updateCheckIntervalRef.current) {
        clearInterval(updateCheckIntervalRef.current)
        updateCheckIntervalRef.current = null
      }
    }
  }, [])

  // 处理更新
  const handleUpdate = useCallback(() => {
    updateServiceWorker(true)
  }, [updateServiceWorker])

  // 取消更新
  const handleDismiss = useCallback(() => {
    setDismissed(true)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    // 30 秒后重新显示提示
    setTimeout(() => {
      setDismissed(false)
      setCountdown(initialSeconds) // 重置倒计时
    }, 30000)
  }, [initialSeconds])

  // 立即更新
  const handleImmediateUpdate = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    handleUpdate()
  }, [handleUpdate])

  // 倒计时逻辑
  useEffect(() => {
    if (needRefresh && !dismissed) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
            // 自动更新
            handleUpdate()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      }
    }
  }, [needRefresh, dismissed, handleUpdate])

  // 是否显示提示
  const isVisible = needRefresh && !dismissed

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="update-prompt"
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-full px-4"
        >
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 shadow-2xl shadow-blue-500/25">
            {/* 进度条 */}
            <motion.div
              className="absolute bottom-0 left-0 h-1 bg-white/30"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: autoUpdateDelay / 1000, ease: 'linear' }}
            />

            <div className="flex items-start gap-3">
              {/* 图标 */}
              <div className="flex-shrink-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"
                >
                  <RefreshCw className="w-5 h-5 text-white" />
                </motion.div>
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white">
                  🎉 发现新版本
                </h3>
                <p className="mt-1 text-xs text-white/80">
                  {countdown > 0 ? (
                    <>
                      将在 <span className="font-bold text-white">{countdown}</span> 秒后自动更新
                    </>
                  ) : (
                    '正在更新...'
                  )}
                </p>

                {/* 按钮 */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleImmediateUpdate}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white text-blue-600 hover:bg-white/90 transition-colors"
                  >
                    立即更新
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    稍后再说
                  </button>
                </div>
              </div>

              {/* 关闭按钮 */}
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

