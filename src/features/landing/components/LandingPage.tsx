'use client'

import { useI18n } from '@/i18n/I18nProvider'
import LandingGsapOrchestrator from './LandingGsapOrchestrator'
import LandingControls from './LandingControls'
import HeroActions from './HeroActions'
import MathCoreSection from './MathCoreSection'
import DownloadCenter from './DownloadCenter'

export default function LandingPage() {
  const { t } = useI18n()

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-slate-50 selection:bg-sky-200/40 dark:bg-slate-950 dark:selection:bg-sky-500/30">
      <LandingGsapOrchestrator />
      <LandingControls />

      {/* Hero Section */}
      <section className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-32 sm:px-10 sm:pt-48 lg:px-12">
        <div data-gsap="hero-orb" className="pointer-events-none absolute -top-[24%] left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.12),transparent_65%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.1),transparent_65%)]" />
        
        <div data-gsap="hero-badge" className="relative mb-6 rounded-full border border-sky-200/60 bg-white/50 px-3 py-1 text-xs font-medium tracking-[0.16em] text-sky-600 backdrop-blur-md dark:border-sky-800/40 dark:bg-slate-900/40 dark:text-sky-400">
          HUANVAE INTELLIGENCE
        </div>

        <h1 data-gsap="hero-title" className="relative max-w-4xl text-center text-5xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-7xl lg:text-[5.4rem]">
          {t('landing.hero.title')}
        </h1>

        <p data-gsap="hero-description" className="relative mt-8 max-w-2xl text-center text-lg leading-8 text-slate-600 dark:text-slate-300 sm:text-xl">
          {t('landing.hero.description')}
        </p>

        <HeroActions />
      </section>

      {/* Sections */}
      <div className="mt-24 space-y-24 sm:mt-32 sm:space-y-32">
        <MathCoreSection />
        <DownloadCenter />
      </div>

      <footer className="mt-24 border-t border-slate-200/60 bg-white/40 py-12 text-center text-sm text-slate-500 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/30 dark:text-slate-400">
        <p>© 2024 Huanvae Chat. All rights reserved.</p>
      </footer>
    </main>
  )
}
