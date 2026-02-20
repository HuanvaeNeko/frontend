'use client'

import { useState, useCallback } from 'react'
import { 
  Settings,
  Globe,
  Palette,
  Bell,
  Volume2,
  Moon,
  Sun,
  Monitor,
  Check,
  Zap,
  Languages,
  Clock,
  Box,
  RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSettingsStore } from '@/store/settingsStore'
import { playTap, playButton, playPop } from '@/hooks/useSound'
import { useNotification, requestNotificationPermission } from '@/hooks/useNotification'

// ============================================
// 类型定义
// ============================================

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabId = 'general' | 'appearance' | 'notifications'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
}

// ============================================
// 常量
// ============================================

const TABS: Tab[] = [
  { id: 'general', label: '通用', icon: Globe },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'notifications', label: '通知', icon: Bell },
]

const THEMES = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'auto', label: '跟随系统', icon: Monitor },
] as const

const LANGUAGES = [
  { value: 'zh-CN', label: '简体中文', flag: '🇨🇳' },
  { value: 'zh-TW', label: '繁體中文', flag: '🇹🇼' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'ja', label: '日本語', flag: '🇯🇵' },
]

// 多语言文本
const i18n: Record<string, Record<string, string>> = {
  'zh-CN': {
    settings: '设置',
    autoSave: '自动保存',
    general: '通用',
    appearance: '外观',
    notifications: '通知',
    reset: '重置设置',
    language: '界面语言',
    hour24: '24 小时制',
    hour24Desc: '使用 24 小时时间格式',
    theme: '主题',
    light: '浅色',
    dark: '深色',
    auto: '跟随系统',
    animations: '动画效果',
    animationsDesc: '启用界面动画和过渡效果',
    particles: '3D 粒子背景',
    particlesDesc: '登录注册页显示 Three.js 动态背景',
    pushNotif: '推送通知',
    pushNotifDesc: '接收新消息推送通知',
    sound: '消息提示音',
    soundDesc: '新消息时播放提示音',
    volume: '音效音量',
    testNotif: '测试通知',
    info: '信息',
    success: '成功',
    warning: '警告',
    error: '错误',
    resetSuccess: '设置已重置',
    resetSuccessDesc: '所有设置已恢复默认值',
    notifEnabled: '通知已开启',
    notifEnabledDesc: '您将收到新消息提醒',
    notifFailed: '无法开启通知',
    notifFailedDesc: '请在浏览器设置中允许通知权限',
  },
  'zh-TW': {
    settings: '設定',
    autoSave: '自動儲存',
    general: '一般',
    appearance: '外觀',
    notifications: '通知',
    reset: '重設設定',
    language: '介面語言',
    hour24: '24 小時制',
    hour24Desc: '使用 24 小時時間格式',
    theme: '主題',
    light: '淺色',
    dark: '深色',
    auto: '跟隨系統',
    animations: '動畫效果',
    animationsDesc: '啟用介面動畫和過渡效果',
    particles: '3D 粒子背景',
    particlesDesc: '登入註冊頁顯示 Three.js 動態背景',
    pushNotif: '推送通知',
    pushNotifDesc: '接收新訊息推送通知',
    sound: '訊息提示音',
    soundDesc: '新訊息時播放提示音',
    volume: '音效音量',
    testNotif: '測試通知',
    info: '資訊',
    success: '成功',
    warning: '警告',
    error: '錯誤',
    resetSuccess: '設定已重設',
    resetSuccessDesc: '所有設定已恢復預設值',
    notifEnabled: '通知已開啟',
    notifEnabledDesc: '您將收到新訊息提醒',
    notifFailed: '無法開啟通知',
    notifFailedDesc: '請在瀏覽器設定中允許通知權限',
  },
  'en': {
    settings: 'Settings',
    autoSave: 'Auto-save',
    general: 'General',
    appearance: 'Appearance',
    notifications: 'Notifications',
    reset: 'Reset Settings',
    language: 'Language',
    hour24: '24-hour format',
    hour24Desc: 'Use 24-hour time format',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    auto: 'System',
    animations: 'Animations',
    animationsDesc: 'Enable UI animations and transitions',
    particles: '3D Particle Background',
    particlesDesc: 'Show Three.js background on login/register',
    pushNotif: 'Push Notifications',
    pushNotifDesc: 'Receive push notifications for new messages',
    sound: 'Notification Sound',
    soundDesc: 'Play sound for new messages',
    volume: 'Sound Volume',
    testNotif: 'Test Notification',
    info: 'Info',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
    resetSuccess: 'Settings Reset',
    resetSuccessDesc: 'All settings restored to defaults',
    notifEnabled: 'Notifications Enabled',
    notifEnabledDesc: 'You will receive new message alerts',
    notifFailed: 'Cannot Enable Notifications',
    notifFailedDesc: 'Please allow notification permissions in browser settings',
  },
  'ja': {
    settings: '設定',
    autoSave: '自動保存',
    general: '一般',
    appearance: '外観',
    notifications: '通知',
    reset: '設定をリセット',
    language: '言語',
    hour24: '24時間表示',
    hour24Desc: '24時間形式を使用',
    theme: 'テーマ',
    light: 'ライト',
    dark: 'ダーク',
    auto: 'システム',
    animations: 'アニメーション',
    animationsDesc: 'UIアニメーションを有効にする',
    particles: '3Dパーティクル背景',
    particlesDesc: 'ログイン/登録ページにThree.js背景を表示',
    pushNotif: 'プッシュ通知',
    pushNotifDesc: '新しいメッセージの通知を受け取る',
    sound: '通知音',
    soundDesc: '新しいメッセージの時に音を再生',
    volume: '音量',
    testNotif: '通知をテスト',
    info: '情報',
    success: '成功',
    warning: '警告',
    error: 'エラー',
    resetSuccess: '設定がリセットされました',
    resetSuccessDesc: 'すべての設定がデフォルトに戻りました',
    notifEnabled: '通知が有効になりました',
    notifEnabledDesc: '新しいメッセージの通知を受け取ります',
    notifFailed: '通知を有効にできません',
    notifFailedDesc: 'ブラウザ設定で通知を許可してください',
  },
}

