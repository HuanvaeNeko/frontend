'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, Download, Globe, Laptop, ShieldCheck, Smartphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RELEASE_PAGE_URL, type DownloadTarget, fetchInstallTargets } from '@/lib/appInstall'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'
import { useI18n } from '@/i18n/I18nProvider'

type DeferredPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function DownloadCenter() {
  const { t } = useI18n()
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
    <section id="download" className="mx-auto w-full max-w-6xl px-4 pb-18 sm:px-10">
      <div data-reveal className="relative overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white/70 p-4 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/65 sm:rounded-[2rem] sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(14,165,233,0.1),transparent_36%,rgba(16,185,129,0.09))]" />
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(100,116,139,0.14)_0_1px,transparent_1px_28px)]" />

        <div className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
          <div>
            <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">DEPLOYMENT OPERATORS</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100 sm:text-4xl">{t('landing.download.title')}</h2>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
            {versionText && <Badge variant="secondary">build v{versionText}</Badge>}
            <Button data-magnetic variant="ghost" size="sm" className="h-9 px-2 text-slate-700 dark:text-slate-200" onClick={scrollToTop}>
              {t('landing.download.backToTop')}
            </Button>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_.9fr_.9fr]">
          <article data-reveal data-gsap="grid-card" className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/75 p-5 dark:border-slate-700 dark:bg-slate-950/55">
            <div data-gsap="grid-card-glow" className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/14 blur-2xl" />
            <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">PRIMARY CHANNEL</p>
            <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold sm:text-xl"><Laptop size={18} /> {t('landing.download.desktopTitle')}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('landing.download.desktopDesc')}</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button asChild data-magnetic className="w-full justify-between">
                <a href={normalTarget.downloadUrl} target="_blank" rel="noreferrer">
                  {t('landing.download.normal')} <Download size={16} />
                </a>
              </Button>
              <Button asChild data-magnetic variant="secondary" className="w-full justify-between">
                <a href={proxyTarget.downloadUrl} target="_blank" rel="noreferrer">
                  {t('landing.download.proxy')} <ShieldCheck size={16} />
                </a>
              </Button>
            </div>

            <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-slate-600/70" />
            <p className="mt-3 text-xs tracking-[0.12em] text-slate-500 dark:text-slate-400">DIRECT · PROXY · RESILIENT DELIVERY</p>
          </article>

          <article data-reveal data-gsap="grid-card" className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/75 p-5 dark:border-slate-700 dark:bg-slate-950/55">
            <div data-gsap="grid-card-glow" className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/14 blur-2xl" />
            <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">MOBILE SURFACE</p>
            <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold sm:text-xl"><Smartphone size={18} /> {t('landing.download.mobileTitle')}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('landing.download.mobileDesc')}</p>
            <div className="mt-4">
              <Button data-magnetic onClick={installPwa} className="w-full justify-between" disabled={isInstalled}>
                {isInstalled ? t('landing.download.pwaInstalled') : t('landing.download.pwaInstall')}
                <ArrowUpRight size={16} />
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{t('landing.download.mobileHint')}</p>
          </article>

          <article data-reveal data-gsap="grid-card" className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/75 p-5 dark:border-slate-700 dark:bg-slate-950/55">
            <div data-gsap="grid-card-glow" className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/14 blur-2xl" />
            <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">WEB SURFACE</p>
            <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold sm:text-xl"><Globe size={18} /> {t('landing.download.webTitle')}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('landing.download.webDesc')}</p>
            <div className="mt-4 space-y-2">
              <Button data-magnetic variant="outline" className="w-full justify-between" onClick={openWebApp}>
                {t('landing.actions.openApp')} <ArrowUpRight size={16} />
              </Button>
              <Button asChild data-magnetic variant="ghost" className="w-full justify-between text-slate-700 dark:text-slate-200">
                <a href={RELEASE_PAGE_URL} target="_blank" rel="noreferrer">{t('landing.download.releases')} <ArrowUpRight size={16} /></a>
              </Button>
            </div>
          </article>
        </div>

        <div className="relative z-10 mt-5 flex justify-end">
          <Button data-magnetic variant="outline" size="sm" onClick={scrollToTop}>
            {t('landing.download.backToHero')}
          </Button>
        </div>
      </div>
    </section>
  )
}
