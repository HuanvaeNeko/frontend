'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { ArrowRight, Check, Loader2, User, Lock, Mail, Smile } from 'lucide-react'
import { BackgroundOrbs } from '@/components/ui/glass'

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
  const [shouldShake, setShouldShake] = useState(false)

  // 密码强度检查
  const passwordStrength = {
    length: formData.password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
  }
  const strengthScore = Object.values(passwordStrength).filter(Boolean).length
  const passwordMatch = formData.password && formData.password === formData.confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      setShouldShake(true)
      setTimeout(() => setShouldShake(false), 500)
      return
    }

    if (!passwordStrength.length || !passwordStrength.hasLetter || !passwordStrength.hasNumber) {
      setError('密码必须至少8位，包含字母和数字')
      setShouldShake(true)
      setTimeout(() => setShouldShake(false), 500)
      return
    }

    setLoading(true)

    try {
      await register({
        user_id: formData.user_id,
        nickname: formData.nickname,
        email: formData.email,
        password: formData.password,
      })
      router.push('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '注册失败，请稍后重试'
      setError(errorMsg)
      setShouldShake(true)
      setTimeout(() => setShouldShake(false), 500)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full pl-11 pr-4 py-3 text-sm text-slate-800 bg-gradient-to-br from-white/50 to-white/35 backdrop-blur-xl border border-white/70 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-blue-300/60 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1),0_0_30px_rgba(147,197,253,0.25)]"

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-100 via-slate-50 to-purple-100 py-8">
      <BackgroundOrbs count={5} />

      {/* 毛玻璃注册卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ 
          opacity: 1, 
          y: 0, 
          scale: 1,
          x: shouldShake ? [-2, 2, -2, 2, 0] : 0
        }}
        transition={{ 
          duration: 0.6, 
          ease: [0.4, 0, 0.2, 1],
          x: { duration: 0.4 }
        }}
        className="relative z-10 w-full max-w-[460px] mx-4 p-8 rounded-[28px] bg-gradient-to-br from-white/40 via-white/25 to-white/35 backdrop-blur-2xl border border-white/60 shadow-[0_0_60px_rgba(255,255,255,0.5),0_0_40px_rgba(147,197,253,0.15),0_8px_32px_rgba(59,130,246,0.1),0_20px_60px_rgba(0,0,0,0.08),inset_0_2px_2px_rgba(255,255,255,0.8)] max-h-[90vh] overflow-y-auto"
      >
        {/* Logo */}
        <motion.div 
          className="text-center mb-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <img 
            src="/logo.svg" 
            alt="Huanvae Chat" 
            className="w-16 h-16 mx-auto mb-3 drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-800 to-blue-500 bg-clip-text text-transparent">
            创建账号
          </h1>
          <p className="text-sm text-slate-500 mt-1">加入 Huanvae Chat</p>
        </motion.div>

        {/* 错误提示 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm"
          >
            {error}
          </motion.div>
        )}

        {/* 注册表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 pl-1">用户 ID</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                minLength={3}
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                placeholder="至少3个字符"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 pl-1">昵称</label>
            <div className="relative">
              <Smile className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="您的昵称"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 pl-1">邮箱</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="your@email.com"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 pl-1">密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少8位，包含字母和数字"
                className={inputClass}
              />
            </div>
            {formData.password && (
              <div className="mt-2 p-3 bg-white/30 rounded-lg space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>密码强度</span>
                  <span className={
                    strengthScore === 3 ? 'text-green-600' : 
                    strengthScore === 2 ? 'text-yellow-600' : 'text-red-500'
                  }>
                    {strengthScore === 3 ? '强' : strengthScore === 2 ? '中' : '弱'}
                  </span>
                </div>
                <div className="h-1 bg-white/50 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      strengthScore === 3 ? 'bg-green-500' : 
                      strengthScore === 2 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(strengthScore / 3) * 100}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className={`flex items-center gap-1 ${passwordStrength.length ? 'text-green-600' : 'text-slate-400'}`}>
                    <Check size={10} />8+字符
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasLetter ? 'text-green-600' : 'text-slate-400'}`}>
                    <Check size={10} />字母
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasNumber ? 'text-green-600' : 'text-slate-400'}`}>
                    <Check size={10} />数字
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-600 pl-1">确认密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="再次输入密码"
                className={inputClass}
              />
            </div>
            {formData.confirmPassword && (
              <div className={`text-xs flex items-center gap-1 mt-2 ${passwordMatch ? 'text-green-600' : 'text-red-500'}`}>
                <Check size={12} />
                {passwordMatch ? '密码匹配' : '密码不匹配'}
              </div>
            )}
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 mt-6 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-blue-400/70 via-blue-500/70 to-blue-600/70 backdrop-blur-lg border border-white/40 shadow-[0_0_30px_rgba(96,165,250,0.25),0_8px_20px_rgba(59,130,246,0.25),inset_0_1px_1px_rgba(255,255,255,0.5)] transition-all hover:from-blue-400/80 hover:via-blue-500/80 hover:to-blue-600/80 hover:shadow-[0_0_40px_rgba(96,165,250,0.35),0_12px_28px_rgba(59,130,246,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  注册中...
                </>
              ) : (
                <>
                  创建账号
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </span>
          </motion.button>
        </form>

        {/* 分隔线 */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
          <span className="text-slate-400 text-xs">或</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
        </div>

        {/* 登录链接 */}
        <div className="text-center">
          <p className="text-slate-500 text-xs mb-2">
            已有账号？
          </p>
          <Link href="/login">
            <motion.button
              type="button"
              className="w-full py-2.5 px-6 rounded-xl font-medium text-sm text-blue-500 bg-blue-100/20 border border-blue-300/30 hover:bg-blue-100/40 transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              立即登录
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
