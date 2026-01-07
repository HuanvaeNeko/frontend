'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X, Sparkles, Info } from 'lucide-react'
import { APP_VERSION, getSWVersion, clearSWCache } from '@/lib/version'

interface UpdatePromptProps {
  /** 自动更新延迟（毫秒），默认 8000 */
  autoUpdateDelay?: number
  /** 更新检查间隔（毫秒），默认 60000 */
  checkInterval?: number
}

interface UpdateState {
  needRefresh: boolean
  dismissed: boolean
  currentVersion: string | null
  newVersion: string | null
}

export function UpdatePrompt({ 
  autoUpdateDelay = 8000,
  checkInterval = 60000 
}: UpdatePromptProps) {
  const initialSeconds = Math.ceil(autoUpdateDelay / 1000)
  const [countdown, setCountdown] = useState<number>(initialSeconds)
  const [state, setState] = useState<UpdateState>({
    needRefresh: false,
    dismissed: false,
    currentVersion: null,
    newVersion: null
  })
  const [showVersionInfo, setShowVersionInfo] = useState(false)
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  // 清理所有定时器
  const clearAllTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
      checkIntervalRef.current = null
    }
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current)
      dismissTimeoutRef.current = null
    }
  }, [])

  // 注册 Service Worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    // 存储事件处理函数引用，以便清理
    let updateFoundHandler: (() => void) | null = null
    let stateChangeHandler: (() => void) | null = null
    let installingWorker: ServiceWorker | null = null
    let refreshing = false

    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_ACTIVATED') {
        console.log('SW 已激活:', event.data.version)
      }
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none'
        })
        registrationRef.current = registration
        console.log('✅ Service Worker 注册成功')
        
        // 等待 SW 激活后再获取版本
        await navigator.serviceWorker.ready
        const currentSWVersion = await getSWVersion()
        setState(prev => ({ ...prev, currentVersion: currentSWVersion }))

        // 检查是否有等待中的更新
        if (registration.waiting) {
          // 尝试从 manifest.json 获取新版本号（因为 getSWVersion 只能查询活跃的 SW）
          let detectedVersion: string | null = null
          try {
            const manifestResponse = await fetch('/manifest.json', { cache: 'no-store' })
            if (manifestResponse.ok) {
              const manifest = await manifestResponse.json()
              detectedVersion = manifest.version || null
            }
          } catch {
            console.warn('无法从 manifest.json 获取版本')
          }
          
          setState(prev => ({ 
            ...prev, 
            needRefresh: true,
            newVersion: detectedVersion || '新版本'
          }))
        }

        // 监听更新 - 使用命名函数以便清理
        updateFoundHandler = () => {
          const newWorker = registration.installing
          if (newWorker) {
            installingWorker = newWorker
            stateChangeHandler = async () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('🔄 发现新版本')
                
                // 尝试从 manifest.json 获取新版本号
                let detectedVersion: string | null = null
                try {
                  const manifestResponse = await fetch('/manifest.json', { cache: 'no-store' })
                  if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json()
                    detectedVersion = manifest.version || null
                  }
                } catch {
                  console.warn('无法从 manifest.json 获取版本')
                }
                
                setState(prev => ({ 
                  ...prev, 
                  needRefresh: true,
                  // 优先使用从 manifest 获取的版本，否则显示通用提示
                  newVersion: detectedVersion || '新版本'
                }))
              }
            }
            newWorker.addEventListener('statechange', stateChangeHandler)
          }
        }
        registration.addEventListener('updatefound', updateFoundHandler)

        // 定期检查更新
        checkIntervalRef.current = setInterval(() => {
          registration.update().catch(console.error)
        }, checkInterval)
        
      } catch (error) {
        console.error('❌ Service Worker 注册失败:', error)
      }
    }

    registerSW()

    // 监听 SW 控制权变化
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    navigator.serviceWorker.addEventListener('message', handleMessage)

    return () => {
      clearAllTimers()
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      navigator.serviceWorker.removeEventListener('message', handleMessage)
      
      // 清理 registration 事件监听器
      const registration = registrationRef.current
      if (registration && updateFoundHandler) {
        registration.removeEventListener('updatefound', updateFoundHandler)
      }
      
      // 清理 installing worker 事件监听器
      if (installingWorker && stateChangeHandler) {
        installingWorker.removeEventListener('statechange', stateChangeHandler)
      }
    }
  }, [checkInterval, clearAllTimers])

  // 执行更新
  const handleUpdate = useCallback(async () => {
    const registration = registrationRef.current
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    } else {
      // 清除缓存后刷新
      await clearSWCache()
      window.location.reload()
    }
  }, [])

  // 取消/稍后再说
  const handleDismiss = useCallback(() => {
    setState(prev => ({ ...prev, dismissed: true }))
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current)
    }
    // 2 分钟后重新显示
    dismissTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, dismissed: false }))
      setCountdown(initialSeconds)
    }, 120000)
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
    if (state.needRefresh && !state.dismissed) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) {
              clearInterval(timerRef.current)
              timerRef.current = null
            }
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
  }, [state.needRefresh, state.dismissed, handleUpdate])

  const isVisible = state.needRefresh && !state.dismissed

  return (
    <>
      {/* 更新提示 */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            key="update-prompt"
            initial={{ opacity: 0, y: -60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -60, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-32px)] max-w-[480px]"
          >
            <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-2xl border border-blue-200/40 shadow-[0_8px_32px_rgba(59,130,246,0.2),0_0_0_1px_rgba(255,255,255,0.6)_inset]">
              {/* 进度条 */}
              <motion.div
                className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-r-sm"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: autoUpdateDelay / 1000, ease: 'linear' }}
              />

              <div className="flex items-center gap-3.5 px-4 py-4">
                {/* 图标 */}
                <div className="shrink-0 w-11 h-11 flex items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-lg shadow-blue-500/35">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles size={20} />
                  </motion.div>
                </div>

                {/* 文字内容 */}
                <div className="flex-1 min-w-0">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 mb-[3px]">
                    发现新版本
                    {state.newVersion && (
                      <span className="text-[11px] font-medium py-0.5 px-2 rounded-md bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-500">
                        v{state.newVersion}
                      </span>
                    )}
                  </h3>
                  <p className="text-[13px] text-slate-500">
                    {countdown > 0 ? (
                      <>将在 <strong className="text-blue-500 font-bold text-sm">{countdown}</strong> 秒后自动更新</>
                    ) : (
                      '正在更新...'
                    )}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 shrink-0">
                  <motion.button 
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all bg-gradient-to-r from-blue-500 to-blue-600 text-white border-none shadow-md shadow-blue-500/35 hover:shadow-lg hover:-translate-y-px"
                    onClick={handleImmediateUpdate}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RefreshCw size={14} />
                    立即更新
                  </motion.button>
                  <motion.button 
                    className="px-3.5 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-all bg-white/70 text-slate-500 border border-blue-200/40 hover:bg-white/95 hover:text-slate-700"
                    onClick={handleDismiss}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    稍后
                  </motion.button>
                </div>

                {/* 版本信息按钮 */}
                <button 
                  className="absolute bottom-2 right-9 w-6 h-6 flex items-center justify-center rounded-md bg-transparent border-none text-slate-400 cursor-pointer transition-all hover:bg-blue-500/10 hover:text-blue-500"
                  onClick={() => setShowVersionInfo(true)}
                  title="版本信息"
                >
                  <Info size={14} />
                </button>

                {/* 关闭按钮 */}
                <button 
                  className="absolute top-2 right-2 w-[26px] h-[26px] flex items-center justify-center rounded-lg bg-transparent border-none text-slate-400 cursor-pointer transition-all hover:bg-black/5 hover:text-slate-600"
                  onClick={handleDismiss}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 版本信息弹窗 */}
      <AnimatePresence>
        {showVersionInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000] p-5"
            onClick={() => setShowVersionInfo(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-[340px] bg-gradient-to-br from-white/95 to-white/85 backdrop-blur-xl rounded-[20px] border border-blue-200/30 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-blue-200/20">
                <h3 className="text-base font-semibold text-slate-800">版本信息</h3>
                <button 
                  className="w-8 h-8 flex items-center justify-center rounded-[10px] bg-transparent border-none text-slate-500 cursor-pointer transition-all hover:bg-black/5 hover:text-slate-800"
                  onClick={() => setShowVersionInfo(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-5 py-4">
                <div className="flex justify-between items-center py-3 border-b border-blue-200/15">
                  <span className="text-sm text-slate-500">应用版本</span>
                  <span className="text-sm font-semibold text-slate-800 font-mono">v{APP_VERSION}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-blue-200/15">
                  <span className="text-sm text-slate-500">SW 版本</span>
                  <span className="text-sm font-semibold text-slate-800 font-mono">{state.currentVersion || '未加载'}</span>
                </div>
                {state.newVersion && state.newVersion !== state.currentVersion && (
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-slate-500">新版本</span>
                    <span className="text-sm font-semibold text-emerald-500 font-mono">v{state.newVersion}</span>
                  </div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-blue-200/20">
                <motion.button 
                  className="w-full py-3 rounded-xl text-sm font-medium cursor-pointer transition-all bg-red-500/10 text-red-600 border-none hover:bg-red-500/20"
                  onClick={async () => {
                    await clearSWCache()
                    window.location.reload()
                  }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  清除缓存并刷新
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default UpdatePrompt
