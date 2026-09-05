'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/navigation'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'

export default function HeroActions() {
  const router = useRouter()
  const { t } = useI18n()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [isHydrated, setIsHydrated] = useState(false)

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

  const openWebApp = () => {
    const target = isHydrated && isAuthenticated ? ROUTES.app.chat : ROUTES.auth.login
    router.push(target)
  }

  const goToDownload = () => {
    router.push(ROUTES.downloads)
  }

  return (
    <div data-gsap="hero-actions" className="mt-9 flex flex-wrap items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={openWebApp}
        data-magnetic
        className="group relative inline-flex min-h-11 items-center gap-2 overflow-hidden rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 sm:px-6"
      >
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.18),transparent_45%)] opacity-70 transition group-hover:translate-x-3" />
        <span className="relative">{t('landing.actions.openApp')}</span>
        <ArrowRight size={16} className="relative" />
      </button>
      <button
        type="button"
        onClick={goToDownload}
        data-magnetic
        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-300 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800 backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-400 sm:px-6"
      >
        {t('landing.actions.download')} <ArrowRight size={16} />
      </button>
      <span className="hidden rounded-xl border border-slate-200/80 bg-white/65 px-3 py-2 text-xs tracking-[0.14em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-400 sm:inline-flex">
        RESPONSE FIELD ACTIVE
      </span>
    </div>
  )
}
