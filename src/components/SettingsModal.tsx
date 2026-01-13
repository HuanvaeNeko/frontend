'use client'

import { useState, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X,
  Settings,
  Sparkles,
  Globe,
  Shield,
  Palette,
  Bell,
  Volume2,
  Moon,
  Sun,
  Monitor,
  Check,
  ChevronRight,
  Zap,
  Lock,
  Eye,
  EyeOff,
  Languages,
  Clock,
  Box,
  RotateCcw
} from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'
import { playTap, playToggle, playButton, playPop } from '@/hooks/useSound'
import { useNotification, requestNotificationPermission } from '@/hooks/useNotification'

// ============================================
// 类型定义
// ============================================

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabId = 'general' | 'appearance' | 'notifications' | 'privacy' | 'ai'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
  color: string
}

// ============================================
// 常量
// ============================================

const TABS: Tab[] = [
  { id: 'general', label: '通用', icon: Settings, color: '#6366f1' },
  { id: 'appearance', label: '外观', icon: Palette, color: '#8b5cf6' },
  { id: 'notifications', label: '通知', icon: Bell, color: '#ef4444' },
  { id: 'privacy', label: '隐私', icon: Shield, color: '#10b981' },
  { id: 'ai', label: 'AI', icon: Sparkles, color: '#f59e0b' },
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

const AI_MODELS = [
  { value: 'gpt-4', label: 'GPT-4', desc: '最强大' },
  { value: 'gpt-3.5', label: 'GPT-3.5', desc: '快速' },
  { value: 'claude', label: 'Claude', desc: '擅长对话' },
]

// ============================================
// 子组件
// ============================================

// 开关组件
function Toggle({ 
  checked, 
  onChange, 
  disabled 
}: { 
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked)
        playToggle()
      }}
      className={`
        relative w-11 h-6 rounded-full transition-all duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${checked 
          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/25' 
          : 'bg-slate-200 dark:bg-slate-700'
        }
      `}
    >
      <span
        className={`
          absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md
          transition-transform duration-200 ease-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  )
}

// 设置项行
function SettingRow({
  icon: Icon,
  iconColor,
  label,
  description,
  children,
}: {
  icon: React.ElementType
  iconColor: string
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ 
            background: `linear-gradient(135deg, ${iconColor}20 0%, ${iconColor}10 100%)`,
          }}
        >
          <Icon className="w-4.5 h-4.5" style={{ color: iconColor }} />
        </div>
        <div>
          <div className="text-sm font-medium text-slate-800 dark:text-white">{label}</div>
          {description && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</div>
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
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' 
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
        }
      `}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      {Icon && <Icon className={`w-6 h-6 mb-2 ${selected ? 'text-indigo-600' : 'text-slate-500'}`} />}
      <span className={`text-sm font-medium ${selected ? 'text-indigo-600' : 'text-slate-700 dark:text-slate-300'}`}>
        {label}
      </span>
      {description && (
        <span className="text-xs text-slate-400 mt-0.5">{description}</span>
      )}
    </button>
  )
}

// 滑块组件
function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="relative w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          onChange(parseFloat(e.target.value))
          playTap()
        }}
        className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-indigo-500
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110
        "
        style={{
          background: `linear-gradient(to right, #6366f1 ${percentage}%, #e2e8f0 ${percentage}%)`,
        }}
      />
    </div>
  )
}

// ============================================
// 设置面板内容
// ============================================

// 通用设置
function GeneralSettings() {
  const settings = useSettingsStore()

  return (
    <div className="space-y-1">
      <SettingRow 
        icon={Languages} 
        iconColor="#6366f1" 
        label="界面语言"
      >
        <select
          value={settings.language}
          onChange={(e) => {
            settings.setSetting('language', e.target.value)
            playTap()
          }}
          className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 border-0 rounded-lg text-slate-700 dark:text-slate-300 cursor-pointer focus:ring-2 focus:ring-indigo-500"
        >
          {LANGUAGES.map(lang => (
            <option key={lang.value} value={lang.value}>
              {lang.flag} {lang.label}
            </option>
          ))}
        </select>
      </SettingRow>

      <SettingRow 
        icon={Clock} 
        iconColor="#8b5cf6" 
        label="24 小时制"
        description="使用 24 小时时间格式"
      >
        <Toggle
          checked={settings.use24HourFormat}
          onChange={(checked) => settings.setSetting('use24HourFormat', checked)}
        />
      </SettingRow>
    </div>
  )
}

// 外观设置
function AppearanceSettings() {
  const settings = useSettingsStore()

  return (
    <div className="space-y-6">
      {/* 主题选择 */}
      <div>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">主题</div>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map(theme => (
            <OptionCard
              key={theme.value}
              selected={settings.theme === theme.value}
              onClick={() => settings.setSetting('theme', theme.value)}
              icon={theme.icon}
              label={theme.label}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <SettingRow 
          icon={Zap} 
          iconColor="#f59e0b" 
          label="动画效果"
          description="启用界面动画和过渡效果"
        >
          <Toggle
            checked={settings.animationsEnabled}
            onChange={(checked) => settings.setSetting('animationsEnabled', checked)}
          />
        </SettingRow>

        <SettingRow 
          icon={Box} 
          iconColor="#8b5cf6" 
          label="3D 粒子背景"
          description="登录注册页显示 Three.js 动态背景"
        >
          <Toggle
            checked={settings.particleBackground}
            onChange={(checked) => settings.setSetting('particleBackground', checked)}
          />
        </SettingRow>
      </div>
    </div>
  )
}

