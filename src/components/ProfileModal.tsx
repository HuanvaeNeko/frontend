'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
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
}

// ============================================
// 常量
// ============================================

const TABS: Tab[] = [
  { id: 'profile', label: '基本信息', icon: Edit3 },
  { id: 'password', label: '修改密码', icon: Lock },
  { id: 'account', label: '账户信息', icon: Shield },
]

// ============================================
// 子组件
// ============================================

// 设置项行
function SettingRow({
  icon: Icon,
  iconClass,
  label,
  value,
  description,
}: {
  icon: React.ElementType
  iconClass?: string
  label: string
  value?: string
  description?: string
}) {
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-muted">
          <Icon className={`h-4 w-4 ${iconClass ?? 'text-primary'}`} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
          )}
        </div>
      </div>
      {value && (
        <span className="ml-4 truncate text-sm font-medium text-muted-foreground">
          {value}
        </span>
      )}
    </div>
  )
}

// 玻璃态输入框
function FormInput({
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative flex items-center gap-2">
        {Icon && <Icon className="absolute left-3 h-4 w-4 text-muted-foreground" />}
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          className={`${Icon ? 'pl-9' : ''} ${rightElement ? 'pr-11' : ''}`}
        />
        {rightElement}
      </div>
      {showCount && maxLength && (
        <div className="text-right text-xs text-muted-foreground">{value.length}/{maxLength}</div>
      )}
    </div>
  )
}

// 玻璃态文本区域
function FormTextarea({
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
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-h-[100px] resize-none"
      />
      {showCount && maxLength && (
        <div className="text-right text-xs text-muted-foreground">{value.length}/{maxLength}</div>
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
          <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
            <AvatarImage src={profile?.user_avatar_url || ''} alt={displayName} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {displayName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <motion.button
            onClick={handleAvatarClick}
            disabled={uploadingAvatar}
            className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {uploadingAvatar ? (
              <Loader2 className="h-6 w-6 text-background animate-spin" />
            ) : (
              <Camera className="h-6 w-6 text-background" />
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
        <h3 className="text-lg font-semibold">{displayName}</h3>
        <p className="text-xs text-muted-foreground">点击头像更换</p>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormInput
          icon={UserIcon}
          label="昵称"
          value={displayName}
          onChange={() => {}}
          disabled
        />

        <FormInput
          icon={Mail}
          label="邮箱"
          type="email"
          value={formData.email}
          onChange={(v) => setFormData({ ...formData, email: v })}
          placeholder="your@email.com"
        />

        <FormTextarea
          label="个性签名"
          value={formData.signature}
          onChange={(v) => setFormData({ ...formData, signature: v })}
          placeholder="介绍一下自己吧..."
          maxLength={200}
          showCount
        />

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={isLoading || !hasChanges}
            className={`
              flex-1 h-10
              ${hasChanges 
                ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                : ''
              }
            `}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            保存更改
          </Button>
          <Button
            type="button"
            onClick={handleReset}
            disabled={!hasChanges}
            variant="outline"
            className="h-10"
          >
            <RefreshCw className="w-4 h-4" />
            重置
          </Button>
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
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm text-foreground">
            <p className="font-medium mb-1">密码安全提示</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              <li>• 新密码长度至少 6 位</li>
              <li>• 建议使用字母、数字和符号的组合</li>
            </ul>
          </div>
        </div>
      </div>

      <FormInput
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
            className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPasswords.old ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <FormInput
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
            className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <FormInput
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
            className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        }
      />

      <Button
        type="submit"
        disabled={changingPassword || !canSubmit}
        className={`
          w-full h-10
          ${canSubmit 
            ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
            : ''
          }
        `}
      >
        {changingPassword ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Lock className="w-4 h-4" />
        )}
        修改密码
      </Button>
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
        iconClass="text-primary"
        label="用户 ID"
        value={profile?.user_id || user?.user_id || '-'}
      />
      <SettingRow
        icon={Shield}
        iconClass={profile?.admin === 'true' ? 'text-primary' : 'text-muted-foreground'}
        label="账户类型"
        value={profile?.admin === 'true' ? '管理员' : '普通用户'}
      />
      <SettingRow
        icon={Calendar}
        iconClass="text-primary"
        label="注册时间"
        value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '-'}
      />
      <SettingRow
        icon={Calendar}
        iconClass="text-primary"
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
      <DialogContent showCloseButton={false} className="max-w-[600px] p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <UserIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>个人资料</DialogTitle>
              <DialogDescription>管理您的个人信息</DialogDescription>
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
          <div className="hidden h-full w-48 border-r p-3 md:block">
            <TabsList className="h-auto w-full flex-col bg-transparent p-0">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="w-full justify-start gap-2 px-3 py-2.5">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="border-b p-2 md:hidden">
            <TabsList className="grid w-full grid-cols-3">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <TabsContent value="profile"><ProfileSettings onSaved={handleSaved} /></TabsContent>
            <TabsContent value="password"><PasswordSettings /></TabsContent>
            <TabsContent value="account"><AccountSettings /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
