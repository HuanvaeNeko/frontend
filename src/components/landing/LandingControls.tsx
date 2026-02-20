'use client'

import { Languages, Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/i18n/I18nProvider'
import { useSettingsStore } from '@/store/settingsStore'
import type { LanguagePreference } from '@/i18n/messages'

export default function LandingControls() {
  const { t } = useI18n()
  const language = useSettingsStore((s) => s.language)
  const theme = useSettingsStore((s) => s.theme)
  const setSetting = useSettingsStore((s) => s.setSetting)

  return (
    <div className="absolute right-4 top-4 z-20 flex flex-wrap items-center gap-2 sm:right-10 sm:top-8">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/75 px-2 py-1 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/65">
        <Languages className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        <Select value={language} onValueChange={(value) => setSetting('language', value as LanguagePreference)}>
          <SelectTrigger className="h-8 w-[102px] border-none bg-transparent px-1 text-xs tracking-[0.08em] shadow-none focus:ring-0 sm:w-[126px] dark:text-slate-100">
            <SelectValue placeholder={t('landing.controls.language')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t('settings.languageOptions.auto')}</SelectItem>
            <SelectItem value="zh-CN">简体中文</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/75 p-1 backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/65">
        <Button
          type="button"
          variant={theme === 'light' ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => setSetting('theme', 'light')}
          aria-label={t('landing.controls.themeLight')}
        >
          <Sun className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={theme === 'dark' ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => setSetting('theme', 'dark')}
          aria-label={t('landing.controls.themeDark')}
        >
          <Moon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={theme === 'auto' ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => setSetting('theme', 'auto')}
          aria-label={t('settings.themeAuto')}
        >
          <Monitor className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
