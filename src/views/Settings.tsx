'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, 
  Settings as SettingsIcon, 
  Wand2, 
  Globe, 
  Shield, 
  Palette, 
  Bell, 
  RotateCcw,
  Sparkles,
  Volume2
} from 'lucide-react'
import { playTap, playToggle, playButton } from '@/hooks/useSound'
import { useNotification, requestNotificationPermission } from '@/hooks/useNotification'
import * as Switch from '@radix-ui/react-switch'
import { GlassPage, GlassCard, GlassButton } from '@/components/ui/glass'
import { useSettingsStore } from '../store/settingsStore'
import { useApiConfigStore } from '../store/apiConfig'
import { useToast } from '../hooks/use-toast'

// 测试通知按钮组件
function TestNotificationButton() {
  const { notifyInfo, notifySuccess, notifyWarning, notifyError, notifyMessage } = useNotification()
  
  const testTypes = [
    { label: '信息', color: 'bg-blue-100 text-blue-600', fn: () => notifyInfo('测试通知', '这是一条信息通知') },
    { label: '成功', color: 'bg-emerald-100 text-emerald-600', fn: () => notifySuccess('操作成功', '您的设置已保存') },
    { label: '警告', color: 'bg-amber-100 text-amber-600', fn: () => notifyWarning('警告', '请注意检查设置') },
    { label: '错误', color: 'bg-red-100 text-red-600', fn: () => notifyError('发生错误', '请稍后重试') },
    { label: '消息', color: 'bg-violet-100 text-violet-600', fn: () => notifyMessage('新消息', '您收到一条新消息') },
  ]

  return (
    <div className="pt-3 border-t border-gray-100">
      <div className="text-sm font-medium text-gray-700 mb-2">测试通知效果</div>
      <div className="flex flex-wrap gap-2">
        {testTypes.map(({ label, color, fn }) => (
          <button
            key={label}
            onClick={() => {
              playButton()
              fn()
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all hover:scale-105 ${color}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

interface SettingsCardProps {
  title: string
  icon: React.ElementType
  iconColor: string
  children: React.ReactNode
}

function SettingsCard({ title, icon: Icon, iconColor, children }: SettingsCardProps) {
  return (
    <motion.div variants={staggerItem}>
      <GlassCard>
        <div className="flex items-center gap-2.5 mb-4">
          <div 
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ 
              background: `linear-gradient(135deg, ${iconColor}20 0%, ${iconColor}10 100%)`,
              border: `1px solid ${iconColor}25`,
              boxShadow: `0 3px 10px ${iconColor}12`,
            }}
          >
            <Icon className="h-4 w-4" style={{ color: iconColor }} />
          </div>
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        </div>
        <div className="space-y-4">
          {children}
        </div>
      </GlassCard>
    </motion.div>
  )
}

interface SettingRowProps {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-gray-700">{label}</div>
        {description && (
          <div className="text-xs text-gray-500 mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  )
}

interface CustomSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

function CustomSwitch({ checked, onCheckedChange, disabled }: CustomSwitchProps) {
  return (
    <Switch.Root
      className="w-11 h-6 rounded-full relative outline-none cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
      style={{
        background: checked 
          ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
          : 'rgba(148, 163, 184, 0.3)',
        boxShadow: checked ? '0 2px 8px rgba(59, 130, 246, 0.25)' : 'inset 0 1px 2px rgba(0,0,0,0.08)',
      }}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    >
      <Switch.Thumb 
        className="block w-[18px] h-[18px] bg-white rounded-full transition-transform duration-300 translate-x-[3px] will-change-transform data-[state=checked]:translate-x-[23px]"
        style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.12)' }}
      />
    </Switch.Root>
  )
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}

function CustomSelect({ value, onChange, options, disabled }: CustomSelectProps) {
  return (
    <select 
      className="w-full px-3 py-2 rounded-lg text-sm text-gray-700 outline-none cursor-pointer transition-all duration-200 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: 'rgba(255, 255, 255, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 2px rgba(255,255,255,0.9)',
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

export default function Settings() {
  const router = useRouter()
  const { toast } = useToast()
  const settings = useSettingsStore()
  const apiConfig = useApiConfigStore()

  const handleSave = () => {
    toast({ title: '保存成功', description: '设置已自动保存' })
  }

  const handleReset = () => {
    if (confirm('确定要重置所有设置吗？')) {
      settings.resetSettings()
      apiConfig.resetToDefault()
      toast({ title: '已重置', description: '所有设置已恢复默认值' })
    }
  }

  return (
    <GlassPage orbCount={4}>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* 返回按钮 */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-6"
        >
          <GlassButton variant="ghost" size="sm" onClick={() => router.push('/chat')}>
            <ArrowLeft size={16} />
            返回首页
          </GlassButton>
        </motion.div>

        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <SettingsIcon size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              设置中心
            </h1>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Sparkles size={12} />
              配置您的应用偏好（自动保存）
            </p>
          </div>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        >
          {/* AI 配置 */}
          <SettingsCard title="AI 配置" icon={Wand2} iconColor="#3b82f6">
            <SettingRow label="启用 AI 助手" description="自动回复和智能建议">
              <CustomSwitch
                checked={settings.aiEnabled}
                onCheckedChange={(checked) => settings.setSetting('aiEnabled', checked)}
              />
            </SettingRow>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">AI 模型</label>
              <CustomSelect
                value={settings.aiModel}
                onChange={(value) => settings.setSetting('aiModel', value)}
                options={[
                  { value: 'gpt-4', label: 'GPT-4' },
                  { value: 'gpt-3.5', label: 'GPT-3.5' },
                  { value: 'claude', label: 'Claude' },
                  { value: 'custom', label: '自定义' },
                ]}
                disabled={!settings.aiEnabled}
              />
            </div>

            <SettingRow label="自定义 API" description="使用自己的 AI 服务">
              <CustomSwitch
                checked={apiConfig.useCustomApi}
                onCheckedChange={(checked) => apiConfig.setApiConfig({ useCustomApi: checked })}
                disabled={!settings.aiEnabled}
              />
            </SettingRow>
          </SettingsCard>

          {/* 语言和地区 */}
          <SettingsCard title="语言和地区" icon={Globe} iconColor="#22c55e">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">界面语言</label>
              <CustomSelect
                value={settings.language}
                onChange={(value) => settings.setSetting('language', value)}
                options={[
                  { value: 'zh-CN', label: '简体中文' },
                  { value: 'zh-TW', label: '繁体中文' },
                  { value: 'en-US', label: 'English' },
                  { value: 'ja-JP', label: '日本語' },
                ]}
              />
            </div>

            <SettingRow label="24 小时制" description="使用 24 小时时间格式">
              <CustomSwitch
                checked={settings.use24HourFormat}
                onCheckedChange={(checked) => settings.setSetting('use24HourFormat', checked)}
              />
            </SettingRow>
          </SettingsCard>

          {/* 隐私和安全 */}
          <SettingsCard title="隐私和安全" icon={Shield} iconColor="#8b5cf6">
            <SettingRow label="在线状态" description="向其他人显示在线状态">
              <CustomSwitch
                checked={settings.showOnlineStatus}
                onCheckedChange={(checked) => settings.setSetting('showOnlineStatus', checked)}
              />
            </SettingRow>

            <SettingRow label="消息加密" description="端到端加密消息">
              <CustomSwitch
                checked={settings.messageEncryption}
                onCheckedChange={(checked) => settings.setSetting('messageEncryption', checked)}
              />
            </SettingRow>
          </SettingsCard>

          {/* 外观 */}
          <SettingsCard title="外观" icon={Palette} iconColor="#f97316">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">主题</label>
              <CustomSelect
                value={settings.theme}
                onChange={(value) => settings.setSetting('theme', value as 'light' | 'dark' | 'auto')}
                options={[
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                  { value: 'auto', label: '跟随系统' },
                ]}
              />
            </div>

            <SettingRow label="动画效果" description="启用界面动画">
              <CustomSwitch
                checked={settings.animationsEnabled}
                onCheckedChange={(checked) => {
                  settings.setSetting('animationsEnabled', checked)
                  playToggle()
                }}
              />
            </SettingRow>

            <SettingRow label="3D 粒子背景" description="登录/注册页面显示 Three.js 动态背景">
              <CustomSwitch
                checked={settings.particleBackground}
                onCheckedChange={(checked) => {
                  settings.setSetting('particleBackground', checked)
                  playToggle()
                }}
              />
            </SettingRow>
          </SettingsCard>

          {/* 通知 */}
          <SettingsCard title="通知" icon={Bell} iconColor="#ef4444">
            <SettingRow label="推送通知" description="接收消息推送通知">
              <CustomSwitch
                checked={settings.notificationsEnabled}
                onCheckedChange={async (checked) => {
                  if (checked) {
                    // 请求浏览器通知权限
                    const permission = await requestNotificationPermission()
                    if (permission === 'granted') {
                      settings.setSetting('notificationsEnabled', true)
                      playToggle()
                    }
                  } else {
                    settings.setSetting('notificationsEnabled', false)
                    playToggle()
                  }
                }}
              />
            </SettingRow>

            <SettingRow label="消息提示音" description="新消息时播放提示音">
              <CustomSwitch
                checked={settings.soundEnabled}
                onCheckedChange={(checked) => {
                  settings.setSetting('soundEnabled', checked)
                  if (checked) playToggle()
                }}
                disabled={!settings.notificationsEnabled}
              />
            </SettingRow>

            {settings.soundEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">音效音量</span>
                  <span className="text-xs text-gray-500">{Math.round(settings.soundVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.soundVolume}
                  onChange={(e) => {
                    settings.setSetting('soundVolume', parseFloat(e.target.value))
                    playTap()
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}

            <TestNotificationButton />
          </SettingsCard>
        </motion.div>

        {/* 底部按钮 */}
        <motion.div 
          className="mt-8 flex justify-end gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassButton variant="danger" onClick={handleReset}>
            <RotateCcw size={16} />
            重置所有设置
          </GlassButton>
          <GlassButton onClick={handleSave}>
            保存设置
          </GlassButton>
        </motion.div>
      </div>
    </GlassPage>
  )
}
