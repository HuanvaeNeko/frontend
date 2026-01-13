'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { 
  ArrowRight, 
  Loader2, 
  User, 
  Lock, 
  Eye, 
  EyeOff,
  MessageCircle,
  Users,
  Video,
  Shield,
  Sparkles
} from 'lucide-react'
import ParticleBackground from '@/components/ui/ParticleBackground'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'
import { useSettingsStore } from '@/store/settingsStore'


// 功能特性卡片
const FeatureCard = ({ icon: Icon, title, description, delay }: {
  icon: React.ElementType
  title: string
  description: string
  delay: number
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
  >
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  </motion.div>
)

export default function Login() {
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  const particleBackground = useSettingsStore((s) => s.particleBackground)
  
  const [formData, setFormData] = useState({
    user_id: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 预热音频上下文
    warmupSound()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    playButton()

    try {
      await login(formData)
      playSuccess()
      router.push('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '登录失败，请检查用户名和密码'
      setError(errorMsg)
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen w-full flex">
      {/* 左侧 - 品牌区域（桌面端可见） */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        {particleBackground ? (
          <ParticleBackground 
            particleCount={120}
            primaryColor="#8b5cf6"
            secondaryColor="#6366f1"
            backgroundColor="#0f0a1e"
            particleSize={2.5}
            speed={0.3}
            showLines={true}
            lineDistance={120}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900" />
        )}
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 w-full">
          {/* Logo 和标题 */}
      <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white">Huanvae</h1>
                <p className="text-purple-300">智能通讯平台</p>
              </div>
            </div>
            <p className="text-xl text-slate-300 max-w-md leading-relaxed">
              连接世界，畅享沟通。安全、快速、智能的即时通讯体验。
            </p>
          </motion.div>

          {/* 功能特性 */}
          <div className="space-y-4 max-w-md">
            <FeatureCard
              icon={MessageCircle}
              title="即时消息"
              description="支持富文本、Markdown、文件传输"
              delay={0.2}
            />
            <FeatureCard
              icon={Users}
              title="群聊管理"
              description="创建群组，邀请好友，团队协作"
              delay={0.3}
            />
            <FeatureCard
              icon={Video}
              title="视频通话"
              description="高清视频会议，屏幕共享"
              delay={0.4}
            />
            <FeatureCard
              icon={Shield}
              title="安全加密"
              description="端到端加密，保护您的隐私"
              delay={0.5}
            />
          </div>
        </div>
      </div>

      {/* 右侧 - 登录表单 */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-slate-50 dark:bg-slate-900">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px]"
        >
          {/* 移动端 Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Huanvae Chat</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">智能通讯平台</p>
          </div>

          {/* 标题 */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
              欢迎回来 👋
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              登录您的账户以继续
            </p>
          </div>

        {/* 错误提示 */}
          <AnimatePresence>
        {error && (
          <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm overflow-hidden"
          >
            {error}
          </motion.div>
        )}
          </AnimatePresence>

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户 ID */}
          <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                用户 ID
              </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                required
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  placeholder="请输入用户 ID"
                  className="w-full pl-12 pr-4 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>
          </div>

            {/* 密码 */}
          <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                密码
              </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                  type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                  className="w-full pl-12 pr-12 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* 记住我 & 忘记密码 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    setRememberMe(e.target.checked)
                    playTap()
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">记住我</span>
              </label>
              <a href="#" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                忘记密码？
              </a>
          </div>

            {/* 登录按钮 */}
          <motion.button
            type="submit"
            disabled={loading}
              className="w-full py-4 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </span>
          </motion.button>
        </form>

        {/* 分隔线 */}
        <div className="flex items-center gap-4 my-8">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          <span className="text-slate-400 text-sm">或</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* 注册链接 */}
        <div className="text-center">
            <p className="text-slate-500 dark:text-slate-400 mb-4">
            还没有账号？
          </p>
          <Link href="/register">
            <motion.button
              type="button"
                className="w-full py-3.5 px-6 rounded-xl font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
                创建新账户
            </motion.button>
          </Link>
        </div>

        {/* 服务条款 */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>登录即表示您同意我们的</p>
          <p className="mt-1">
              <a href="#" className="text-indigo-600 dark:text-indigo-400 hover:underline">服务条款</a>
            {' '}和{' '}
              <a href="#" className="text-indigo-600 dark:text-indigo-400 hover:underline">隐私政策</a>
          </p>
        </div>
      </motion.div>
      </div>
    </div>
  )
}
