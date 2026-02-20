'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Download, Globe, Laptop, ShieldCheck, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RELEASE_PAGE_URL, type DownloadTarget, fetchInstallTargets } from '@/lib/appInstall'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'

type DeferredPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function DownloadCenter() {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [normalTarget, setNormalTarget] = useState<DownloadTarget>({ version: null, downloadUrl: RELEASE_PAGE_URL })
  const [proxyTarget, setProxyTarget] = useState<DownloadTarget>({ version: null, downloadUrl: RELEASE_PAGE_URL })
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredPrompt | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  const versionText = useMemo(() => {
    if (normalTarget.version && proxyTarget.version && normalTarget.version !== proxyTarget.version) {
      return `${normalTarget.version} / ${proxyTarget.version}`
    }
    return normalTarget.version || proxyTarget.version
  }, [normalTarget.version, proxyTarget.version])

  useEffect(() => {
    const hasHydrated = useAuthStore.persist.hasHydrated()
    if (hasHydrated) {
      setIsHydrated(true)
      return
    }

    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setIsHydrated(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    setIsInstalled(isPwaInstalled())

    const onBeforeInstallPrompt = (event: Event) => {
      if (process.env.NODE_ENV === 'production') {
        event.preventDefault()
      }
      setDeferredPrompt(event as DeferredPrompt)
    }

    const onAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    void fetchInstallTargets().then((targets) => {
      if (!targets) return
      setNormalTarget({ version: targets.version, downloadUrl: targets.normalUrl })
      setProxyTarget({ version: targets.version, downloadUrl: targets.proxyUrl })
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const installPwa = async () => {
    if (!deferredPrompt) {
      const target = isHydrated && isAuthenticated ? ROUTES.app.chat : ROUTES.auth.login
      router.push(target)
      return
    }

    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  const openWebApp = () => {
    const target = isHydrated && isAuthenticated ? ROUTES.app.chat : ROUTES.auth.login
    router.push(target)
  }

  const scrollToTop = () => {
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }

    const container = document.getElementById('top')
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section id="download" className="mx-auto w-full max-w-6xl px-6 pb-18 sm:px-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-slate-500">DOWNLOAD CENTER</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">下载与安装</h2>
        </div>
        <div className="flex items-center gap-2">
          {versionText && <Badge variant="secondary">桌面版 v{versionText}</Badge>}
          <Button variant="ghost" size="sm" className="h-8 px-2 text-slate-700" onClick={scrollToTop}>
            返回顶部
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900"><Laptop size={18} /> 桌面客户端</CardTitle>
            <CardDescription>Windows / macOS / Linux，优先推荐。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full justify-between">
              <a href={normalTarget.downloadUrl} target="_blank" rel="noreferrer">
                普通线路下载 <Download size={16} />
              </a>
            </Button>
            <Button asChild variant="secondary" className="w-full justify-between">
              <a href={proxyTarget.downloadUrl} target="_blank" rel="noreferrer">
                代理线路下载 <ShieldCheck size={16} />
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900"><Smartphone size={18} /> 安装到手机/平板</CardTitle>
            <CardDescription>支持 PWA，安装后可像原生应用一样启动。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={installPwa} className="w-full justify-between" disabled={isInstalled}>
              {isInstalled ? '已安装 PWA' : '一键安装 PWA'}
              <ArrowUpRight size={16} />
            </Button>
            <p className="text-xs leading-5 text-slate-500">如浏览器不支持安装提示，将自动进入 Web App，可通过浏览器菜单“添加到主屏幕”。</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900"><Globe size={18} /> 网页版</CardTitle>
            <CardDescription>无需下载，直接登录即可开始沟通。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-between" onClick={openWebApp}>
              进入 Web App <ArrowUpRight size={16} />
            </Button>
            <Button asChild variant="ghost" className="w-full justify-between text-slate-700">
              <a href={RELEASE_PAGE_URL} target="_blank" rel="noreferrer">查看全部发布记录 <ArrowUpRight size={16} /></a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={scrollToTop}>
          回到首屏
        </Button>
      </div>
    </section>
  )
}
