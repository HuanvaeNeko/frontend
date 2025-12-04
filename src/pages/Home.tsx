import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bot, MessageCircle, Video, Settings, LogOut, User, Laptop, Users, IdCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuthStore } from '../store/authStore'
import { 
  fadeInVariants, 
  slideDownVariants, 
  cardContainer,
  cardItem,
  scaleInVariants,
  hoverScale,
  tapScale,
} from '../utils/motionAnimations'

export default function Home() {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuthStore()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  const features = [
    { icon: Bot, title: 'AI 聊天', description: '与智能助手进行对话', path: '/ai-chat', color: 'blue' },
    { icon: MessageCircle, title: '群聊', description: '实时群组协作交流', path: '/group-chat', color: 'purple' },
    { icon: Video, title: '视频会议', description: '高清音视频通话', path: '/video-meeting', color: 'red' },
    { icon: Users, title: '好友管理', description: '添加、管理你的好友', path: '/friends', color: 'green' },
    { icon: IdCard, title: '个人资料', description: '查看和编辑个人信息', path: '/profile', color: 'orange' },
    { icon: Settings, title: '系统设置', description: '个性化配置选项', path: '/settings', color: 'cyan' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <motion.div
        variants={slideDownVariants}
        initial="hidden"
        animate="visible"
        className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm"
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                  {user?.nickname?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-bold">{user?.nickname || user?.user_id || '用户'}</h2>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate('/devices')}>
                <Laptop size={18} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
                <Settings size={18} />
              </Button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <User size={18} />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="min-w-[200px] bg-white rounded-md shadow-lg border p-1" sideOffset={5}>
                    <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none" onSelect={() => navigate('/profile')}>
                      <IdCard size={16} />个人资料
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 rounded outline-none" onSelect={() => navigate('/friends')}>
                      <Users size={16} />好友管理
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                    <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-red-50 text-red-600 rounded outline-none" onSelect={handleLogout}>
                      <LogOut size={16} />登出
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <motion.div
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <h1 className="text-5xl font-black gradient-text mb-2">HuanVae Chat</h1>
          <p className="text-xl text-muted-foreground">欢迎回来,{user?.nickname || '用户'}!开始您的智能通讯之旅</p>
        </motion.div>

        <motion.div
          variants={cardContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={cardItem}>
              <Card 
                className="cursor-pointer hover:shadow-xl transition-all" 
                onClick={() => navigate(feature.path)}
              >
              <CardHeader>
                <div className={`w-16 h-16 rounded-2xl bg-${feature.color}-100 flex items-center justify-center mb-4`}>
                  <feature.icon size={32} className={`text-${feature.color}-600`} />
                </div>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          variants={scaleInVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.6 }}
        >
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            <Button onClick={() => navigate('/ai-chat')} className="gap-2">
              <Bot size={18} />新建 AI 对话
            </Button>
            <Button variant="outline" onClick={() => navigate('/group-chat')} className="gap-2">
              <MessageCircle size={18} />加入群聊
            </Button>
            <Button variant="outline" onClick={() => navigate('/video-meeting')} className="gap-2">
              <Video size={18} />开始会议
            </Button>
          </CardContent>
        </Card>
        </motion.div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>HuanVae Chat - 智能通讯平台 v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
