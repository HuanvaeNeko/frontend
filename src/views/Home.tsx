'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Bot, MessageCircle, Video, Settings, LogOut, User, Laptop, Users, IdCard, ArrowRight } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuthStore } from '../store/authStore'

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
    <div className="home-page">
      {/* 背景装饰球 */}
      <div className="home-bg-orb orb-1" />
      <div className="home-bg-orb orb-2" />
      <div className="home-bg-orb orb-3" />

      {/* 顶部导航栏 */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="home-header"
      >
        <div className="header-content">
          <div className="header-left">
            <Avatar className="h-11 w-11 ring-2 ring-white/50">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white font-medium">
                {user?.nickname?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="header-username">{user?.nickname || user?.user_id || '用户'}</h2>
              <p className="header-email">{user?.email}</p>
            </div>
          </div>

          <div className="header-actions">
            <button className="header-btn" onClick={() => router.push('/devices')} title="设备管理">
              <Laptop size={18} />
            </button>
            <button className="header-btn" onClick={() => router.push('/settings')} title="设置">
              <Settings size={18} />
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="header-btn">
                  <User size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown-content" sideOffset={8}>
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => router.push('/profile')}>
                    <IdCard size={16} />个人资料
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="dropdown-item" onSelect={() => router.push('/friends')}>
                    <Users size={16} />好友管理
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="dropdown-separator" />
                  <DropdownMenu.Item className="dropdown-item danger" onSelect={handleLogout}>
                    <LogOut size={16} />退出登录
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </motion.header>

      {/* 主内容区 */}
      <main className="home-main">
        {/* 欢迎区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="welcome-section"
        >
          <h1 className="welcome-title">Huanvae Chat</h1>
          <p className="welcome-subtitle">
            欢迎回来，<span className="text-blue-600">{user?.nickname || '用户'}</span>！开始您的智能通讯之旅
          </p>
        </motion.div>

        {/* 功能卡片网格 */}
        <div className="features-grid">
          {features.map((feature, index) => (
            <motion.div
              key={feature.path}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + index * 0.08 }}
            >
              <button
                className="feature-card"
                onClick={() => router.push(feature.path)}
              >
                <div className={`feature-icon bg-gradient-to-br ${feature.gradient}`}>
                  <feature.icon size={28} />
                </div>
                <div className="feature-content">
                  <h3 className="feature-title">{feature.title}</h3>
                  <p className="feature-desc">{feature.description}</p>
                </div>
                <ArrowRight size={18} className="feature-arrow" />
              </button>
            </motion.div>
          ))}
        </div>

        {/* 快速操作区 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="quick-actions"
        >
          <h2 className="quick-title">快速开始</h2>
          <div className="quick-buttons">
            <button className="quick-btn primary" onClick={() => router.push('/ai-chat')}>
              <Bot size={18} />
              新建 AI 对话
            </button>
            <button className="quick-btn" onClick={() => router.push('/chat')}>
              <MessageCircle size={18} />
              开始聊天
            </button>
            <button className="quick-btn" onClick={() => router.push('/video-meeting')}>
              <Video size={18} />
              发起会议
            </button>
          </div>
        </motion.div>

        {/* 底部版本信息 */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="home-footer"
        >
          Huanvae Chat - 智能通讯平台 v1.0.0
        </motion.footer>
      </main>

      <style>{`
        .home-page {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 25%, #ffffff 50%, #f5f3ff 75%, #ede9fe 100%);
        }

        .home-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.4;
          pointer-events: none;
          z-index: 0;
        }

        .home-bg-orb.orb-1 {
          width: 500px;
          height: 500px;
          background: linear-gradient(135deg, #93c5fd, #60a5fa);
          top: -150px;
          right: -100px;
        }

        .home-bg-orb.orb-2 {
          width: 400px;
          height: 400px;
          background: linear-gradient(135deg, #c4b5fd, #a78bfa);
          bottom: -100px;
          left: -100px;
        }

        .home-bg-orb.orb-3 {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #a5b4fc, #818cf8);
          top: 40%;
          left: 50%;
          transform: translateX(-50%);
        }

        .home-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid rgba(147, 197, 253, 0.2);
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .header-username {
          font-size: 16px;
          font-weight: 600;
          color: #1e3a5f;
        }

        .header-email {
          font-size: 13px;
          color: #64748b;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(147, 197, 253, 0.2);
          color: #475569;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .header-btn:hover {
          background: rgba(255, 255, 255, 0.9);
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .dropdown-content {
          min-width: 180px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 14px;
          border: 1px solid rgba(147, 197, 253, 0.3);
          box-shadow: 0 10px 40px rgba(59, 130, 246, 0.15);
          padding: 6px;
          z-index: 100;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          font-size: 14px;
          color: #475569;
          border-radius: 10px;
          cursor: pointer;
          outline: none;
          transition: all 0.15s ease;
        }

        .dropdown-item:hover {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .dropdown-item.danger {
          color: #dc2626;
        }

        .dropdown-item.danger:hover {
          background: rgba(220, 38, 38, 0.1);
        }

        .dropdown-separator {
          height: 1px;
          background: rgba(147, 197, 253, 0.3);
          margin: 6px 0;
        }

        .home-main {
          position: relative;
          z-index: 1;
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 24px 60px;
        }

        .welcome-section {
          text-align: center;
          margin-bottom: 48px;
        }

        .welcome-title {
          font-size: 48px;
          font-weight: 800;
          background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 50%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 12px;
        }

        .welcome-subtitle {
          font-size: 18px;
          color: #64748b;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
          margin-bottom: 48px;
        }

        .feature-card {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.5) 100%);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(147, 197, 253, 0.25);
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.25s ease;
          text-align: left;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.3);
        }

        .feature-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .feature-content {
          flex: 1;
          min-width: 0;
        }

        .feature-title {
          font-size: 16px;
          font-weight: 600;
          color: #1e3a5f;
          margin-bottom: 4px;
        }

        .feature-desc {
          font-size: 13px;
          color: #64748b;
        }

        .feature-arrow {
          color: #94a3b8;
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }

        .feature-card:hover .feature-arrow {
          transform: translateX(4px);
          color: #3b82f6;
        }

        .quick-actions {
          background: linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 100%);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(147, 197, 253, 0.25);
          border-radius: 24px;
          padding: 28px;
          margin-bottom: 40px;
        }

        .quick-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e3a5f;
          margin-bottom: 20px;
        }

        .quick-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .quick-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(147, 197, 253, 0.3);
          color: #475569;
        }

        .quick-btn:hover {
          background: rgba(255, 255, 255, 0.9);
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .quick-btn.primary {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border: none;
          color: white;
          box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
        }

        .quick-btn.primary:hover {
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
          transform: translateY(-2px);
        }

        .home-footer {
          text-align: center;
          font-size: 13px;
          color: #94a3b8;
        }

        @media (max-width: 640px) {
          .welcome-title {
            font-size: 32px;
          }

          .features-grid {
            grid-template-columns: 1fr;
          }

          .quick-buttons {
            flex-direction: column;
          }

          .quick-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  )
}
