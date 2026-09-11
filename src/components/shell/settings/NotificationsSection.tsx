import { Bell } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'
import { SoundSelector } from './SoundSelector'

export function NotificationsSection() {
  const { t } = useI18n()
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const setSetting = useSettingsStore((s) => s.setSetting)
  return (
    <SettingsSection title={t('shell.settings.notifications')}>
      <SettingsGroup>
        <SettingsRow icon={<Bell className="h-4 w-4" />} title={t('shell.settings.notify')} htmlFor="set-notify"
          right={<Switch id="set-notify" aria-label={t('shell.settings.notify')} checked={notificationsEnabled} onCheckedChange={(v) => setSetting('notificationsEnabled', v)} />} />
        <SettingsRow title={t('shell.settings.sound')} htmlFor="set-sound"
          right={<Switch id="set-sound" aria-label={t('shell.settings.sound')} checked={soundEnabled} onCheckedChange={(v) => setSetting('soundEnabled', v)} />} />
        <SettingsRow title={t('shell.settings.volume')} htmlFor="set-volume"
          right={<input id="set-volume" type="range" min={0} max={100} aria-label={t('shell.settings.volume')} value={Math.round(soundVolume * 100)} onChange={(e) => setSetting('soundVolume', Number(e.target.value) / 100)} />} />
      </SettingsGroup>
      <SoundSelector />
    </SettingsSection>
  )
}
