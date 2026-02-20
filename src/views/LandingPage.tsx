'use client'

import { Bot, Shield, Users, Video } from 'lucide-react'
import DownloadCenter from '@/components/landing/DownloadCenter'
import LandingGsapOrchestrator from '@/components/landing/LandingGsapOrchestrator'
import HeroActions from '@/components/landing/HeroActions'
import LandingControls from '@/components/landing/LandingControls'
import { useI18n } from '@/i18n/I18nProvider'

const inspirations = [
  {
    name: 'QQ',
    focusKey: 'landing.inspirations.qq.focus',
    descriptionKey: 'landing.inspirations.qq.description',
  },
  {
    name: 'Discord',
    focusKey: 'landing.inspirations.discord.focus',
    descriptionKey: 'landing.inspirations.discord.description',
  },
  {
    name: 'WeChat',
    focusKey: 'landing.inspirations.wechat.focus',
    descriptionKey: 'landing.inspirations.wechat.description',
  },
  {
    name: 'Telegram',
    focusKey: 'landing.inspirations.telegram.focus',
    descriptionKey: 'landing.inspirations.telegram.description',
  },
] as const

const featureItems = [
  {
    icon: Users,
    titleKey: 'landing.features.channel.title',
    descriptionKey: 'landing.features.channel.description',
  },
  {
    icon: Bot,
    titleKey: 'landing.features.ai.title',
    descriptionKey: 'landing.features.ai.description',
  },
  {
    icon: Video,
    titleKey: 'landing.features.video.title',
    descriptionKey: 'landing.features.video.description',
  },
  {
    icon: Shield,
    titleKey: 'landing.features.security.title',
    descriptionKey: 'landing.features.security.description',
  },
] as const

