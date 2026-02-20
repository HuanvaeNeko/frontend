'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { ROUTES } from '@/lib/routes'

export default function HeroActions() {
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

  const scrollToDownload = () => {
    const section = document.getElementById('download')
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="mt-9 flex flex-wrap gap-4">
      <button
        type="button"
        onClick={openWebApp}
        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
      >
        打开 Web App <ArrowRight size={16} />
      </button>
      <button
        type="button"
        onClick={scrollToDownload}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white/80 px-6 py-3 text-sm font-semibold text-slate-800 backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-400"
      >
        下载客户端 <ArrowRight size={16} />
      </button>
    </div>
  )
}
