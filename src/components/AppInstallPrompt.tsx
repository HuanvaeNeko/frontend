'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
    if (hiddenUntil <= Date.now()) {
      setVisible(true)
    }

    void fetchInstallTargets().then((targets) => {
      if (!targets) return
      setNormalTarget({
        version: targets.version,
        downloadUrl: targets.normalUrl,
      })
      setProxyTarget({
        version: targets.version,
        downloadUrl: targets.proxyUrl,
      })
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
          className="fixed bottom-4 right-4 z-[9997]"
        >
          <Button
            size="sm"
            className="rounded-full shadow-lg"
            onClick={() => setVisible(true)}
          >
            <Download size={14} />
            下载 APP
          </Button>
        </motion.div>
      )}

      {visible && (
        <motion.div
          key="app-install-prompt"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-4 right-4 z-[9998] w-[calc(100%-32px)] max-w-[360px]"
        >
          <Card className="relative border-border/70 bg-card/95 backdrop-blur-xl shadow-xl gap-0 py-0">
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2 text-muted-foreground"
              onClick={() => dismissForDays(1)}
              aria-label="关闭"
            >
              <X size={16} />
            </Button>

            <CardHeader className="px-4 py-4 pr-12">
              <CardTitle className="text-sm">安装 Huanvae Chat 客户端</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                桌面版连接更稳定，通知更及时。
              </CardDescription>
              {versionText && (
                <Badge variant="secondary" className="w-fit">v{versionText}</Badge>
              )}
            </CardHeader>

            <CardContent className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button asChild size="sm">
                  <a href={normalTarget.downloadUrl} target="_blank" rel="noreferrer">
                    <Download size={13} />
                    普通线路
                  </a>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <a href={proxyTarget.downloadUrl} target="_blank" rel="noreferrer">
                    <Download size={13} />
                    代理线路
                  </a>
                </Button>
              </div>

              <Separator />

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => dismissForDays(7)}
                  className="text-muted-foreground"
                >
                  7 天内不再提示
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