// ============================================
// 子组件
// ============================================

// 设置项行
function SettingRow({
  icon: Icon,
  iconClass,
  label,
  description,
  children,
}: {
  icon: React.ElementType
  iconClass?: string
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted">
          <Icon className={`h-4 w-4 ${iconClass ?? 'text-primary'}`} />
        </div>
        <div>
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}

// 选项卡片
function OptionCard({
  selected,
  onClick,
  icon: Icon,
  label,
  description,
}: {
  selected: boolean
  onClick: () => void
  icon?: React.ElementType
  label: string
  description?: string
}) {
  return (
    <button
      onClick={() => {
        onClick()
        playTap()
      }}
      className={`
        relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all
        ${selected 
          ? 'border-primary bg-primary/5' 
          : 'border-border hover:border-ring/40 bg-card'
        }
      `}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}
      {Icon && <Icon className={`w-6 h-6 mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />}
      <span className={`text-sm font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
        {label}
      </span>
      {description && (
        <span className="text-xs text-muted-foreground mt-0.5">{description}</span>
      )}
    </button>
  )
}

// ============================================
// 设置面板内容
// ============================================

// 获取当前语言文本
function useI18n() {
  const { language } = useSettingsStore()
  return i18n[language] || i18n['zh-CN']
}

// 通用设置
function GeneralSettings() {
  const settings = useSettingsStore()
  const t = useI18n()

  return (
    <div className="space-y-1">
      <SettingRow 
        icon={Languages} 
        iconClass="text-primary"
        label={t.language}
      >
        <Select
          value={settings.language}
          onValueChange={(value) => {
            settings.setSetting('language', value)
            playTap()
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.flag} {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow 
        icon={Clock} 
        iconClass="text-primary"
        label={t.hour24}
        description={t.hour24Desc}
      >
        <Switch
          checked={settings.use24HourFormat}
          onCheckedChange={(checked) => {
            settings.setSetting('use24HourFormat', checked)
            playTap()
          }}
        />
      </SettingRow>
    </div>
  )
}

// 外观设置
function AppearanceSettings() {
  const settings = useSettingsStore()
  const t = useI18n()

  const handleThemeChange = (theme: 'light' | 'dark' | 'auto') => {
    settings.setSetting('theme', theme)
    applyTheme(theme)
  }

  const themeLabels = {
    light: t.light,
    dark: t.dark,
    auto: t.auto,
  }

  return (
    <div className="space-y-6">
      {/* 主题选择 */}
      <div>
        <div className="mb-3 text-sm font-medium">{t.theme}</div>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map(theme => (
            <OptionCard
              key={theme.value}
              selected={settings.theme === theme.value}
              onClick={() => handleThemeChange(theme.value)}
              icon={theme.icon}
              label={themeLabels[theme.value]}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <SettingRow 
          icon={Zap} 
          iconClass="text-primary"
          label={t.animations}
          description={t.animationsDesc}
        >
          <Switch
            checked={settings.animationsEnabled}
            onCheckedChange={(checked) => {
              settings.setSetting('animationsEnabled', checked)
              playTap()
            }}
          />
        </SettingRow>

        <SettingRow 
          icon={Box} 
          iconClass="text-primary"
          label={t.particles}
          description={t.particlesDesc}
        >
          <Switch
            checked={settings.particleBackground}
            onCheckedChange={(checked) => {
              settings.setSetting('particleBackground', checked)
              playTap()
            }}
          />
        </SettingRow>
      </div>
    </div>
  )
}

// 通知设置
function NotificationSettings() {
  const settings = useSettingsStore()
  const t = useI18n()
  const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotification()

  const handleNotificationToggle = async (checked: boolean) => {
    if (checked) {
      const permission = await requestNotificationPermission()
      if (permission === 'granted') {
        settings.setSetting('notificationsEnabled', true)
        notifySuccess(t.notifEnabled, t.notifEnabledDesc)
      } else {
        notifyError(t.notifFailed, t.notifFailedDesc)
      }
    } else {
      settings.setSetting('notificationsEnabled', false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <SettingRow 
          icon={Bell} 
          iconClass="text-primary"
          label={t.pushNotif}
          description={t.pushNotifDesc}
        >
          <Switch
            checked={settings.notificationsEnabled}
            onCheckedChange={handleNotificationToggle}
          />
        </SettingRow>

        <SettingRow 
          icon={Volume2} 
          iconClass="text-primary"
          label={t.sound}
          description={t.soundDesc}
        >
          <Switch
            checked={settings.soundEnabled}
            onCheckedChange={(checked) => {
              settings.setSetting('soundEnabled', checked)
              playTap()
            }}
            disabled={!settings.notificationsEnabled}
          />
        </SettingRow>
      </div>

      {settings.soundEnabled && (
        <Card>
          <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">{t.volume}</span>
            <span className="text-sm text-primary font-medium">{Math.round(settings.soundVolume * 100)}%</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.1}
            value={[settings.soundVolume]}
            onValueChange={(value) => {
              settings.setSetting('soundVolume', value[0] ?? 0)
              playTap()
            }}
          />
          </CardContent>
        </Card>
      )}

      {/* 测试通知 */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
        <div className="text-sm font-medium mb-3">{t.testNotif}</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t.info, fn: () => notifyInfo(t.info, t.info), color: 'bg-primary text-primary-foreground' },
            { label: t.success, fn: () => notifySuccess(t.success, t.success), color: 'bg-primary text-primary-foreground' },
            { label: t.warning, fn: () => notifyWarning(t.warning, t.warning), color: 'bg-secondary text-secondary-foreground' },
            { label: t.error, fn: () => notifyError(t.error, t.error), color: 'bg-destructive text-destructive-foreground' },
          ].map(item => (
            <Button
              key={item.label}
              onClick={() => {
                playButton()
                item.fn()
              }}
              className={` hover:opacity-90`}
              size="sm"
            >
              {item.label}
            </Button>
          ))}
        </div>
        </CardContent>
      </Card>
    </div>
  )
}

// 应用主题到 document
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  if (typeof document === 'undefined') return
  
  const root = document.documentElement
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', theme === 'dark')
  }
}

// ============================================
// 主组件
// ============================================

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const settings = useSettingsStore()
  const t = useI18n()
  const { notifySuccess } = useNotification()

  const handleClose = useCallback(() => {
    playPop()
    onClose()
  }, [onClose])

  const handleReset = useCallback(() => {
    settings.resetSettings()
    applyTheme('light') // 重置后应用默认主题
    notifySuccess(t.resetSuccess, t.resetSuccessDesc)
    playButton()
  }, [settings, notifySuccess, t])
  
  // Tab 标签多语言映射
  const tabLabels: Record<TabId, string> = {
    general: t.general,
    appearance: t.appearance,
    notifications: t.notifications,
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent showCloseButton={false} className="max-w-[680px] p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Settings className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>{t.settings}</DialogTitle>
              <DialogDescription>{t.autoSave}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as TabId)
            playTap()
          }}
          className="flex h-[min(80vh,620px)] flex-row max-md:flex-col"
          orientation="vertical"
        >
          <div className="hidden h-full w-52 border-r p-3 md:block">
            <TabsList className="h-auto w-full flex-col bg-transparent p-0">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="w-full justify-start gap-2 px-3 py-2.5">
                    <Icon className="h-4 w-4" />
                    {tabLabels[tab.id]}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            <Button variant="outline" className="mt-4 w-full justify-start gap-2 text-destructive" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              {t.reset}
            </Button>
          </div>

          <div className="border-b p-2 md:hidden">
            <TabsList className="grid w-full grid-cols-3">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
                    <Icon className="h-4 w-4" />
                    {tabLabels[tab.id]}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="general"><GeneralSettings /></TabsContent>
            <TabsContent value="appearance"><AppearanceSettings /></TabsContent>
            <TabsContent value="notifications"><NotificationSettings /></TabsContent>
          </div>

          <div className="border-t p-4 md:hidden">
            <Button variant="outline" className="w-full justify-center gap-2 text-destructive" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" />
              {t.reset}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// 导出 hook 方便使用
export function useSettingsModal() {
  const [isOpen, setIsOpen] = useState(false)
  
  const open = useCallback(() => {
    setIsOpen(true)
    playPop()
  }, [])
  
  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  return { isOpen, open, close }
}
