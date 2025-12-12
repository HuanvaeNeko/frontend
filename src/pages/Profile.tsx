import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  fadeInVariants, 
  slideLeftVariants, 
  slideRightVariants, 
  scaleInVariants,
} from '../utils/motionAnimations'

export default function Profile() {
  const navigate = useNavigate()
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
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft size={18} />
            返回首页
          </Button>
        </div>

        <motion.div
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 flex items-center gap-4"
        >
          <UserIcon size={32} className="text-primary" />
          <div>
            <h1 className="text-4xl font-bold">个人资料</h1>
            <p className="text-muted-foreground">管理您的个人信息</p>
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
    </div>
  )
}
