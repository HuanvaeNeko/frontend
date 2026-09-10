import { NavLink, useParams } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { settingsPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTION_META } from './sections'

export function SettingsSectionList() {
  const { t } = useI18n()
  const { section } = useParams()
  return (
    <div className="flex h-full flex-col">
      <h2 className="px-4 pb-2 pt-4 text-lg font-semibold text-foreground">{t('shell.settings.title')}</h2>
      <nav className="flex flex-col gap-1 px-2">
        {SETTINGS_SECTION_META.map((m) => (
          <NavLink key={m.key} to={settingsPath(m.key)} aria-current={section === m.key ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--primary-subtle)]', section === m.key ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-foreground')}>
            <m.icon className="h-[18px] w-[18px]" />
            <span>{t(m.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
