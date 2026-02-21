'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useI18n } from '@/i18n/I18nProvider'

export default function DownloadCenter() {
  const { t } = useI18n()
  const router = useRouter()
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
    <section id="download" className="mx-auto w-full max-w-4xl px-6 pb-24 text-center sm:px-10">
      <div data-reveal className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-b from-sky-500/10 to-transparent p-12 sm:p-20">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          {t('landing.hero.title')}
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          {t('landing.hero.description')}
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Button size="lg" onClick={goToDownload} className="rounded-full px-8 text-base h-12">
            {t('landing.actions.download')} <ArrowUpRight className="ml-2 h-5 w-5" />
          </Button>
          <Button size="lg" variant="outline" onClick={openWebApp} className="rounded-full px-8 text-base h-12 bg-transparent border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            {t('landing.actions.openApp')}
          </Button>
        </div>
      </div>
    </section>
  )
}