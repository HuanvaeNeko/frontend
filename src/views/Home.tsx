'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Bot,
  MessageCircle,
  Video,
  Settings,
  LogOut,
  User,
  Laptop,
  Users,
  IdCard,
  ArrowRight,
  Sparkles,
  Activity,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'

export default function Home() {
  const router = useRouter()
  const { user, logout, isAuthenticated } = useAuthStore()
  const { openProfileModal } = useUIStore()

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (!isAuthenticated) return null

  const features = [
    { icon: MessageCircle, title: '即时消息', description: '好友与群组沟通', path: '/chat', badge: '核心' },
    { icon: Bot, title: 'AI 助手', description: '多轮上下文问答', path: '/ai-chat', badge: '效率' },
    { icon: Video, title: '视频会议', description: '在线语音与视频沟通', path: '/video-meeting', badge: '协作' },
    { icon: Users, title: '好友管理', description: '联系人与请求管理', path: '/friends', badge: '关系' },
    { icon: Settings, title: '系统设置', description: '通知、主题与偏好', path: '/settings', badge: '配置' },
  ]

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 pb-8 md:p-6">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-2xl border bg-card"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-primary/20" />
          <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:p-7">
            <div className="space-y-3">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                全新控制台
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                欢迎回来，{user?.nickname || user?.user_id || '用户'}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                这是新的工作台布局。你可以在这里快速进入聊天、AI 助手、会议和设置，减少路径跳转。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={() => router.push('/chat')} className="gap-2">
                  <MessageCircle className="h-4 w-4" />进入聊天
                </Button>
                <Button variant="outline" onClick={() => router.push('/ai-chat')} className="gap-2">
                  <Bot className="h-4 w-4" />打开 AI
                </Button>
              </div>
            </div>

            <div className="flex items-start justify-end">
              <Card className="w-full min-w-[260px] max-w-[320px]">
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user?.avatar_url} />
                      <AvatarFallback>{user?.nickname?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{user?.nickname || '用户'}</div>
                      <div className="truncate text-xs text-muted-foreground">{user?.user_id}</div>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>当前状态</span>
                    <span className="inline-flex items-center gap-1 text-primary"><Activity className="h-3.5 w-3.5" />在线</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.04, duration: 0.25 }}
            >
              <Card
                className="group cursor-pointer border-border/80 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => router.push(feature.path)}
              >
                <CardHeader className="pb-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="rounded-xl border bg-muted p-2.5 text-primary">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline">{feature.badge}</Badge>
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors group-hover:text-primary">
                    打开
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">账户与设备</CardTitle>
            <CardDescription>常用管理操作</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openProfileModal} className="gap-2">
              <IdCard className="h-4 w-4" />个人资料
            </Button>
            <Button variant="outline" onClick={() => router.push('/devices')} className="gap-2">
              <Laptop className="h-4 w-4" />设备管理
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2"><User className="h-4 w-4" />更多</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => router.push('/friends')}>
                  <Users className="mr-2 h-4 w-4" />好友管理
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
