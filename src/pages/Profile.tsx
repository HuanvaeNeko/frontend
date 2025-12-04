import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, User as UserIcon, Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { 
  fadeInVariants, 
  slideLeftVariants, 
  slideRightVariants, 
  scaleInVariants,
} from '../utils/motionAnimations'

export default function Profile() {
  const navigate = useNavigate()
  const { profile, isLoading, loadProfile, updateProfile } = useProfileStore()
  const { user } = useAuthStore()

  const [formData, setFormData] = useState({
    email: '',
    signature: '',
  })

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
      alert('个人资料已更新')
    } catch {
      alert('更新失败，请稍后重试')
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
                <Avatar className="h-32 w-32">
                  <AvatarImage src={profile?.user_avatar_url || ''} alt={displayName} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-3xl">
                    {displayName[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" className="mt-2">
                  <Camera size={16} />
                </Button>
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
              <span className="font-semibold">{profile?.admin === 'Y' ? '管理员' : '普通用户'}</span>
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
