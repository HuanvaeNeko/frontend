'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { 
  ArrowRight, 
  Check, 
  Loader2, 
  User, 
  Lock, 
  Mail, 
  Smile,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Globe,
  Heart,
  X
} from 'lucide-react'
import ParticleBackground from '@/components/ui/ParticleBackground'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'


// 特性标签
const FeatureTag = ({ icon: Icon, text, delay }: {
  icon: React.ElementType
  text: string
  delay: number
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.4 }}
    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20"
  >
    <Icon className="w-4 h-4 text-violet-300" />
    <span className="text-sm text-white/90">{text}</span>
  </motion.div>
)

// 密码强度指示器
const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const strength = {
    length: password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  }
  const score = Object.values(strength).filter(Boolean).length

  if (!password) return null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-2"
    >
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 dark:text-slate-400">密码强度</span>
        <span className={
          score === 3 ? 'text-emerald-600 font-medium' : 
          score === 2 ? 'text-amber-600 font-medium' : 'text-red-500 font-medium'
        }>
          {score === 3 ? '强' : score === 2 ? '中' : '弱'}
        </span>
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <motion.div 
          className={`h-full rounded-full ${
            score === 3 ? 'bg-emerald-500' : 
            score === 2 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${(score / 3) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <span className={`flex items-center gap-1 ${strength.length ? 'text-emerald-600' : 'text-slate-400'}`}>
          {strength.length ? <Check size={12} /> : <X size={12} />}
          8+ 字符
        </span>
        <span className={`flex items-center gap-1 ${strength.hasLetter ? 'text-emerald-600' : 'text-slate-400'}`}>
          {strength.hasLetter ? <Check size={12} /> : <X size={12} />}
          包含字母
        </span>
        <span className={`flex items-center gap-1 ${strength.hasNumber ? 'text-emerald-600' : 'text-slate-400'}`}>
          {strength.hasNumber ? <Check size={12} /> : <X size={12} />}
          包含数字
        </span>
      </div>
    </motion.div>
  )
}

export default function Register() {
  const router = useRouter()
  const register = useAuthStore((state) => state.register)
  
  const [formData, setFormData] = useState({
    user_id: '',
    nickname: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    warmupSound()
  }, [])

  // 密码强度检查
  const passwordStrength = {
    length: formData.password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
  }
  const passwordMatch = formData.password && formData.password === formData.confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!agreeTerms) {
      setError('请阅读并同意服务条款和隐私政策')
      playError()
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      playError()
      return
    }

    if (!passwordStrength.length || !passwordStrength.hasLetter || !passwordStrength.hasNumber) {
      setError('密码必须至少8位，包含字母和数字')
      playError()
      return
    }

    setLoading(true)
    playButton()

    try {
      await register({
        user_id: formData.user_id,
        nickname: formData.nickname,
        email: formData.email,
        password: formData.password,
      })
      playSuccess()
      router.push('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '注册失败，请稍后重试'
      setError(errorMsg)
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen w-full flex">
      {/* 左侧 - 注册表单 */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-slate-50 dark:bg-slate-900 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[440px] py-8"
        >
          {/* 移动端 Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Huanvae Chat</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">智能通讯平台</p>
          </div>

          {/* 标题 */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
              创建账户 ✨
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              加入我们，开启智能通讯之旅
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

          {/* 注册表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  minLength={3}
                  value={formData.user_id}
                  onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                  placeholder="至少 3 个字符"
                  className="w-full pl-12 pr-4 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                />
              </div>
            </div>

            {/* 昵称 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                昵称
              </label>
              <div className="relative">
                <Smile className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  placeholder="您的显示名称"
                  className="w-full pl-12 pr-4 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                />
              </div>
            </div>

            {/* 邮箱 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="your@email.com"
                  className="w-full pl-12 pr-4 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
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
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="至少 8 位，包含字母和数字"
                  className="w-full pl-12 pr-12 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={formData.password} />
            </div>

            {/* 确认密码 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                确认密码
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="再次输入密码"
                  className="w-full pl-12 pr-12 py-3.5 text-slate-800 dark:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.confirmPassword && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`text-xs flex items-center gap-1 mt-2 ${
                    passwordMatch ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  {passwordMatch ? <Check size={14} /> : <X size={14} />}
                  {passwordMatch ? '密码匹配' : '密码不匹配'}
                </motion.div>
              )}
            </div>

            {/* 同意条款 */}
            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => {
                    setAgreeTerms(e.target.checked)
                    playTap()
                  }}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  我已阅读并同意{' '}
                  <a href="#" className="text-violet-600 dark:text-violet-400 hover:underline">服务条款</a>
                  {' '}和{' '}
                  <a href="#" className="text-violet-600 dark:text-violet-400 hover:underline">隐私政策</a>
                </span>
              </label>
            </div>

            {/* 注册按钮 */}
            <motion.button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-6 mt-4 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
            >
              <span className="flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    注册中...
                  </>
                ) : (
                  <>
                    创建账户
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

          {/* 登录链接 */}
          <div className="text-center">
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              已有账户？
            </p>
            <Link href="/login">
              <motion.button
                type="button"
                className="w-full py-3.5 px-6 rounded-xl font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                立即登录
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>

      {/* 右侧 - 品牌区域（桌面端可见） */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        <ParticleBackground 
          particleCount={100}
          primaryColor="#a855f7"
          secondaryColor="#6366f1"
          backgroundColor="#0a0515"
          particleSize={2}
          speed={0.25}
          showLines={true}
          lineDistance={100}
        />
        
        <div className="relative z-10 flex flex-col justify-center items-center px-12 xl:px-20 w-full">
          {/* Logo 和标题 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-purple-500/40 mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-bold text-white mb-3">Huanvae</h1>
            <p className="text-xl text-violet-200">开启全新通讯体验</p>
          </motion.div>

          {/* 特性标签 */}
          <div className="flex flex-wrap justify-center gap-3 max-w-md">
            <FeatureTag icon={Zap} text="即时通讯" delay={0.2} />
            <FeatureTag icon={Globe} text="全球连接" delay={0.3} />
            <FeatureTag icon={Heart} text="社区互动" delay={0.4} />
          </div>

          {/* 装饰性统计 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-16 grid grid-cols-3 gap-8 text-center"
          >
            <div>
              <div className="text-4xl font-bold text-white mb-1">10K+</div>
              <div className="text-violet-300 text-sm">活跃用户</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-1">99.9%</div>
              <div className="text-violet-300 text-sm">在线率</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-1">24/7</div>
              <div className="text-violet-300 text-sm">全天候服务</div>
            </div>
          </motion.div>

          {/* 底部引言 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-16 text-center max-w-md"
          >
            <p className="text-white/70 text-sm italic">
              "连接每一刻，分享每一份精彩。"
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
