'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  ArrowLeft,
  Globe,
  Palette,
  RotateCcw,
  Shield,
  Volume2,
  Wand2,
  Zap,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { useApiConfigStore } from '@/store/apiConfig'
import { useToast } from '@/hooks/use-toast'
import { useNotification, requestNotificationPermission } from '@/hooks/useNotification'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguagePreference } from '@/i18n/messages'
import { clearApiBaseUrl, getApiBaseUrl, normalizeApiBaseUrl, setApiBaseUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/store/authStore'

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const router = useRouter()
  const { t } = useI18n()
  const { toast } = useToast()
  const settings = useSettingsStore()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const apiConfig = useApiConfigStore()
  const { notifyInfo, notifySuccess, notifyWarning, notifyError, notifyMessage } = useNotification()
  const initialApiBaseUrl = getApiBaseUrl()
  const [serverInput, setServerInput] = useState(initialApiBaseUrl)

  const handleReset = () => {
    if (!confirm(t('settings.resetConfirm'))) return
    settings.resetSettings()
    apiConfig.resetToDefault()
    toast({ title: t('settings.resetDoneTitle'), description: t('settings.resetDoneDesc') })
  }

  const handleApplyServer = () => {
    try {
      const normalized = normalizeApiBaseUrl(serverInput)
      setApiBaseUrl(normalized)
      clearAuth()
      window.location.href = ROUTES.auth.login
    } catch (error) {
      toast({
        title: '服务器地址无效',
        description: error instanceof Error ? error.message : '请检查输入格式',
        variant: 'destructive',
      })
    }
  }

  const handleResetServer = () => {
    clearApiBaseUrl()
    clearAuth()
    window.location.href = ROUTES.auth.login
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-5 p-3 pb-24 sm:p-6 md:pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => router.push(ROUTES.app.chat)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.subtitle')}</p>
            </div>
          </div>
          <Button variant="destructive" onClick={handleReset} className="gap-1.5 sm:gap-2 text-xs sm:text-sm h-8 sm:h-10">
            <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{t('settings.reset')}
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" />{t('settings.aiConfig')}</CardTitle>
              <CardDescription>{t('settings.aiConfigDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow label={t('settings.aiEnabled')} description={t('settings.aiEnabledDesc')}>
                <Switch checked={settings.aiEnabled} onCheckedChange={(v) => settings.setSetting('aiEnabled', v)} />
              </SettingRow>

              <div className="space-y-2">
                <Label>{t('settings.aiModel')}</Label>
                <Select value={settings.aiModel} onValueChange={(v) => settings.setSetting('aiModel', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-3.5">GPT-3.5</SelectItem>
                    <SelectItem value="claude">Claude</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SettingRow label={t('settings.customApi')} description={t('settings.customApiDesc')}>
                <Switch checked={apiConfig.useCustomApi} onCheckedChange={(v) => apiConfig.setApiConfig({ useCustomApi: v })} disabled={!settings.aiEnabled} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-primary" />服务器设置</CardTitle>
              <CardDescription>切换 API 与 WebSocket 服务器地址（切换后将重新登录）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="server_base_url">服务器地址</Label>
              <Input
                id="server_base_url"
                value={serverInput}
                onChange={(e) => setServerInput(e.target.value)}
                placeholder="https://api.huanvae.cn"
              />
              <div className="text-xs text-muted-foreground">当前生效: {initialApiBaseUrl}</div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApplyServer}>应用并重新登录</Button>
                <Button variant="outline" onClick={handleResetServer}>恢复默认并重新登录</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-primary" />{t('settings.languageRegion')}</CardTitle>
              <CardDescription>{t('settings.languageRegionDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.language')}</Label>
                <Select value={settings.language} onValueChange={(v) => settings.setSetting('language', v as LanguagePreference)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('settings.languageOptions.auto')}</SelectItem>
                    <SelectItem value="zh-CN">{t('settings.languageOptions.zhCN')}</SelectItem>
                    <SelectItem value="en-US">{t('settings.languageOptions.enUS')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SettingRow label={t('settings.use24h')} description={t('settings.use24hDesc')}>
                <Switch checked={settings.use24HourFormat} onCheckedChange={(v) => settings.setSetting('use24HourFormat', v)} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" />{t('settings.privacySecurity')}</CardTitle>
              <CardDescription>{t('settings.privacySecurityDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow label={t('settings.showOnline')} description={t('settings.showOnlineDesc')}>
                <Switch checked={settings.showOnlineStatus} onCheckedChange={(v) => settings.setSetting('showOnlineStatus', v)} />
              </SettingRow>
              <SettingRow label={t('settings.msgEncrypt')} description={t('settings.msgEncryptDesc')}>
                <Switch checked={settings.messageEncryption} onCheckedChange={(v) => settings.setSetting('messageEncryption', v)} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4 text-primary" />{t('settings.appearanceNotify')}</CardTitle>
              <CardDescription>{t('settings.appearanceNotifyDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.theme')}</Label>
                <Select value={settings.theme} onValueChange={(v) => settings.setSetting('theme', v as 'light' | 'dark' | 'auto')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('settings.themeLight')}</SelectItem>
                    <SelectItem value="dark">{t('settings.themeDark')}</SelectItem>
                    <SelectItem value="auto">{t('settings.themeAuto')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SettingRow label={t('settings.uiAnimation')} description={t('settings.uiAnimationDesc')}>
                <Switch checked={settings.animationsEnabled} onCheckedChange={(v) => settings.setSetting('animationsEnabled', v)} />
              </SettingRow>
              <SettingRow label={t('settings.particle')} description={t('settings.particleDesc')}>
                <Switch checked={settings.particleBackground} onCheckedChange={(v) => settings.setSetting('particleBackground', v)} />
              </SettingRow>
              <SettingRow
                label={t('settings.pushNotify')}
                description={t('settings.pushNotifyDesc')}
              >
                <Switch
                  checked={settings.notificationsEnabled}
                  onCheckedChange={async (v) => {
                    if (v) {
                      const permission = await requestNotificationPermission()
                      if (permission === 'granted') settings.setSetting('notificationsEnabled', true)
                    } else {
                      settings.setSetting('notificationsEnabled', false)
                    }
                  }}
                />
              </SettingRow>
              <SettingRow label={t('settings.soundNotify')} description={t('settings.soundNotifyDesc')}>
                <Switch checked={settings.soundEnabled} onCheckedChange={(v) => settings.setSetting('soundEnabled', v)} disabled={!settings.notificationsEnabled} />
              </SettingRow>

              {settings.soundEnabled && (
                <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5"><Volume2 className="h-4 w-4" />{t('settings.volume')}</span>
                    <span className="text-muted-foreground">{Math.round(settings.soundVolume * 100)}%</span>
                  </div>
                  <Slider
                    value={[settings.soundVolume]}
                    min={0}
                    max={1}
                    step={0.1}
                    onValueChange={(val) => settings.setSetting('soundVolume', val[0] ?? 0)}
                  />
                </div>
              )}

              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium"><Zap className="h-4 w-4" />{t('settings.notifyTest')}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => notifyInfo(t('settings.notifyInfoTitle'), t('settings.notifyInfoBody'))}>{t('settings.testInfo')}</Button>
                  <Button size="sm" variant="outline" onClick={() => notifySuccess(t('settings.notifySuccessTitle'), t('settings.notifySuccessBody'))}>{t('settings.testSuccess')}</Button>
                  <Button size="sm" variant="outline" onClick={() => notifyWarning(t('settings.notifyWarningTitle'), t('settings.notifyWarningBody'))}>{t('settings.testWarning')}</Button>
                  <Button size="sm" variant="outline" onClick={() => notifyError(t('settings.notifyErrorTitle'), t('settings.notifyErrorBody'))}>{t('settings.testError')}</Button>
                  <Button size="sm" variant="outline" onClick={() => notifyMessage(t('settings.notifyMessageTitle'), t('settings.notifyMessageBody'))}>{t('settings.testMessage')}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}