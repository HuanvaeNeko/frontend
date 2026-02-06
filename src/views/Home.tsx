'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Bot, MessageCircle, Video, Settings, LogOut, User, Laptop, Users, IdCard, ArrowRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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

  if (!isAuthenticated) {
    return null
  }

  const features = [
    { icon: Bot, title: 'AI 聊天', description: '与智能助手进行对话', path: '/ai-chat', gradient: 'from-blue-500 to-cyan-400' },
    { icon: MessageCircle, title: '即时通讯', description: '好友与群组聊天', path: '/chat', gradient: 'from-violet-500 to-purple-400' },
    { icon: Video, title: '视频会议', description: '高清音视频通话', path: '/video-meeting', gradient: 'from-rose-500 to-pink-400' },
    { icon: Users, title: '好友管理', description: '添加、管理你的好友', path: '/friends', gradient: 'from-emerald-500 to-teal-400' },
    { icon: IdCard, title: '个人资料', description: '查看和编辑个人信息', onClick: openProfileModal, gradient: 'from-amber-500 to-orange-400' },
    { icon: Settings, title: '系统设置', description: '个性化配置选项', path: '/settings', gradient: 'from-slate-500 to-gray-400' },
  ]

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-background">
      {/* 顶部导航栏 */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border"
      >
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Avatar className="h-11 w-11">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-primary text-primary-foreground font-medium">
                {user?.nickname?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-base font-semibold text-foreground">{user?.nickname || user?.user_id || '用户'}</h2>
              <p className="text-[13px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => router.push('/devices')} title="设备管理">
              <Laptop size={18} />
            </Button>
            <Button variant="outline" size="icon" onClick={() => router.push('/settings')} title="设置">
              <Settings size={18} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <User size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={openProfileModal}>
                  <IdCard size={16} className="mr-2" />
                  个人资料
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/friends')}>
                  <Users size={16} className="mr-2" />
                  好友管理
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                  <LogOut size={16} className="mr-2" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.header>

      {/* 主内容区 */}
      <main className="relative z-[1] max-w-[1200px] mx-auto px-6 py-10 pb-16">
        {/* 欢迎区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-blue-500 via-cyan-500 to-indigo-500 bg-clip-text text-transparent mb-3">
            Huanvae Chat
          </h1>
          <p className="text-lg text-muted-foreground">
            欢迎回来，<span className="text-primary">{user?.nickname || '用户'}</span>！开始您的智能通讯之旅
          </p>
        </motion.div>

        {/* 功能卡片网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.08 }}
            >
              <Card 
                className="cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg group"
                onClick={feature.onClick ?? (() => router.push(feature.path!))}
              >
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg bg-gradient-to-br ${feature.gradient}`}>
                    <feature.icon size={28} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground mb-1">{feature.title}</h3>
                    <p className="text-[13px] text-muted-foreground">{feature.description}</p>
                  </div>
                  <ArrowRight size={18} className="text-muted-foreground shrink-0 transition-all group-hover:translate-x-1 group-hover:text-primary" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* 快速操作区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">快速开始</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 max-sm:flex-col">
                <Button onClick={() => router.push('/ai-chat')} className="gap-2">
                  <Bot size={18} />
                  新建 AI 对话
                </Button>
                <Button variant="outline" onClick={() => router.push('/chat')} className="gap-2">
                  <MessageCircle size={18} />
                  开始聊天
                </Button>
                <Button variant="outline" onClick={() => router.push('/video-meeting')} className="gap-2">
                  <Video size={18} />
                  发起会议
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* 底部版本信息 */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-[13px] text-muted-foreground mt-10"
        >
          Huanvae Chat - 智能通讯平台 v1.0.0
        </motion.footer>
      </main>
    </div>
  )
}
