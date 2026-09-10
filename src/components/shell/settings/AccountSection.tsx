import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/store/authStore'
import Devices from '@/features/settings/components/DevicesPage'
import PrivacySettings from '@/features/settings/components/PrivacySettings'
import { useI18n } from '@/i18n/I18nProvider'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

export function AccountSection() {
  const { t } = useI18n()
  const logout = useAuthStore((s) => s.logout)
  return (
    <>
      <SettingsSection title={t('shell.settings.privacy')}><div className="p-3"><PrivacySettings /></div></SettingsSection>
      <SettingsSection title={t('shell.settings.devices')}><div className="p-3"><Devices embedded /></div></SettingsSection>
      <SettingsSection title={t('shell.settings.account')}>
        <SettingsGroup>
          <SettingsRow title={t('shell.settings.logout')} right={<Button variant="destructive" size="sm" onClick={() => { void logout() }}><LogOut className="mr-1 h-4 w-4" />{t('shell.settings.logout')}</Button>} />
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}
