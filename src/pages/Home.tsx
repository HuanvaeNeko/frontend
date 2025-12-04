import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Bot, 
  MessageCircle, 
  Video, 
  Settings,
  LogOut,
  User,
  Laptop,
  Zap,
  TrendingUp,
  Clock,
  Users,
  IdCard
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { 
  slideInDown, 
  cardSequence, 
  magnetic,
  DURATION 
} from '../utils/animations'

export default function Home() {
  const navigate = useNavigate()
  const { user, logout, isAuthenticated } = useAuthStore()

  // 动画引用
  const navbarRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)

  // 页面进入动画
  useEffect(() => {
    // 导航栏从上滑入
    if (navbarRef.current) {
      slideInDown(navbarRef.current, { duration: DURATION.normal })
    }

    // 卡片序列动画
    if (cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll('.feature-card')
      cardSequence(Array.from(cards))
    }

    // 统计信息缩放进入
    if (statsRef.current) {
      const stats = statsRef.current.querySelectorAll('.stat-item')
      cardSequence(Array.from(stats))
    }

    // 为卡片添加磁吸效果
    const cleanupFunctions: (() => void)[] = []
    if (cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll('.feature-card')
      cards.forEach((card) => {
        const cleanup = magnetic(card as HTMLElement, 0.15)
        cleanupFunctions.push(cleanup)
      })
    }

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
    }
  }, [])

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
    {
      icon: Bot,
      title: 'AI 聊天',
      description: '与智能助手进行对话',
      path: '/ai-chat',
      gradient: 'from-blue-500 to-cyan-500',
      stats: { label: '响应速度', value: '< 1s' }
    },
    {
      icon: MessageCircle,
      title: '群聊',
      description: '实时群组协作交流',
      path: '/group-chat',
      gradient: 'from-purple-500 to-pink-500',
      stats: { label: '在线用户', value: '128' }
    },
    {
      icon: Video,
      title: '视频会议',
      description: '高清音视频通话',
      path: '/video-meeting',
      gradient: 'from-orange-500 to-red-500',
      stats: { label: '会议质量', value: 'HD' }
    },
    {
      icon: Users,
      title: '好友管理',
      description: '添加、管理你的好友',
      path: '/friends',
      gradient: 'from-green-500 to-teal-500',
      stats: { label: '好友数量', value: '0' }
    },
    {
      icon: IdCard,
      title: '个人资料',
      description: '查看和编辑个人信息',
      path: '/profile',
      gradient: 'from-indigo-500 to-purple-500',
      stats: { label: '完整度', value: '80%' }
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200">
      {/* 顶部导航栏 */}
      <div ref={navbarRef} className="navbar bg-base-100/80 backdrop-blur-xl border-b border-base-300 sticky top-0 z-50 shadow-lg">
        <div className="flex-1">
          <div className="flex items-center gap-4 px-4">
            <div className="avatar placeholder online">
              <div className="bg-gradient-to-br from-primary to-secondary text-primary-content rounded-full w-12 ring ring-primary ring-offset-base-100 ring-offset-2">
                <span className="text-xl font-bold">{user?.nickname?.[0] || 'U'}</span>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {user?.nickname || user?.user_id || '用户'}
              </h2>
              <p className="text-xs text-base-content/60">{user?.email}</p>
            </div>
          </div>
        </div>
        <div className="flex-none gap-2">
            <button
              onClick={() => navigate('/devices')}
            className="btn btn-ghost btn-circle"
            title="设备管理"
            >
            <Laptop size={20} />
            </button>
            <button
            onClick={() => navigate('/settings')}
            className="btn btn-ghost btn-circle"
            title="设置"
            >
            <Settings size={20} />
            </button>
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-circle avatar">
              <div className="w-10 rounded-full">
                <div className="bg-neutral text-neutral-content w-full h-full flex items-center justify-center">
                  <User size={20} />
                </div>
              </div>
            </label>
            <ul tabIndex={0} className="mt-3 z-[1] p-2 shadow-xl menu menu-sm dropdown-content bg-base-100 rounded-box w-52 border border-base-300">
              <li><a onClick={() => navigate('/profile')}><IdCard size={16} className="mr-2" />个人资料</a></li>
              <li><a onClick={() => navigate('/friends')}><Users size={16} className="mr-2" />好友管理</a></li>
              <li><a onClick={() => navigate('/settings')}><Settings size={16} className="mr-2" />设置</a></li>
              <li><a onClick={handleLogout} className="text-error"><LogOut size={16} className="mr-2" />登出</a></li>
            </ul>
          </div>
          </div>
        </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* 欢迎区域 */}
        <div className="mb-12">
          <div className="text-sm breadcrumbs mb-4">
            <ul>
              <li>首页</li>
              <li>仪表板</li>
            </ul>
          </div>
          <h1 className="text-5xl font-black mb-4">
            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
              HuanVae Chat
            </span>
          </h1>
          <p className="text-xl text-base-content/70">
            欢迎回来，{user?.nickname || '用户'}！开始您的智能通讯之旅
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="stats shadow-xl bg-gradient-to-br from-primary to-secondary text-primary-content">
            <div className="stat">
              <div className="stat-figure text-primary-content/50">
                <Zap size={40} />
              </div>
              <div className="stat-title text-primary-content/70">今日活动</div>
              <div className="stat-value">42</div>
              <div className="stat-desc text-primary-content/70">↗︎ 比昨天多 12%</div>
            </div>
          </div>

          <div className="stats shadow-xl bg-gradient-to-br from-secondary to-accent text-secondary-content">
            <div className="stat">
              <div className="stat-figure text-secondary-content/50">
                <TrendingUp size={40} />
              </div>
              <div className="stat-title text-secondary-content/70">消息数量</div>
              <div className="stat-value">1.2K</div>
              <div className="stat-desc text-secondary-content/70">↗︎ 活跃度提升</div>
            </div>
          </div>

          <div className="stats shadow-xl bg-gradient-to-br from-accent to-primary text-accent-content">
            <div className="stat">
              <div className="stat-figure text-accent-content/50">
                <Clock size={40} />
              </div>
              <div className="stat-title text-accent-content/70">在线时长</div>
              <div className="stat-value">3.5h</div>
              <div className="stat-desc text-accent-content/70">今日累计时长</div>
            </div>
          </div>
        </div>

        {/* 功能卡片 */}
        <div ref={cardsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              onClick={() => navigate(feature.path)}
              className="card bg-base-100 shadow-2xl hover:shadow-3xl transition-all duration-300 cursor-pointer group border border-base-300 hover:border-primary overflow-hidden"
            >
              {/* 渐变背景 */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
              
              <div className="card-body relative">
                {/* 图标 */}
                <div className="mb-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white text-3xl shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <feature.icon size={32} strokeWidth={2} />
                  </div>
                </div>

                {/* 标题和描述 */}
                <h2 className="card-title text-2xl mb-2 group-hover:text-primary transition-colors">
                  {feature.title}
                </h2>
                <p className="text-base-content/70 mb-4">{feature.description}</p>

                {/* 统计信息 */}
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-base-300">
                  <div>
                    <div className="text-xs text-base-content/50">{feature.stats.label}</div>
                    <div className="text-lg font-bold">{feature.stats.value}</div>
                  </div>
                  <div className="btn btn-circle btn-ghost group-hover:btn-primary transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 快速操作 */}
        <div className="mt-12 card bg-gradient-to-r from-base-100 to-base-200 shadow-xl border border-base-300">
          <div className="card-body">
            <h3 className="card-title text-2xl mb-6">快速操作</h3>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={() => navigate('/ai-chat')}
                className="btn btn-primary gap-2"
              >
                <Bot size={20} />
                新建 AI 对话
              </button>
              <button 
                onClick={() => navigate('/group-chat')}
                className="btn btn-secondary gap-2"
              >
                <MessageCircle size={20} />
                加入群聊
              </button>
              <button 
                onClick={() => navigate('/video-meeting')}
                className="btn btn-accent gap-2"
              >
                <Video size={20} />
                开始会议
              </button>
              <button 
                onClick={() => navigate('/friends')}
                className="btn btn-success gap-2"
              >
                <Users size={20} />
                好友管理
              </button>
              <button 
                onClick={() => navigate('/profile')}
                className="btn btn-info gap-2"
              >
                <IdCard size={20} />
                个人资料
              </button>
          <button
            onClick={() => navigate('/settings')}
                className="btn btn-ghost gap-2"
          >
                <Settings size={20} />
                系统设置
          </button>
            </div>
          </div>
        </div>

        {/* 底部信息 */}
        <div className="mt-12 text-center text-base-content/50 text-sm">
          <p>HuanVae Chat - 智能通讯平台 v1.0.0</p>
        </div>
      </div>
    </div>
  )
}
