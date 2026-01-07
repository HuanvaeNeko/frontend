'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Bot, MessageCircle, Video, Settings, LogOut, User, Laptop, Users, IdCard, ArrowRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuthStore } from '../store/authStore'
import { BackgroundOrbs } from '@/components/ui/glass'

export default function Home() {
  const router = useRouter()
  const { user, logout, isAuthenticated } = useAuthStore()

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
    { icon: IdCard, title: '个人资料', description: '查看和编辑个人信息', path: '/profile', gradient: 'from-amber-500 to-orange-400' },
    { icon: Settings, title: '系统设置', description: '个性化配置选项', path: '/settings', gradient: 'from-slate-500 to-gray-400' },
  ]

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-gradient-to-br from-blue-100 via-blue-50 via-25% via-white via-50% via-purple-50 via-75% to-purple-100">
      {/* 背景装饰球 */}
      <BackgroundOrbs count={3} />

      {/* 顶部导航栏 */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-blue-200/20"
      >
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Avatar className="h-11 w-11 ring-2 ring-white/50">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white font-medium">
                {user?.nickname?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-base font-semibold text-slate-800">{user?.nickname || user?.user_id || '用户'}</h2>
              <p className="text-[13px] text-slate-500">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <motion.button 
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
              onClick={() => router.push('/devices')} 
              title="设备管理"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Laptop size={18} />
            </motion.button>
            <motion.button 
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
              onClick={() => router.push('/settings')} 
              title="设置"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Settings size={18} />
            </motion.button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <motion.button 
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/50 border border-blue-200/20 text-slate-600 cursor-pointer transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <User size={18} />
                </motion.button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content 
                  className="min-w-[180px] bg-white/95 backdrop-blur-xl rounded-[14px] border border-blue-200/30 shadow-lg shadow-blue-500/15 p-1.5 z-[100]" 
                  sideOffset={8}
                >
                  <DropdownMenu.Item 
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-600 rounded-[10px] cursor-pointer outline-none transition-all hover:bg-blue-500/10 hover:text-blue-500"
                    onSelect={() => router.push('/profile')}
                  >
                    <IdCard size={16} />个人资料
                  </DropdownMenu.Item>
                  <DropdownMenu.Item 
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-slate-600 rounded-[10px] cursor-pointer outline-none transition-all hover:bg-blue-500/10 hover:text-blue-500"
                    onSelect={() => router.push('/friends')}
                  >
                    <Users size={16} />好友管理
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-blue-200/30 my-1.5" />
                  <DropdownMenu.Item 
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 rounded-[10px] cursor-pointer outline-none transition-all hover:bg-red-500/10"
                    onSelect={handleLogout}
                  >
                    <LogOut size={16} />退出登录
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
          <p className="text-lg text-slate-500">
            欢迎回来，<span className="text-blue-600">{user?.nickname || '用户'}</span>！开始您的智能通讯之旅
          </p>
        </motion.div>

        {/* 功能卡片网格 */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-5 mb-12">
          {features.map((feature, index) => (
            <motion.div
              key={feature.path}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.08 }}
            >
              <motion.button
                className="w-full flex items-center gap-4 p-5 bg-gradient-to-br from-white/80 to-white/50 backdrop-blur-xl border border-blue-200/25 rounded-[20px] cursor-pointer text-left transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/15 hover:border-blue-500/30 group"
                onClick={() => router.push(feature.path)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-black/15 bg-gradient-to-br ${feature.gradient}`}>
                  <feature.icon size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-800 mb-1">{feature.title}</h3>
                  <p className="text-[13px] text-slate-500">{feature.description}</p>
                </div>
                <ArrowRight size={18} className="text-slate-400 shrink-0 transition-all group-hover:translate-x-1 group-hover:text-blue-500" />
              </motion.button>
            </motion.div>
          ))}
        </div>

        {/* 快速操作区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-gradient-to-br from-white/70 to-white/40 backdrop-blur-2xl border border-blue-200/25 rounded-3xl p-7 mb-10"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-5">快速开始</h2>
          <div className="flex flex-wrap gap-3 max-sm:flex-col">
            <motion.button 
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] text-sm font-medium cursor-pointer transition-all bg-gradient-to-r from-blue-500 to-blue-600 text-white border-none shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-0.5 max-sm:w-full"
              onClick={() => router.push('/ai-chat')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Bot size={18} />
              新建 AI 对话
            </motion.button>
            <motion.button 
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] text-sm font-medium cursor-pointer transition-all bg-white/60 border border-blue-200/30 text-slate-600 hover:bg-white/90 hover:border-blue-500 hover:text-blue-500 max-sm:w-full"
              onClick={() => router.push('/chat')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <MessageCircle size={18} />
              开始聊天
            </motion.button>
            <motion.button 
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] text-sm font-medium cursor-pointer transition-all bg-white/60 border border-blue-200/30 text-slate-600 hover:bg-white/90 hover:border-blue-500 hover:text-blue-500 max-sm:w-full"
              onClick={() => router.push('/video-meeting')}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Video size={18} />
              发起会议
            </motion.button>
          </div>
        </motion.div>

        {/* 底部版本信息 */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-[13px] text-slate-400"
        >
          Huanvae Chat - 智能通讯平台 v1.0.0
        </motion.footer>
      </main>
    </div>
  )
}
