'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X,
  User as UserIcon,
  Camera,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Mail,
  Calendar,
  Shield,
  RefreshCw,
  Edit3,
  Check,
  Info
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useProfileStore } from '@/store/profileStore'
import { useAuthStore } from '@/store/authStore'
import { profileApi } from '@/api/profile'
import { useToast } from '@/hooks/use-toast'
import { playTap, playToggle, playButton, playPop } from '@/hooks/useSound'

// ============================================
// 类型定义
// ============================================

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

type TabId = 'profile' | 'password' | 'account'

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
  { id: 'profile', label: '基本信息', icon: Edit3, color: '#6366f1' },
  { id: 'password', label: '修改密码', icon: Lock, color: '#8b5cf6' },
  { id: 'account', label: '账户信息', icon: Shield, color: '#10b981' },
]

// ============================================
// 子组件
// ============================================

// 设置项行
function SettingRow({
  icon: Icon,
  iconColor,
  label,
  value,
  description,
}: {
  icon: React.ElementType
  iconColor: string
  label: string
  value?: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
      <div className="flex items-center gap-3">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ 
            background: `linear-gradient(135deg, ${iconColor}20 0%, ${iconColor}10 100%)`,
          }}
        >
          <Icon className="w-4.5 h-4.5" style={{ color: iconColor }} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 dark:text-white">{label}</div>
          {description && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</div>
          )}
        </div>
      </div>
      {value && (
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate ml-4">
          {value}
        </span>
      )}
    </div>
  )
}

// 玻璃态输入框
function GlassInput({
  icon: Icon,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  maxLength,
  showCount,
  rightElement,
}: {
  icon?: React.ElementType
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  maxLength?: number
  showCount?: boolean
  rightElement?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <div className="relative flex items-center gap-2">
        <div className={`
          flex-1 flex items-center gap-2.5 px-3 py-2.5
          bg-white/60 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80
          backdrop-blur-lg transition-all duration-200
          focus-within:border-indigo-400 focus-within:bg-white/80 dark:focus-within:bg-slate-800/80
          focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]
          ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
        `}>
          {Icon && <Icon className="w-4 h-4 text-slate-400 shrink-0" />}
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            maxLength={maxLength}
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-white placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
        </div>
        {rightElement}
      </div>
      {showCount && maxLength && (
        <div className="text-xs text-slate-400 text-right">{value.length}/{maxLength}</div>
      )}
    </div>
  )
}

// 玻璃态文本区域
function GlassTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  showCount,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  showCount?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`
          w-full px-3 py-2.5 min-h-[100px] resize-none
          bg-white/60 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80
          backdrop-blur-lg transition-all duration-200
          focus:border-indigo-400 focus:bg-white/80 dark:focus:bg-slate-800/80 focus:outline-none
          focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]
          text-sm text-slate-800 dark:text-white placeholder:text-slate-400
        `}
      />
      {showCount && maxLength && (
        <div className="text-xs text-slate-400 text-right">{value.length}/{maxLength}</div>
      )}
    </div>
  )
}

// ============================================
// 设置面板内容
// ============================================

