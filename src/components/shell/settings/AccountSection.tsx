import { KeyRound, LogOut } from 'lucide-react'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/store/authStore'
import Devices from '@/features/settings/components/DevicesPage'
import PrivacySettings from '@/features/settings/components/PrivacySettings'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'
import { BlacklistPanel } from './BlacklistPanel'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

export function AccountSection() {
  const { t } = useI18n()
  const logout = useAuthStore((s) => s.logout)
  return (
    <>
      <SettingsSection title={t('shell.settings.privacy')}><div className="p-3"><PrivacySettings /></div></SettingsSection>
      <SettingsSection title={t('shell.settings.devices')}><div className="p-3"><Devices embedded /></div></SettingsSection>
      <SettingsSection title={t('shell.settings.blacklist.title')}><BlacklistPanel /></SettingsSection>
      <SettingsSection title={t('shell.settings.account')}>
        <SettingsGroup>
          <SettingsRow icon={<KeyRound className="h-4 w-4" />} title={t('shell.settings.changePassword')} subtitle={t('shell.settings.changePasswordHint')}
            right={<NavLink to={ROUTES.app.profile} className="subtle-btn">{t('shell.settings.open')}</NavLink>} />
          <SettingsRow title={t('shell.settings.logout')} right={<Button variant="destructive" size="sm" onClick={() => { void logout() }}><LogOut className="mr-1 h-4 w-4" />{t('shell.settings.logout')}</Button>} />
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}