export default function LandingPage() {
  const { t } = useI18n()

  return (
    <main id="top" className="app-page-scroll app-screen relative overflow-x-hidden bg-slate-50/75 text-slate-900 dark:bg-slate-950/75 dark:text-slate-100">
      <LandingGsapOrchestrator />

      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.22),transparent_35%),radial-gradient(circle_at_92%_6%,rgba(34,197,94,0.2),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.16),transparent_42%)] dark:bg-[radial-gradient(circle_at_8%_0%,rgba(56,189,248,0.18),transparent_35%),radial-gradient(circle_at_92%_6%,rgba(34,197,94,0.14),transparent_32%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.1),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(100,116,139,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,0.08)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div data-gsap="drift" className="pointer-events-none absolute -left-32 top-20 -z-10 h-[28rem] w-[28rem] rounded-full bg-cyan-300/20 blur-[120px] dark:bg-cyan-500/12" />
      <div data-gsap="drift" className="pointer-events-none absolute right-[-140px] top-1/3 -z-10 h-[30rem] w-[30rem] rounded-full bg-emerald-300/18 blur-[130px] dark:bg-emerald-500/12" />
      <div data-gsap="drift" className="pointer-events-none absolute bottom-[-120px] left-1/3 -z-10 h-[26rem] w-[26rem] rounded-full bg-indigo-300/14 blur-[120px] dark:bg-indigo-500/10" />

      <section className="mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-8 px-4 py-14 sm:gap-10 sm:px-10 sm:py-16 lg:grid-cols-[1.08fr_.92fr]">
        <LandingControls />

        <div className="relative z-10">
          <div data-gsap="hero-badge" className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs tracking-[0.18em] text-slate-600 backdrop-blur dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            ABSTRACT COMMUNICATION SYSTEM
          </div>

          <h1 data-gsap="hero-title" className="mt-6 max-w-5xl text-3xl font-bold leading-tight sm:text-6xl">
            {t('landing.hero.title')}
            <span className="block bg-gradient-to-r from-sky-600 via-cyan-600 to-emerald-600 bg-clip-text text-transparent">
              {t('landing.hero.highlight')}
            </span>
          </h1>

          <p data-gsap="hero-description" className="mt-5 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:mt-6 sm:text-lg">
            {t('landing.hero.description')}
          </p>

          <HeroActions />
        </div>

        <div data-gsap="hero-orb" className="relative overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/60 p-3 backdrop-blur-2xl dark:border-slate-700 dark:bg-slate-900/60 sm:rounded-[2rem] sm:p-4">
          <div className="pointer-events-none absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(14,165,233,0.12),rgba(16,185,129,0.08),rgba(59,130,246,0.12),rgba(14,165,233,0.12))]" />
          <svg viewBox="0 0 720 520" className="relative z-10 h-[210px] w-full sm:h-[320px]">
            <g opacity="0.22">
              {Array.from({ length: 12 }).map((_, i) => (
                <line key={`h-${i}`} x1="34" y1={34 + i * 38} x2="686" y2={34 + i * 38} stroke="#64748b" strokeWidth="1" />
              ))}
              {Array.from({ length: 14 }).map((_, i) => (
                <line key={`v-${i}`} x1={40 + i * 48} y1="26" x2={40 + i * 48} y2="494" stroke="#64748b" strokeWidth="1" />
              ))}
            </g>
            <path data-gsap="abstract-path" d="M40 260 C120 120, 220 420, 320 260 C420 100, 520 420, 680 240" stroke="url(#a)" strokeWidth="3" fill="none" />
            <path data-gsap="abstract-path" d="M40 300 C160 420, 220 100, 360 280 C460 410, 560 140, 680 320" stroke="url(#b)" strokeWidth="2.1" fill="none" opacity="0.9" />
            <defs>
              <linearGradient id="a" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0ea5e9" />
                <stop offset="50%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="b" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#14b8a6" />
              </linearGradient>
            </defs>
            {[120, 260, 400, 560].map((x, i) => (
              <circle key={x} data-gsap="abstract-node" cx={x} cy={i % 2 === 0 ? 230 : 305} r={7 + (i % 2)} fill={i % 2 === 0 ? '#22d3ee' : '#34d399'} />
            ))}
          </svg>
          <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
            {['phase lattice', 'signal manifold', 'adaptive rhythm'].map((tag) => (
              <div key={tag} data-reveal className="rounded-xl border border-white/75 bg-white/70 px-3 py-2 text-xs tracking-[0.14em] text-slate-600 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-300">
                {tag.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-10 sm:pb-14">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="text-2xl font-semibold sm:text-4xl">{t('landing.inspirations.title')}</h2>
          <span className="hidden text-xs tracking-[0.14em] text-slate-500 dark:text-slate-400 sm:inline">ABSTRACT MAPPING</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {inspirations.map((item, idx) => (
            <article
              key={item.name}
              data-reveal
              data-gsap="grid-card"
              className={`group relative overflow-hidden rounded-3xl border border-white/80 bg-white/70 p-6 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 ${idx % 2 === 0 ? 'sm:rotate-[-0.25deg]' : 'sm:rotate-[0.25deg]'}`}
            >
              <div data-gsap="grid-card-glow" className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/15 blur-2xl" />
              <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">{item.name} / operator</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{t(item.focusKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t(item.descriptionKey)}</p>
              <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-slate-600/80" />
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-10 sm:pb-14">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold sm:text-4xl">{t('landing.features.title')}</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_.95fr]">
          <div data-reveal className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-6 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),transparent_38%,rgba(16,185,129,0.10))]" />
            <div className="relative grid gap-3 sm:grid-cols-2">
              {featureItems.map(({ icon: Icon, titleKey, descriptionKey }) => (
                <article key={titleKey} data-reveal data-gsap="grid-card" className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70">
                  <div data-gsap="grid-card-glow" className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/12 blur-2xl" />
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                    <Icon size={18} />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t(titleKey)}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{t(descriptionKey)}</p>
                </article>
              ))}
            </div>
          </div>

          <article data-reveal data-gsap="grid-card" className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-5 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/70 sm:p-6">
            <div data-gsap="grid-card-glow" className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/12 blur-2xl" />
            <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">DESIGN PHILOSOPHY</p>
            <h3 className="mt-2 text-xl font-semibold sm:text-2xl">不是拟物组件，而是动态秩序</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
              交互不是单点反馈，而是整体场域响应。每个动作都改变系统节奏，页面以连续状态流的方式回应用户，而非离散动画堆叠。
            </p>
            <div className="mt-6 space-y-2">
              {['asymmetric composition', 'continuous transition field', 'hierarchical signal density'].map((item) => (
                <div key={item} data-reveal className="rounded-xl border border-slate-200/80 bg-white/60 px-3 py-2 text-xs tracking-[0.12em] text-slate-600 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-300">
                  {item.toUpperCase()}
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-10">
        <div data-reveal className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white/70 p-5 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/65">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(100,116,139,0.12)_0_1px,transparent_1px_26px)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">DEPLOYMENT SURFACE</span>
            <span className="hidden text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400 sm:inline">continuous entry · discontinuous boundary</span>
          </div>
        </div>
      </section>

      <DownloadCenter />
    </main>
  )
}