// 通知设置
function NotificationSettings() {
  const settings = useSettingsStore()
  const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotification()

  const handleNotificationToggle = async (checked: boolean) => {
    if (checked) {
      const permission = await requestNotificationPermission()
      if (permission === 'granted') {
        settings.setSetting('notificationsEnabled', true)
        notifySuccess('通知已开启', '您将收到新消息提醒')
      } else {
        notifyError('无法开启通知', '请在浏览器设置中允许通知权限')
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
          iconColor="#ef4444" 
          label="推送通知"
          description="接收新消息推送通知"
        >
          <Toggle
            checked={settings.notificationsEnabled}
            onChange={handleNotificationToggle}
          />
        </SettingRow>

        <SettingRow 
          icon={Volume2} 
          iconColor="#6366f1" 
          label="消息提示音"
          description="新消息时播放提示音"
        >
          <Toggle
            checked={settings.soundEnabled}
            onChange={(checked) => settings.setSetting('soundEnabled', checked)}
            disabled={!settings.notificationsEnabled}
          />
        </SettingRow>
      </div>

      {settings.soundEnabled && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">音效音量</span>
            <span className="text-sm text-indigo-600 font-medium">{Math.round(settings.soundVolume * 100)}%</span>
          </div>
          <Slider
            value={settings.soundVolume}
            onChange={(value) => settings.setSetting('soundVolume', value)}
          />
        </div>
      )}

      {/* 测试通知 */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">测试通知</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '信息', fn: () => notifyInfo('测试', '信息通知'), color: 'bg-blue-500' },
            { label: '成功', fn: () => notifySuccess('成功', '操作完成'), color: 'bg-emerald-500' },
            { label: '警告', fn: () => notifyWarning('警告', '请注意'), color: 'bg-amber-500' },
            { label: '错误', fn: () => notifyError('错误', '出错了'), color: 'bg-red-500' },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => {
                playButton()
                item.fn()
              }}
              className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg ${item.color} hover:opacity-90 transition-opacity`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// 隐私设置
function PrivacySettings() {
  const settings = useSettingsStore()

  return (
    <div className="space-y-1">
      <SettingRow 
        icon={Eye} 
        iconColor="#10b981" 
        label="在线状态"
        description="向其他人显示您的在线状态"
      >
        <Toggle
          checked={settings.showOnlineStatus}
          onChange={(checked) => settings.setSetting('showOnlineStatus', checked)}
        />
      </SettingRow>

      <SettingRow 
        icon={Lock} 
        iconColor="#6366f1" 
        label="消息加密"
        description="启用端到端消息加密"
      >
        <Toggle
          checked={settings.messageEncryption}
          onChange={(checked) => settings.setSetting('messageEncryption', checked)}
        />
      </SettingRow>
    </div>
  )
}

// AI 设置
function AISettings() {
  const settings = useSettingsStore()

  return (
    <div className="space-y-6">
      <SettingRow 
        icon={Sparkles} 
        iconColor="#f59e0b" 
        label="AI 助手"
        description="启用智能回复和建议"
      >
        <Toggle
          checked={settings.aiEnabled}
          onChange={(checked) => settings.setSetting('aiEnabled', checked)}
        />
      </SettingRow>

      {settings.aiEnabled && (
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">AI 模型</div>
          <div className="grid grid-cols-3 gap-3">
            {AI_MODELS.map(model => (
              <OptionCard
                key={model.value}
                selected={settings.aiModel === model.value}
                onClick={() => settings.setSetting('aiModel', model.value)}
                label={model.label}
                description={model.desc}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// 主组件
// ============================================

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const settings = useSettingsStore()
  const { notifySuccess } = useNotification()

  const handleClose = useCallback(() => {
    playPop()
    onClose()
  }, [onClose])

  const handleReset = useCallback(() => {
    settings.resetSettings()
    notifySuccess('设置已重置', '所有设置已恢复默认值')
    playButton()
  }, [settings, notifySuccess])

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />
      case 'appearance':
        return <AppearanceSettings />
      case 'notifications':
        return <NotificationSettings />
      case 'privacy':
        return <PrivacySettings />
      case 'ai':
        return <AISettings />
      default:
        return null
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
          />

          {/* 模态框 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[680px] md:max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl z-[9999] flex flex-col overflow-hidden"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">设置</h2>
                  <p className="text-xs text-slate-500">自动保存</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="flex flex-1 overflow-hidden">
              {/* 侧边栏 */}
              <div className="w-48 shrink-0 border-r border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/50 max-md:hidden">
                <nav className="space-y-1">
                  {TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id)
                          playTap()
                        }}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                          ${isActive 
                            ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' 
                            : 'text-slate-600 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-700/50'
                          }
                        `}
                      >
                        <Icon 
                          className="w-4.5 h-4.5" 
                          style={{ color: isActive ? tab.color : undefined }} 
                        />
                        {tab.label}
                      </button>
                    )
                  })}
                </nav>

                {/* 重置按钮 */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    重置设置
                  </button>
                </div>
              </div>

              {/* 移动端 Tab 栏 */}
              <div className="md:hidden w-full border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 overflow-x-auto">
                <div className="flex p-2 gap-1">
                  {TABS.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(tab.id)
                          playTap()
                        }}
                        className={`
                          flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                          ${isActive 
                            ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' 
                            : 'text-slate-600 dark:text-slate-400'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4" style={{ color: isActive ? tab.color : undefined }} />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 设置内容 */}
              <div className="flex-1 overflow-y-auto p-6 max-md:p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderContent()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* 移动端底部重置按钮 */}
            <div className="md:hidden px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-xl transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                重置所有设置
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
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
