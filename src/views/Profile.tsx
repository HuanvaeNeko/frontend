'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, User as UserIcon, Camera, Loader2, Lock, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { profileApi } from '../api/profile'
import { useToast } from '../hooks/use-toast'
import { 
  slideLeftVariants, 
  slideRightVariants, 
  scaleInVariants,
} from '../utils/motionAnimations'

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

  // 加载用户资料
  useEffect(() => {
    loadProfile().catch(console.error)
  }, [loadProfile])

  // 当 profile 加载完成后，更新表单
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
      toast({
        title: '成功',
        description: '个人资料已更新',
      })
    } catch (error) {
      toast({
        title: '更新失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    }
  }

  // 头像上传处理
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      await profileApi.uploadAvatar(file)
      // 重新加载资料以更新头像
      await loadProfile()
      toast({
        title: '成功',
        description: '头像上传成功',
      })
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setUploadingAvatar(false)
      // 重置 input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 修改密码处理
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: '错误',
        description: '两次输入的新密码不一致',
        variant: 'destructive',
      })
      return
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: '错误',
        description: '新密码长度至少 6 位',
        variant: 'destructive',
      })
      return
    }

    setChangingPassword(true)
    try {
      await profileApi.changePassword({
        old_password: passwordData.oldPassword,
        new_password: passwordData.newPassword,
      })
      toast({
        title: '成功',
        description: '密码修改成功',
      })
      // 清空密码表单
      setPasswordData({
        oldPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
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
    <div className="profile-page">
      {/* 背景装饰球 */}
      <div className="profile-bg-orb orb-1"></div>
      <div className="profile-bg-orb orb-2"></div>
      <div className="profile-bg-orb orb-3"></div>
      
      <div className="profile-container">
        <motion.div 
          className="back-button-wrapper"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <button 
            onClick={() => router.push('/chat')}
            className="back-button"
          >
            <ArrowLeft size={18} />
            返回首页
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="page-header"
        >
          <div className="header-icon">
            <UserIcon size={24} />
          </div>
          <div>
            <h1>个人资料</h1>
            <p>管理您的个人信息</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div
            variants={slideLeftVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center">
                {/* 头像区域 */}
                <div className="relative group">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={profile?.user_avatar_url || ''} alt={displayName} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-3xl">
                      {displayName[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {/* 上传按钮覆盖层 */}
                  <button
                    onClick={handleAvatarClick}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    ) : (
                      <Camera className="h-8 w-8 text-white" />
                    )}
                  </button>
                </div>
                {/* 隐藏的文件输入 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <p className="text-xs text-muted-foreground mt-2">点击头像更换</p>
                <h3 className="text-xl font-semibold mt-4">{displayName}</h3>
                <p className="text-sm text-muted-foreground">ID: {profile?.user_id || user?.user_id}</p>
              </div>
            </CardContent>
          </Card>
          </motion.div>

          <motion.div
            variants={slideRightVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
            className="lg:col-span-2"
          >
          <Card>
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="nickname">昵称</Label>
                  <Input
                    id="nickname"
                    value={displayName}
                    disabled
                    placeholder="您的昵称"
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">昵称暂不支持修改</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="your@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signature">个性签名</Label>
                  <textarea
                    id="signature"
                    value={formData.signature}
                    onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
                    placeholder="介绍一下自己吧..."
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    maxLength={200}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {formData.signature.length}/200
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      '保存更改'
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setFormData({
                      email: profile?.user_email || '',
                      signature: profile?.user_signature || '',
                    })}
                  >
                    重置
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          </motion.div>
        </div>

        {/* 修改密码卡片 */}
        <motion.div
          variants={scaleInVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock size={20} />
              修改密码
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">当前密码</Label>
                  <div className="relative">
                    <Input
                      id="oldPassword"
                      type={showPasswords.old ? 'text' : 'password'}
                      value={passwordData.oldPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                      placeholder="输入当前密码"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, old: !showPasswords.old })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.old ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">新密码</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      placeholder="输入新密码（至少6位）"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认新密码</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      placeholder="再次输入新密码"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={changingPassword || !passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword}
              >
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    修改中...
                  </>
                ) : (
                  '修改密码'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        </motion.div>

        {/* 账户信息卡片 */}
        <motion.div
          variants={scaleInVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.3 }}
        >
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>账户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">用户 ID</span>
              <span className="font-semibold">{profile?.user_id || user?.user_id}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">账户类型</span>
              <span className="font-semibold">{profile?.admin === 'true' ? '管理员' : '普通用户'}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">注册时间</span>
              <span className="font-semibold">
                {profile?.created_at 
                  ? new Date(profile.created_at).toLocaleDateString('zh-CN') 
                  : '-'}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">最后更新</span>
              <span className="font-semibold">
                {profile?.updated_at 
                  ? new Date(profile.updated_at).toLocaleDateString('zh-CN') 
                  : '-'}
              </span>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>

      <style>{`
        .profile-page {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          background: linear-gradient(
            135deg,
            #e0f2fe 0%,
            #f0f9ff 25%,
            #ffffff 50%,
            #f5f3ff 75%,
            #ede9fe 100%
          );
        }

        .profile-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
          pointer-events: none;
          z-index: 0;
        }

        .profile-bg-orb.orb-1 {
          width: 400px;
          height: 400px;
          background: linear-gradient(135deg, #93c5fd, #60a5fa);
          top: -100px;
          right: -100px;
        }

        .profile-bg-orb.orb-2 {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #c4b5fd, #a78bfa);
          bottom: -80px;
          left: 10%;
        }

        .profile-bg-orb.orb-3 {
          width: 200px;
          height: 200px;
          background: linear-gradient(135deg, #a5b4fc, #818cf8);
          top: 50%;
          left: -50px;
        }

        .profile-container {
          position: relative;
          z-index: 1;
          max-width: 1000px;
          margin: 0 auto;
          padding: 32px 24px;
        }

        .back-button-wrapper {
          margin-bottom: 24px;
        }

        .back-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(147, 197, 253, 0.3);
          border-radius: 12px;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .back-button:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: translateX(-4px);
        }

        .page-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 32px;
        }

        .header-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #3b82f6, #60a5fa);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .page-header h1 {
          font-size: 28px;
          font-weight: 700;
          color: #1e3a5f;
          margin: 0;
        }

        .page-header p {
          font-size: 14px;
          color: #64748b;
          margin: 4px 0 0 0;
        }
      `}</style>
    </div>
  )
}
