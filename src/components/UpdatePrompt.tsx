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
            className="update-prompt-container"
          >
            <div className="update-prompt">
              {/* 进度条 */}
              <motion.div
                className="update-progress"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: autoUpdateDelay / 1000, ease: 'linear' }}
              />

              <div className="update-content">
                {/* 图标 */}
                <div className="update-icon">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles size={20} />
                  </motion.div>
                </div>

                {/* 文字内容 */}
                <div className="update-text">
                  <h3>
                    发现新版本
                    {state.newVersion && (
                      <span className="version-badge">v{state.newVersion}</span>
                    )}
                  </h3>
                  <p>
                    {countdown > 0 ? (
                      <>将在 <strong>{countdown}</strong> 秒后自动更新</>
                    ) : (
                      '正在更新...'
                    )}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="update-actions">
                  <button className="update-btn primary" onClick={handleImmediateUpdate}>
                    <RefreshCw size={14} />
                    立即更新
                  </button>
                  <button className="update-btn secondary" onClick={handleDismiss}>
                    稍后
                  </button>
                </div>

                {/* 版本信息按钮 */}
                <button 
                  className="update-info-btn"
                  onClick={() => setShowVersionInfo(true)}
                  title="版本信息"
                >
                  <Info size={14} />
                </button>

                {/* 关闭按钮 */}
                <button className="update-close" onClick={handleDismiss}>
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
            className="version-modal-overlay"
            onClick={() => setShowVersionInfo(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="version-modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="version-modal-header">
                <h3>版本信息</h3>
                <button onClick={() => setShowVersionInfo(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="version-modal-content">
                <div className="version-row">
                  <span>应用版本</span>
                  <span className="version-value">v{APP_VERSION}</span>
                </div>
                <div className="version-row">
                  <span>SW 版本</span>
                  <span className="version-value">{state.currentVersion || '未加载'}</span>
                </div>
                {state.newVersion && state.newVersion !== state.currentVersion && (
                  <div className="version-row new">
                    <span>新版本</span>
                    <span className="version-value">v{state.newVersion}</span>
                  </div>
                )}
              </div>
              <div className="version-modal-actions">
                <button 
                  className="version-btn danger"
                  onClick={async () => {
                    await clearSWCache()
                    window.location.reload()
                  }}
                >
                  清除缓存并刷新
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .update-prompt-container {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          width: calc(100% - 32px);
          max-width: 480px;
        }

        .update-prompt {
          position: relative;
          overflow: hidden;
          border-radius: 20px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.9) 0%,
            rgba(255, 255, 255, 0.7) 100%
          );
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(147, 197, 253, 0.4);
          box-shadow: 
            0 8px 32px rgba(59, 130, 246, 0.2),
            0 0 0 1px rgba(255, 255, 255, 0.6) inset;
        }

        .update-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6);
          border-radius: 0 3px 3px 0;
        }

        .update-content {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
        }

        .update-icon {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: linear-gradient(135deg, #3b82f6, #6366f1);
          color: white;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
        }

        .update-text {
          flex: 1;
          min-width: 0;
        }

        .update-text h3 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 15px;
          font-weight: 600;
          color: #1e3a5f;
          margin: 0 0 3px;
        }

        .version-badge {
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 6px;
          background: linear-gradient(135deg, #dbeafe, #e0e7ff);
          color: #3b82f6;
        }

        .update-text p {
          font-size: 13px;
          color: #64748b;
          margin: 0;
        }

        .update-text strong {
          color: #3b82f6;
          font-weight: 700;
          font-size: 14px;
        }

        .update-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .update-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .update-btn.primary {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          box-shadow: 0 3px 10px rgba(59, 130, 246, 0.35);
        }

        .update-btn.primary:hover {
          box-shadow: 0 5px 16px rgba(59, 130, 246, 0.45);
          transform: translateY(-1px);
        }

        .update-btn.secondary {
          background: rgba(255, 255, 255, 0.7);
          color: #64748b;
          border: 1px solid rgba(147, 197, 253, 0.4);
        }

        .update-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.95);
          color: #475569;
        }

        .update-info-btn {
          position: absolute;
          bottom: 8px;
          right: 36px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .update-info-btn:hover {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .update-close {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .update-close:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #64748b;
        }

        /* 版本信息弹窗 */
        .version-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }

        .version-modal {
          width: 100%;
          max-width: 340px;
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.95) 0%,
            rgba(255, 255, 255, 0.85) 100%
          );
          backdrop-filter: blur(20px);
          border-radius: 20px;
          border: 1px solid rgba(147, 197, 253, 0.3);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        .version-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px;
          border-bottom: 1px solid rgba(147, 197, 253, 0.2);
        }

        .version-modal-header h3 {
          font-size: 16px;
          font-weight: 600;
          color: #1e3a5f;
          margin: 0;
        }

        .version-modal-header button {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .version-modal-header button:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #1e3a5f;
        }

        .version-modal-content {
          padding: 16px 20px;
        }

        .version-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid rgba(147, 197, 253, 0.15);
        }

        .version-row:last-child {
          border-bottom: none;
        }

        .version-row span:first-child {
          font-size: 14px;
          color: #64748b;
        }

        .version-value {
          font-size: 14px;
          font-weight: 600;
          color: #1e3a5f;
          font-family: ui-monospace, monospace;
        }

        .version-row.new .version-value {
          color: #10b981;
        }

        .version-modal-actions {
          padding: 16px 20px;
          border-top: 1px solid rgba(147, 197, 253, 0.2);
        }

        .version-btn {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }

        .version-btn.danger {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }

        .version-btn.danger:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        @media (max-width: 520px) {
          .update-content {
            flex-wrap: wrap;
          }

          .update-text {
            flex: 1 1 calc(100% - 60px);
          }

          .update-actions {
            width: 100%;
            margin-top: 10px;
          }

          .update-btn {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
    </>
  )
}

export default UpdatePrompt
