'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Globe, ShieldCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  RELEASE_PAGE_URL,
  type DownloadTarget,
  fetchInstallTargets,
} from '@/lib/appInstall'

const DISMISS_STORAGE_KEY = 'huanvae.install_prompt_hidden_until'

function shouldSkipPrompt(): boolean {
  if (typeof window === 'undefined') return true

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const ua = navigator.userAgent.toLowerCase()
  const isNativeContainer = ua.includes('tauri') || ua.includes('electron')

  return isStandalone || isNativeContainer
}

export default function AppInstallPrompt() {
  const [visible, setVisible] = useState(false)
  const [normalTarget, setNormalTarget] = useState<DownloadTarget>({ version: null, downloadUrl: RELEASE_PAGE_URL })
  const [proxyTarget, setProxyTarget] = useState<DownloadTarget>({ version: null, downloadUrl: RELEASE_PAGE_URL })

  const versionText = useMemo(() => {
    if (normalTarget.version && proxyTarget.version) {
      return normalTarget.version === proxyTarget.version ? normalTarget.version : `${normalTarget.version} / ${proxyTarget.version}`
    }
    return normalTarget.version || proxyTarget.version || null
  }, [normalTarget.version, proxyTarget.version])

  const dismissForDays = useCallback((days: number) => {
    const hideUntil = Date.now() + days * 24 * 60 * 60 * 1000
    localStorage.setItem(DISMISS_STORAGE_KEY, String(hideUntil))
    setVisible(false)
  }, [])

  useEffect(() => {
    if (shouldSkipPrompt()) return

    const hiddenUntil = Number(localStorage.getItem(DISMISS_STORAGE_KEY) || 0)
    if (hiddenUntil <= Date.now()) setVisible(true)

    void fetchInstallTargets().then((targets) => {
      if (!targets) return
      setNormalTarget({ version: targets.version, downloadUrl: targets.normalUrl })
      setProxyTarget({ version: targets.version, downloadUrl: targets.proxyUrl })
    })
  }, [])

  return (
    <AnimatePresence>
      {!visible && (
        <motion.div
          key="app-install-entry"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] right-3 z-[9997] sm:bottom-4 sm:right-4"
        >
          <Button
            size="sm"
            className="h-11 rounded-full border border-primary/20 bg-primary px-4 text-primary-foreground shadow-lg shadow-primary/20"
            onClick={() => setVisible(true)}
          >
            <Download size={14} />
            安装客户端
          </Button>
        </motion.div>
      )}

      {visible && (
        <motion.div
          key="app-install-prompt"
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="fixed inset-x-2 bottom-[max(8px,env(safe-area-inset-bottom))] z-[9998] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[calc(100%-32px)] sm:max-w-[380px]"
        >
          <Card className="relative overflow-hidden border-border/80 bg-card shadow-lg">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-primary/20" />

            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 text-muted-foreground"
              onClick={() => dismissForDays(1)}
              aria-label="关闭"
            >
              <X size={15} />
            </Button>

            <CardHeader className="space-y-2 pr-12 pb-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 text-primary">桌面版</Badge>
                {versionText && <Badge variant="secondary">v{versionText}</Badge>}
              </div>
              <CardTitle className="text-base">安装 Huanvae Chat 客户端</CardTitle>
              <CardDescription className="leading-relaxed">
                桌面客户端连接更稳定，消息通知更及时，支持更完整的文件传输能力。
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button asChild className="h-10 justify-between px-3">
                  <a href={normalTarget.downloadUrl} target="_blank" rel="noreferrer">
                    <span className="flex items-center gap-1.5"><Download size={14} />普通线路</span>
                    <Globe size={14} />
                  </a>
                </Button>
                <Button asChild className="h-10 justify-between px-3" variant="secondary">
                  <a href={proxyTarget.downloadUrl} target="_blank" rel="noreferrer">
                    <span className="flex items-center gap-1.5"><Download size={14} />代理线路</span>
                    <ShieldCheck size={14} />
                  </a>
                </Button>
              </div>

              <Separator />

              <div className="flex flex-col items-start gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>关闭后仍可通过侧边栏「安装 APP」入口下载</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => dismissForDays(7)}
                >
                  7 天不再提示
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
