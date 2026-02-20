'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Download, Globe, ShieldCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  const [expanded, setExpanded] = useState(false)
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
          className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] right-3 z-[9997] sm:bottom-5 sm:right-5"
        >
          <Button
            size="sm"
            className="h-10 rounded-full border border-slate-300/80 bg-white/90 px-4 text-slate-900 shadow-md backdrop-blur hover:bg-white dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-100"
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
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.985 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="fixed inset-x-3 bottom-[max(8px,env(safe-area-inset-bottom))] z-[9998] mx-auto w-auto max-w-[760px]"
        >
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white/86 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/86 dark:shadow-[0_14px_34px_rgba(2,6,23,0.45)]">
            <CardContent className="p-3 sm:p-3.5">
              <div className="flex items-start gap-2.5 sm:items-center">
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white sm:inline-flex dark:bg-slate-100 dark:text-slate-900">
                  <Download size={14} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">安装 Huanvae Chat 客户端</span>
                    {versionText && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">v{versionText}</Badge>}
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">更稳连接、通知更及时，推荐桌面端使用。</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild size="sm" className="h-8 rounded-full px-3 text-xs">
                    <a href={normalTarget.downloadUrl} target="_blank" rel="noreferrer">
                      <Globe size={13} />直连
                    </a>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-full px-2.5 text-xs text-slate-600 dark:text-slate-300"
                    onClick={() => setExpanded((v) => !v)}
                  >
                    更多{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-slate-500"
                    onClick={() => dismissForDays(1)}
                    aria-label="关闭"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -4 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-200/80 pt-3 dark:border-slate-700/70 sm:grid-cols-2">
                      <Button asChild variant="secondary" className="h-9 justify-between px-3 text-xs">
                        <a href={proxyTarget.downloadUrl} target="_blank" rel="noreferrer">
                          <span className="flex items-center gap-1.5"><ShieldCheck size={13} />代理线路</span>
                          <Download size={13} />
                        </a>
                      </Button>

                      <div className="flex items-center justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs text-slate-500"
                          onClick={() => dismissForDays(7)}
                        >
                          7 天不再提示
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
