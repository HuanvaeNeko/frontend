'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, 
  User as UserIcon, 
  Camera, 
  Loader2, 
  Lock, 
  Eye, 
  EyeOff,
  Mail,
  Calendar,
  Shield,
  RefreshCw
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GlassPage, GlassCard, GlassButton, GlassInput, GlassTextarea } from '@/components/ui/glass'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { profileApi } from '../api/profile'
import { useToast } from '../hooks/use-toast'

export default function Profile() {
  const router = useRouter()
  const { toast } = useToast()
  const { profile, isLoading, loadProfile, updateProfile } = useProfileStore()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    email: '',
    signature: '',
  })

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

  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile(formData)
      toast({ title: '成功', description: '个人资料已更新' })
    } catch (error) {
      toast({
        title: '更新失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    }
  }

  const handleAvatarClick = () => fileInputRef.current?.click()

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

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

  const displayName = profile?.user_nickname || user?.nickname || '用户'

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

        {/* 页面标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 flex items-center gap-3"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <UserIcon size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              个人资料
            </h1>
            <p className="text-sm text-gray-500">管理您的个人信息</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 头像卡片 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard className="text-center">
              <div className="flex flex-col items-center">
                {/* 头像 */}
                <div className="relative group mb-4">
                  <Avatar className="h-32 w-32 ring-4 ring-white shadow-xl">
                    <AvatarImage src={profile?.user_avatar_url || ''} alt={displayName} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-3xl font-bold">
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
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    ) : (
                      <Camera className="h-8 w-8 text-white" />
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
                <p className="text-xs text-gray-400 mb-4">点击头像更换</p>
                <h3 className="text-xl font-bold text-gray-800">{displayName}</h3>
                <p className="text-sm text-gray-500">ID: {profile?.user_id || user?.user_id}</p>
              </div>
            </GlassCard>
          </motion.div>

          {/* 基本信息 */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <GlassCard>
              <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Mail size={18} className="text-blue-500" />
                基本信息
              </h3>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">昵称</label>
                  <GlassInput
                    value={displayName}
                    disabled
                    className="opacity-60"
                  />
                  <p className="text-xs text-gray-400 mt-1">昵称暂不支持修改</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
                  <GlassInput
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                    icon={<Mail size={16} />}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">个性签名</label>
                  <GlassTextarea
                    value={formData.signature}
                    onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
                    placeholder="介绍一下自己吧..."
                    className="min-h-[100px]"
                    maxLength={200}
                  />
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    {formData.signature.length}/200
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <GlassButton type="submit" loading={isLoading}>
                    保存更改
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="secondary"
                    onClick={() => setFormData({
                      email: profile?.user_email || '',
                      signature: profile?.user_signature || '',
                    })}
                  >
                    <RefreshCw size={16} />
                    重置
                  </GlassButton>
                </div>
              </form>
            </GlassCard>
          </motion.div>
        </div>

        {/* 修改密码 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6"
        >
          <GlassCard>
            <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <Lock size={20} className="text-purple-500" />
              修改密码
            </h3>
            <form onSubmit={handleChangePassword}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">当前密码</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <GlassInput
                        type={showPasswords.old ? 'text' : 'password'}
                        value={passwordData.oldPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                        placeholder="输入当前密码"
                        icon={<Lock size={14} />}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, old: !showPasswords.old })}
                      className="p-2.5 rounded-lg bg-white/60 border border-white/70 text-gray-400 hover:text-gray-600 hover:bg-white/80 transition-all"
                    >
                      {showPasswords.old ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">新密码</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <GlassInput
                        type={showPasswords.new ? 'text' : 'password'}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        placeholder="至少6位"
                        icon={<Lock size={14} />}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                      className="p-2.5 rounded-lg bg-white/60 border border-white/70 text-gray-400 hover:text-gray-600 hover:bg-white/80 transition-all"
                    >
                      {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">确认新密码</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <GlassInput
                        type={showPasswords.confirm ? 'text' : 'password'}
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        placeholder="再次输入新密码"
                        icon={<Lock size={14} />}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                      className="p-2.5 rounded-lg bg-white/60 border border-white/70 text-gray-400 hover:text-gray-600 hover:bg-white/80 transition-all"
                    >
                      {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <GlassButton
                type="submit"
                loading={changingPassword}
                disabled={!passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword}
              >
                修改密码
              </GlassButton>
            </form>
          </GlassCard>
        </motion.div>

        {/* 账户信息 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6"
        >
          <GlassCard>
            <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
              <Shield size={20} className="text-green-500" />
              账户信息
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <UserIcon size={16} />
                  用户 ID
                </span>
                <span className="font-semibold text-gray-800">{profile?.user_id || user?.user_id}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Shield size={16} />
                  账户类型
                </span>
                <span className={`font-semibold ${profile?.admin === 'true' ? 'text-purple-600' : 'text-gray-800'}`}>
                  {profile?.admin === 'true' ? '管理员' : '普通用户'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Calendar size={16} />
                  注册时间
                </span>
                <span className="font-semibold text-gray-800">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '-'}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-gray-500 flex items-center gap-2">
                  <Calendar size={16} />
                  最后更新
                </span>
                <span className="font-semibold text-gray-800">
                  {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('zh-CN') : '-'}
                </span>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </GlassPage>
  )
}