// 基本信息面板
function ProfileSettings({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast()
  const { profile, isLoading, loadProfile, updateProfile } = useProfileStore()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    email: '',
    signature: '',
  })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const displayName = profile?.user_nickname || user?.nickname || '用户'

  useEffect(() => {
    loadProfile().catch(console.error)
  }, [loadProfile])

  useEffect(() => {
    if (profile) {
      setFormData({
        email: profile.user_email || '',
        signature: profile.user_signature || '',
      })
    }
  }, [profile])

  useEffect(() => {
    if (profile) {
      const emailChanged = formData.email !== (profile.user_email || '')
      const signatureChanged = formData.signature !== (profile.user_signature || '')
      setHasChanges(emailChanged || signatureChanged)
    }
  }, [formData, profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    playButton()
    try {
      await updateProfile(formData)
      toast({ title: '成功', description: '个人资料已更新' })
      setHasChanges(false)
      onSaved()
    } catch (error) {
      toast({
        title: '更新失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    }
  }

  const handleAvatarClick = () => {
    playTap()
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      await profileApi.uploadAvatar(file)
      await loadProfile()
      toast({ title: '成功', description: '头像上传成功' })
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleReset = () => {
    playTap()
    setFormData({
      email: profile?.user_email || '',
      signature: profile?.user_signature || '',
    })
  }

  return (
    <div className="space-y-6">
      {/* 头像区域 */}
      <div className="flex flex-col items-center py-4">
        <div className="relative group mb-3">
          <Avatar className="h-24 w-24 ring-4 ring-white dark:ring-slate-700 shadow-xl">
            <AvatarImage src={profile?.user_avatar_url || ''} alt={displayName} />
            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-2xl font-bold">
              {displayName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <motion.button
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {uploadingAvatar ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Camera className="h-6 w-6 text-white" />
            )}
          </motion.button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleAvatarChange}
        />
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{displayName}</h3>
        <p className="text-xs text-slate-500">点击头像更换</p>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <GlassInput
          icon={UserIcon}
          label="昵称"
          value={displayName}
          onChange={() => {}}
          disabled
        />

        <GlassInput
          icon={Mail}
          label="邮箱"
          type="email"
          value={formData.email}
          onChange={(v) => setFormData({ ...formData, email: v })}
          placeholder="your@email.com"
        />

        <GlassTextarea
          label="个性签名"
          value={formData.signature}
          onChange={(v) => setFormData({ ...formData, signature: v })}
          placeholder="介绍一下自己吧..."
          maxLength={200}
          showCount
        />

        <div className="flex gap-3 pt-2">
          <motion.button
            type="submit"
            disabled={isLoading || !hasChanges}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
              transition-all duration-200
              ${hasChanges 
                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            保存更改
          </motion.button>
          <motion.button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges}
            whileHover={{ scale: hasChanges ? 1.02 : 1 }}
            whileTap={{ scale: hasChanges ? 0.98 : 1 }}
            className={`
              flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
              ${hasChanges 
                ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }
            `}
          >
            <RefreshCw className="w-4 h-4" />
            重置
          </motion.button>
        </div>
      </form>
    </div>
  )
}

// 修改密码面板
function PasswordSettings() {
  const { toast } = useToast()
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState({
    old: false,
    new: false,
    confirm: false,
  })
  const [changingPassword, setChangingPassword] = useState(false)

  const canSubmit = passwordData.oldPassword && passwordData.newPassword && passwordData.confirmPassword

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    playButton()

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: '错误', description: '两次输入的新密码不一致', variant: 'destructive' })
      return
    }

    if (passwordData.newPassword.length < 6) {
      toast({ title: '错误', description: '新密码长度至少 6 位', variant: 'destructive' })
      return
    }

    setChangingPassword(true)
    try {
      await profileApi.changePassword({
        old_password: passwordData.oldPassword,
        new_password: passwordData.newPassword,
      })
      toast({ title: '成功', description: '密码修改成功' })
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      toast({
        title: '修改失败',
        description: error instanceof Error ? error.message : '旧密码可能不正确',
        variant: 'destructive',
      })
    } finally {
      setChangingPassword(false)
    }
  }

  const togglePassword = (field: 'old' | 'new' | 'confirm') => {
    playToggle()
    setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] })
  }

  return (
    <form onSubmit={handleChangePassword} className="space-y-4">
      <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/50 dark:border-amber-800/30">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium mb-1">密码安全提示</p>
            <ul className="text-xs space-y-0.5 text-amber-700 dark:text-amber-300">
              <li>• 新密码长度至少 6 位</li>
              <li>• 建议使用字母、数字和符号的组合</li>
            </ul>
          </div>
        </div>
      </div>

      <GlassInput
        icon={Lock}
        label="当前密码"
        type={showPasswords.old ? 'text' : 'password'}
        value={passwordData.oldPassword}
        onChange={(v) => setPasswordData({ ...passwordData, oldPassword: v })}
        placeholder="输入当前密码"
        rightElement={
          <button
            type="button"
            onClick={() => togglePassword('old')}
            className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all"
          >
            {showPasswords.old ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <GlassInput
        icon={Lock}
        label="新密码"
        type={showPasswords.new ? 'text' : 'password'}
        value={passwordData.newPassword}
        onChange={(v) => setPasswordData({ ...passwordData, newPassword: v })}
        placeholder="至少 6 位"
        rightElement={
          <button
            type="button"
            onClick={() => togglePassword('new')}
            className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all"
          >
            {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <GlassInput
        icon={Lock}
        label="确认新密码"
        type={showPasswords.confirm ? 'text' : 'password'}
        value={passwordData.confirmPassword}
        onChange={(v) => setPasswordData({ ...passwordData, confirmPassword: v })}
        placeholder="再次输入新密码"
        rightElement={
          <button
            type="button"
            onClick={() => togglePassword('confirm')}
            className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-all"
          >
            {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <motion.button
        type="submit"
        disabled={changingPassword || !canSubmit}
        whileHover={{ scale: canSubmit ? 1.02 : 1 }}
        whileTap={{ scale: canSubmit ? 0.98 : 1 }}
        className={`
          w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
          transition-all duration-200
          ${canSubmit 
            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40' 
            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
          }
        `}
      >
        {changingPassword ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Lock className="w-4 h-4" />
        )}
        修改密码
      </motion.button>
    </form>
  )
}

// 账户信息面板
function AccountSettings() {
  const { profile } = useProfileStore()
  const { user } = useAuthStore()

  return (
    <div className="space-y-1">
      <SettingRow
        icon={UserIcon}
        iconColor="#6366f1"
        label="用户 ID"
        value={profile?.user_id || user?.user_id || '-'}
      />
      <SettingRow
        icon={Shield}
        iconColor={profile?.admin === 'true' ? '#8b5cf6' : '#64748b'}
        label="账户类型"
        value={profile?.admin === 'true' ? '管理员' : '普通用户'}
      />
      <SettingRow
        icon={Calendar}
        iconColor="#10b981"
        label="注册时间"
        value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '-'}
      />
      <SettingRow
        icon={Calendar}
        iconColor="#f59e0b"
        label="最后更新"
        value={profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('zh-CN') : '-'}
      />
    </div>
  )
}

// ============================================
// 主组件
// ============================================

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('profile')

  const handleClose = useCallback(() => {
    playPop()
    onClose()
  }, [onClose])

  const handleSaved = useCallback(() => {
    // 可以在保存后做一些操作
  }, [])

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileSettings onSaved={handleSaved} />
      case 'password':
        return <PasswordSettings />
      case 'account':
        return <AccountSettings />
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
            className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[600px] md:max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl z-[9999] flex flex-col overflow-hidden"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white">个人资料</h2>
                  <p className="text-xs text-slate-500">管理您的个人信息</p>
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
              {/* 侧边栏 - 桌面端 */}
              <div className="w-44 shrink-0 border-r border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-800/50 max-md:hidden">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
