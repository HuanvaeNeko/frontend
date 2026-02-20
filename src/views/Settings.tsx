'use client'

import { useRouter } from 'next/navigation'
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
import { useSettingsStore } from '../store/settingsStore'
import { useApiConfigStore } from '../store/apiConfig'
import { useToast } from '../hooks/use-toast'
import { useNotification, requestNotificationPermission } from '@/hooks/useNotification'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

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
  const { toast } = useToast()
  const settings = useSettingsStore()
  const apiConfig = useApiConfigStore()
  const { notifyInfo, notifySuccess, notifyWarning, notifyError, notifyMessage } = useNotification()

  const handleReset = () => {
    if (!confirm('确定要重置所有设置吗？')) return
    settings.resetSettings()
    apiConfig.resetToDefault()
    toast({ title: '已重置', description: '所有设置已恢复默认值' })
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-8 md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => router.push('/chat')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">设置中心</h1>
              <p className="text-sm text-muted-foreground">修改外观、通知与隐私偏好</p>
            </div>
          </div>
          <Button variant="destructive" onClick={handleReset} className="gap-2">
            <RotateCcw className="h-4 w-4" />重置
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" />AI 配置</CardTitle>
              <CardDescription>AI 助手与接口设置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingRow label="启用 AI 助手" description="在聊天中启用智能能力">
                <Switch checked={settings.aiEnabled} onCheckedChange={(v) => settings.setSetting('aiEnabled', v)} />
              </SettingRow>

              <div className="space-y-2">
                <Label>AI 模型</Label>
                <Select value={settings.aiModel} onValueChange={(v) => settings.setSetting('aiModel', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-3.5">GPT-3.5</SelectItem>
                    <SelectItem value="claude">Claude</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SettingRow label="使用自定义 API" description="使用你自己的 AI 服务地址">
                <Switch checked={apiConfig.useCustomApi} onCheckedChange={(v) => apiConfig.setApiConfig({ useCustomApi: v })} disabled={!settings.aiEnabled} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-primary" />语言与地区</CardTitle>
              <CardDescription>界面语言和时间格式</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>界面语言</Label>
                <Select value={settings.language} onValueChange={(v) => settings.setSetting('language', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                    <SelectItem value="zh-TW">繁体中文</SelectItem>
                    <SelectItem value="en-US">English</SelectItem>
                    <SelectItem value="ja-JP">日本語</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <SettingRow label="24 小时制" description="时间显示格式">
                <Switch checked={settings.use24HourFormat} onCheckedChange={(v) => settings.setSetting('use24HourFormat', v)} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" />隐私与安全</CardTitle>
              <CardDescription>隐私可见性和消息保护</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow label="显示在线状态" description="让其他用户看到你的在线状态">
                <Switch checked={settings.showOnlineStatus} onCheckedChange={(v) => settings.setSetting('showOnlineStatus', v)} />
              </SettingRow>
              <SettingRow label="消息加密" description="启用消息传输加密">
                <Switch checked={settings.messageEncryption} onCheckedChange={(v) => settings.setSetting('messageEncryption', v)} />
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Palette className="h-4 w-4 text-primary" />外观与通知</CardTitle>
              <CardDescription>主题、动画与消息通知</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>主题</Label>
                <Select value={settings.theme} onValueChange={(v) => settings.setSetting('theme', v as 'light' | 'dark' | 'auto')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                    <SelectItem value="auto">跟随系统</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <SettingRow label="界面动画" description="启用页面过渡和动效">
                <Switch checked={settings.animationsEnabled} onCheckedChange={(v) => settings.setSetting('animationsEnabled', v)} />
              </SettingRow>
              <SettingRow label="粒子背景" description="登录和注册页的背景特效">
                <Switch checked={settings.particleBackground} onCheckedChange={(v) => settings.setSetting('particleBackground', v)} />
              </SettingRow>
              <SettingRow
                label="推送通知"
                description="浏览器消息通知"
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
              <SettingRow label="消息提示音" description="收到消息时播放音效">
                <Switch checked={settings.soundEnabled} onCheckedChange={(v) => settings.setSetting('soundEnabled', v)} disabled={!settings.notificationsEnabled} />
              </SettingRow>

              {settings.soundEnabled && (
                <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1.5"><Volume2 className="h-4 w-4" />音量</span>
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
                <div className="inline-flex items-center gap-1.5 text-sm font-medium"><Zap className="h-4 w-4" />通知测试</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => notifyInfo('信息', '这是一条信息通知')}>信息</Button>
                  <Button size="sm" variant="outline" onClick={() => notifySuccess('成功', '设置已保存')}>成功</Button>
                  <Button size="sm" variant="outline" onClick={() => notifyWarning('警告', '请检查设置')}>警告</Button>
                  <Button size="sm" variant="outline" onClick={() => notifyError('错误', '操作失败')}>错误</Button>
                  <Button size="sm" variant="outline" onClick={() => notifyMessage('新消息', '你收到一条消息')}>消息</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
