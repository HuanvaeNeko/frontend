import { Palette } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguagePreference } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

const THEMES = ['light', 'dark', 'auto'] as const

export function AppearanceSection() {
  const { t } = useI18n()
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)
  const particleBackground = useSettingsStore((s) => s.particleBackground)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const labels = { light: t('shell.settings.themeLight'), dark: t('shell.settings.themeDark'), auto: t('shell.settings.themeAuto') }
  return (
    <SettingsSection title={t('shell.settings.appearance')}>
      <SettingsGroup>
        <SettingsRow icon={<Palette className="h-4 w-4" />} title={t('shell.settings.theme')} right={
          <div role="radiogroup" className="flex gap-1 rounded-[10px] bg-[var(--bg-tertiary)] p-1">
            {/* 分段控件（segmented control），不是表单里提交的原生单选组；沿用 APP 同名组件的 button+role="radio" 结构，样式（选中态胶囊底色）也靠这层 button 挂 */}
            {THEMES.map((v) => (
              // biome-ignore lint/a11y/useSemanticElements: 见上——保留 button，不换成 <input type="radio">
              <button key={v} type="button" role="radio" aria-checked={theme === v} aria-label={labels[v]} onClick={() => setSetting('theme', v)}
                className={cn('rounded-sm px-3 py-1 text-[13px]', theme === v ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground')}>
                {labels[v]}
              </button>
            ))}
          </div>
        } />
        <SettingsRow title={t('shell.settings.language')} right={
          <Select value={language} onValueChange={(v) => setSetting('language', v as LanguagePreference)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('settings.languageOptions.auto')}</SelectItem>
              <SelectItem value="zh-CN">{t('settings.languageOptions.zhCN')}</SelectItem>
              <SelectItem value="en-US">{t('settings.languageOptions.enUS')}</SelectItem>
            </SelectContent>
          </Select>
        } />
        <SettingsRow title={t('shell.settings.animations')} htmlFor="set-animations" right={<Switch id="set-animations" aria-label={t('shell.settings.animations')} checked={animationsEnabled} onCheckedChange={(v) => setSetting('animationsEnabled', v)} />} />
        <SettingsRow title={t('shell.settings.particles')} htmlFor="set-particles" right={<Switch id="set-particles" aria-label={t('shell.settings.particles')} checked={particleBackground} onCheckedChange={(v) => setSetting('particleBackground', v)} />} />
      </SettingsGroup>
    </SettingsSection>
  )
}
