'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Settings as SettingsIcon, Wand2, Globe, Shield, Palette, Bell, RotateCcw } from 'lucide-react'
import * as Switch from '@radix-ui/react-switch'
import { useSettingsStore } from '../store/settingsStore'
import { useApiConfigStore } from '../store/apiConfig'
import { useToast } from '../hooks/use-toast'

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
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
    <motion.div
      className="p-6 rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.55) 100%)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1.5px solid rgba(255, 255, 255, 0.7)',
        boxShadow: '0 4px 24px rgba(147, 197, 253, 0.12), 0 2px 8px rgba(59, 130, 246, 0.08)',
      }}
      variants={staggerItem}
    >
      <div className="flex items-center gap-3 mb-6">
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ 
            background: `linear-gradient(135deg, ${iconColor}25 0%, ${iconColor}15 100%)`,
            border: `1px solid ${iconColor}30`,
          }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </div>
        <h3 className="text-lg font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="space-y-5">
        {children}
      </div>
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
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {description && (
          <div className="text-xs text-slate-500 mt-0.5">{description}</div>
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
      className="w-11 h-6 rounded-full relative outline-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: checked 
          ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
          : 'rgba(148, 163, 184, 0.3)',
      }}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    >
      <Switch.Thumb 
        className="block w-5 h-5 bg-white rounded-full transition-transform duration-200 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
      />
    </Switch.Root>
  )
}

export default function Settings() {
  const router = useRouter()
  const { toast } = useToast()
  const settings = useSettingsStore()
  const apiConfig = useApiConfigStore()

  const handleSave = () => {
    toast({
      title: '保存成功',
      description: '设置已自动保存',
    })
  }

  const handleReset = () => {
    if (confirm('确定要重置所有设置吗？')) {
      settings.resetSettings()
      apiConfig.resetToDefault()
      toast({
        title: '已重置',
        description: '所有设置已恢复默认值',
      })
    }
  }

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 25%, #ffffff 50%, #f0f9ff 75%, #e0f2fe 100%)',
      }}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-20 right-[10%] w-80 h-80 rounded-full blur-3xl"
          style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(14, 165, 233, 0.2))' }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 left-[10%] w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(167, 139, 250, 0.2))' }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.4, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-8 max-w-5xl">
        {/* 返回按钮 */}
        <motion.button
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-slate-600 font-medium mb-8"
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(147, 197, 253, 0.3)',
          }}
          onClick={() => router.push('/chat')}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileHover={{ background: 'rgba(147, 197, 253, 0.2)' }}
          whileTap={{ scale: 0.98 }}
        >
          <ArrowLeft size={18} />
          返回首页
        </motion.button>

        {/* 标题 */}
        <motion.div
          className="mb-8 flex items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div 
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 8px 30px rgba(59, 130, 246, 0.3)',
            }}
          >
            <SettingsIcon size={28} className="text-white" />
          </div>
          <div>
            <h1 
              className="text-3xl font-bold"
              style={{
                background: 'linear-gradient(135deg, #1e3a5f, #3b82f6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              设置中心
            </h1>
            <p className="text-slate-500">配置您的应用偏好设置（自动保存）</p>
          </div>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
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
              <label className="text-sm font-medium text-slate-700">AI 模型</label>
              <select 
                className="w-full px-4 py-2.5 rounded-xl text-slate-700 outline-none cursor-pointer"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                }}
                value={settings.aiModel}
                onChange={(e) => settings.setSetting('aiModel', e.target.value)}
                disabled={!settings.aiEnabled}
              >
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5">GPT-3.5</option>
                <option value="claude">Claude</option>
                <option value="custom">自定义</option>
              </select>
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
              <label className="text-sm font-medium text-slate-700">界面语言</label>
              <select 
                className="w-full px-4 py-2.5 rounded-xl text-slate-700 outline-none cursor-pointer"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                }}
                value={settings.language}
                onChange={(e) => settings.setSetting('language', e.target.value)}
              >
                <option value="zh-CN">简体中文</option>
                <option value="zh-TW">繁体中文</option>
                <option value="en-US">English</option>
                <option value="ja-JP">日本語</option>
              </select>
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
              <label className="text-sm font-medium text-slate-700">主题</label>
              <select 
                className="w-full px-4 py-2.5 rounded-xl text-slate-700 outline-none cursor-pointer"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(147, 197, 253, 0.3)',
                }}
                value={settings.theme}
                onChange={(e) => settings.setSetting('theme', e.target.value as 'light' | 'dark' | 'auto')}
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="auto">跟随系统</option>
              </select>
            </div>

            <SettingRow label="动画效果" description="启用界面动画">
              <CustomSwitch
                checked={settings.animationsEnabled}
                onCheckedChange={(checked) => settings.setSetting('animationsEnabled', checked)}
              />
            </SettingRow>
          </SettingsCard>

          {/* 通知 */}
          <SettingsCard title="通知" icon={Bell} iconColor="#ef4444">
            <SettingRow label="推送通知" description="接收消息推送通知">
              <CustomSwitch
                checked={settings.notificationsEnabled}
                onCheckedChange={(checked) => settings.setSetting('notificationsEnabled', checked)}
              />
            </SettingRow>

            <SettingRow label="消息提示音" description="新消息时播放提示音">
              <CustomSwitch
                checked={settings.soundEnabled}
                onCheckedChange={(checked) => settings.setSetting('soundEnabled', checked)}
                disabled={!settings.notificationsEnabled}
              />
            </SettingRow>
          </SettingsCard>
        </motion.div>

        {/* 底部按钮 */}
        <motion.div 
          className="mt-8 flex justify-end gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <motion.button 
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-slate-600"
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(147, 197, 253, 0.3)',
            }}
            onClick={handleReset}
            whileHover={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
            whileTap={{ scale: 0.98 }}
          >
            <RotateCcw size={16} />
            重置所有设置
          </motion.button>
          <motion.button 
            className="px-6 py-2.5 rounded-xl font-medium text-white"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
            }}
            onClick={handleSave}
            whileHover={{ boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)' }}
            whileTap={{ scale: 0.98 }}
          >
            保存设置
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}
