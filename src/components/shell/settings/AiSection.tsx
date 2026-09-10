import { Wand2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { useApiConfigStore } from '@/store/apiConfig'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

/**
 * 原 SettingsPage.tsx:83-111 的「AI 配置」Card 原样搬入，只把 Card/CardHeader/
 * CardTitle 换成 SettingsSection/SettingsRow；文案沿用现有 settings.aiConfig*。
 * `customApi` 开关读写的是 `useApiConfigStore`（不是 `useSettingsStore`），
 * 和原页面一致——两个 store 在这张卡片里本来就是一起用的。
 */
export function AiSection() {
  const { t } = useI18n()
  const aiEnabled = useSettingsStore((s) => s.aiEnabled)
  const aiModel = useSettingsStore((s) => s.aiModel)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const useCustomApi = useApiConfigStore((s) => s.useCustomApi)
  const setApiConfig = useApiConfigStore((s) => s.setApiConfig)
  return (
    <SettingsSection title={t('settings.aiConfig')} description={t('settings.aiConfigDesc')}>
      <SettingsGroup>
        <SettingsRow icon={<Wand2 className="h-4 w-4" />} title={t('settings.aiEnabled')} subtitle={t('settings.aiEnabledDesc')} htmlFor="set-ai-enabled"
          right={<Switch id="set-ai-enabled" aria-label={t('settings.aiEnabled')} checked={aiEnabled} onCheckedChange={(v) => setSetting('aiEnabled', v)} />} />
        <SettingsRow title={t('settings.aiModel')} right={
          <Select value={aiModel} onValueChange={(v) => setSetting('aiModel', v)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4">GPT-4</SelectItem>
              <SelectItem value="gpt-3.5">GPT-3.5</SelectItem>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        } />
        <SettingsRow title={t('settings.customApi')} subtitle={t('settings.customApiDesc')} htmlFor="set-custom-api"
          right={<Switch id="set-custom-api" aria-label={t('settings.customApi')} checked={useCustomApi} onCheckedChange={(v) => setApiConfig({ useCustomApi: v })} disabled={!aiEnabled} />} />
      </SettingsGroup>
    </SettingsSection>
  )
}
