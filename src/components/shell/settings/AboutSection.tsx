import { NavLink } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'
import { APP_VERSION } from '@/lib/version'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

export function AboutSection() {
  const { t } = useI18n()
  return (
    <SettingsSection title={t('shell.settings.about')}>
      <SettingsGroup>
        <SettingsRow title={t('shell.settings.version')} right={<span className="text-[13px] text-muted-foreground">{APP_VERSION}</span>} />
        <SettingsRow title={t('shell.settings.downloads')} right={<NavLink to={ROUTES.downloads} className="subtle-btn">{t('shell.settings.downloads')}</NavLink>} />
      </SettingsGroup>
    </SettingsSection>
  )
}
