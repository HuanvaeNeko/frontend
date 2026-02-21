'use client'

import { useI18n } from '@/i18n/I18nProvider'
import { MessageSquare, Bot, Video, Shield, Laptop, Globe } from 'lucide-react'

export default function FeaturesSection() {
  const { t } = useI18n()

  const features = [
    {
      key: 'chat',
      icon: MessageSquare,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
    },
    {
      key: 'video',
      icon: Video,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      key: 'ai',
      icon: Bot,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
    {
      key: 'security',
      icon: Shield,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      key: 'platform',
      icon: Laptop,
      color: 'text-pink-500',
      bg: 'bg-pink-500/10',
    },
    {
      key: 'open',
      icon: Globe,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
    },
  ] as const

  return (
    <section className="mx-auto w-full max-w-6xl px-6 sm:px-10">
      <div className="mb-12 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          {t('landing.features.title')}
        </h2>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.key}
            data-reveal
            className="group relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/50 p-6 transition-all hover:border-sky-200/60 hover:bg-white/80 hover:shadow-lg hover:shadow-sky-100/50 dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-sky-800/40 dark:hover:bg-slate-900/80 dark:hover:shadow-sky-900/20"
          >
            <div className={`mb-4 inline-flex rounded-xl p-3 ${feature.bg}`}>
              <feature.icon className={`h-6 w-6 ${feature.color}`} />
            </div>
            
            <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
              {t(`landing.features.${feature.key}.title`)}
            </h3>
            
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {t(`landing.features.${feature.key}.description`)}
            </p>

            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-white/20 to-transparent blur-2xl transition-all group-hover:scale-150 group-hover:from-sky-500/10 dark:from-white/5 dark:group-hover:from-sky-500/10" />
          </div>
        ))}
      </div>
    </section>
  )
}
