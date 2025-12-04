import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, User as UserIcon, Camera } from 'lucide-react'
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
  const { profile, updateProfile, loading } = useProfileStore()
  const { user } = useAuthStore()

  const [formData, setFormData] = useState({
    nickname: profile?.nickname || user?.nickname || '',
    email: profile?.email || user?.email || '',
    bio: profile?.bio || '',
    location: profile?.location || '',
    website: profile?.website || ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile(formData)
      alert('个人资料已更新')
    } catch (error) {
      alert('更新失败，请稍后重试')
    }
  }

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
                  <AvatarImage src="" alt={user?.nickname} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-3xl">
                    {user?.nickname?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <Button variant="ghost" size="icon" className="mt-2">
                  <Camera size={16} />
                </Button>
                <h3 className="text-xl font-semibold mt-4">{user?.nickname || '用户'}</h3>
                <p className="text-sm text-muted-foreground">ID: {user?.user_id}</p>
              </div>
            </CardContent>
          </Card>
          </motion.div>

          <motion.div
            variants={slideRightVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="nickname">昵称</Label>
                  <Input
                    id="nickname"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    placeholder="您的昵称"
                  />
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
                  <Label htmlFor="bio">个人简介</Label>
                  <textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="介绍一下自己吧..."
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    maxLength={200}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">所在地</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="例如：北京"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">个人网站</Label>
                  <Input
                    id="website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? '保存中...' : '保存更改'}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setFormData({
                      nickname: profile?.nickname || user?.nickname || '',
                      email: profile?.email || user?.email || '',
                      bio: profile?.bio || '',
                      location: profile?.location || '',
                      website: profile?.website || ''
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
              <span className="font-semibold">{user?.user_id}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">注册时间</span>
              <span className="font-semibold">2024-01-01</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">最后登录</span>
              <span className="font-semibold">刚刚</span>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>
    </div>
  )
}
