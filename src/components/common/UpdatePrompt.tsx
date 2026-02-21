'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, X, Sparkles, Info } from 'lucide-react'
import { useInterval, useTimeout } from 'ahooks'
import { APP_VERSION, getSWVersion, clearSWCache } from '@/lib/version'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  // Service Worker Registration
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }

    if (process.env.NODE_ENV === 'development') {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister()
        })
      })
      return
    }

    let updateFoundHandler: (() => void) | null = null
    let stateChangeHandler: (() => void) | null = null
    let installingWorker: ServiceWorker | null = null

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none'
        })
        registrationRef.current = registration
        console.log('✅ Service Worker 注册成功')
        
        await navigator.serviceWorker.ready
        const currentSWVersion = await getSWVersion()
        setState(prev => ({ ...prev, currentVersion: currentSWVersion }))

        if (registration.waiting) {
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

        updateFoundHandler = () => {
          const newWorker = registration.installing
          if (newWorker) {
            installingWorker = newWorker
            stateChangeHandler = async () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('🔄 发现新版本')
                
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
            }
            newWorker.addEventListener('statechange', stateChangeHandler)
          }
        }
        registration.addEventListener('updatefound', updateFoundHandler)
        
      } catch (error) {
        console.error('❌ Service Worker 注册失败:', error)
      }
    }

    void registerSW()

    return () => {
      const registration = registrationRef.current
      if (registration && updateFoundHandler) {
        registration.removeEventListener('updatefound', updateFoundHandler)
      }
      if (installingWorker && stateChangeHandler) {
        installingWorker.removeEventListener('statechange', stateChangeHandler)
      }
    }
  }, []) // Removed intervals and timeouts from dependency/cleanup

  // Listeners
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return

    const handleControllerChange = () => {
      window.location.reload()
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_ACTIVATED') {
        console.log('SW 已激活:', event.data.version)
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    navigator.serviceWorker.addEventListener('message', handleMessage)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      navigator.serviceWorker.removeEventListener('message', handleMessage)
    }
  }, [])

  // Check Interval
  useInterval(() => {
    registrationRef.current?.update().catch(console.error)
  }, checkInterval)

  // Dismiss Timeout (2 minutes)
  useTimeout(() => {
    setState(prev => ({ ...prev, dismissed: false }))
    setCountdown(initialSeconds)
  }, state.dismissed ? 120000 : undefined)

  // Execution
  const handleUpdate = useCallback(async () => {
    const registration = registrationRef.current
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    } else {
      await clearSWCache()
      window.location.reload()
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setState(prev => ({ ...prev, dismissed: true }))
  }, [])

  const handleImmediateUpdate = useCallback(() => {
    handleUpdate()
  }, [handleUpdate])

  // Countdown Timer
  useInterval(() => {
    setCountdown((prev) => {
      if (prev <= 1) {
        handleUpdate()
        return 0
      }
      return prev - 1
    })
  }, (state.needRefresh && !state.dismissed && countdown > 0) ? 1000 : undefined)


  const isVisible = state.needRefresh && !state.dismissed

  return (
    <>
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
            <Card className="relative gap-0 py-0 shadow-xl">
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2 text-muted-foreground z-10"
                onClick={handleDismiss}
              >
                <X size={16} />
              </Button>

              <CardHeader className="px-4 py-4 pr-12">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    className="text-primary"
                  >
                    <Sparkles size={18} />
                  </motion.div>
                  <CardTitle className="text-base">发现新版本</CardTitle>
                  {state.newVersion && <Badge variant="secondary">v{state.newVersion}</Badge>}
                </div>
                <CardDescription>
                  {countdown > 0 ? `将在 ${countdown} 秒后自动更新` : '正在更新...'}
                </CardDescription>
              </CardHeader>

              <CardContent className="px-4 pb-4 space-y-3">
                <Progress
                  value={Math.max(0, Math.min(100, (countdown / initialSeconds) * 100))}
                  className="h-1.5"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleImmediateUpdate}>
                    <RefreshCw size={14} />
                    立即更新
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDismiss}>
                    稍后
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowVersionInfo(true)}>
                    <Info size={14} />
                    版本信息
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showVersionInfo} onOpenChange={setShowVersionInfo}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>版本信息</DialogTitle>
            <DialogDescription>当前应用与 Service Worker 的版本状态</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">应用版本</span>
              <Badge variant="outline">v{APP_VERSION}</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SW 版本</span>
              <Badge variant="outline">{state.currentVersion || '未加载'}</Badge>
            </div>
            {state.newVersion && state.newVersion !== state.currentVersion && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">新版本</span>
                  <Badge>v{state.newVersion}</Badge>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              onClick={async () => {
                await clearSWCache()
                window.location.reload()
              }}
            >
              清除缓存并刷新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default UpdatePrompt
