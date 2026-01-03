'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { ArrowRight, Check, Loader2, User, Lock, Mail, Smile } from 'lucide-react'

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

  return (
    <div className="app-container">
      {/* 浮动装饰圆球 */}
      <div className="floating-orb orb-1" />
      <div className="floating-orb orb-2" />
      <div className="floating-orb orb-3" />
      <div className="floating-orb orb-4" />
      <div className="floating-orb orb-5" />

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
        className="glass-card max-w-[460px]"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
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
          <h1 className="login-title text-2xl">创建账号</h1>
          <p className="login-subtitle text-sm">加入 Huanvae Chat</p>
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
          <div className="form-group !mb-4">
            <label className="form-label text-xs">用户 ID</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
              <input
                type="text"
                required
                minLength={3}
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                placeholder="至少3个字符"
                className="glass-input pl-11 py-3 text-sm"
              />
            </div>
          </div>

          <div className="form-group !mb-4">
            <label className="form-label text-xs">昵称</label>
            <div className="relative">
              <Smile className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
              <input
                type="text"
                required
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="您的昵称"
                className="glass-input pl-11 py-3 text-sm"
              />
            </div>
          </div>

          <div className="form-group !mb-4">
            <label className="form-label text-xs">邮箱</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="your@email.com"
                className="glass-input pl-11 py-3 text-sm"
              />
            </div>
          </div>

          <div className="form-group !mb-4">
            <label className="form-label text-xs">密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
              <input
                type="password"
                required
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少8位，包含字母和数字"
                className="glass-input pl-11 py-3 text-sm"
              />
            </div>
            {formData.password && (
              <div className="mt-2 p-3 bg-white/30 rounded-lg space-y-2">
                <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
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
                  <span className={`flex items-center gap-1 ${passwordStrength.length ? 'text-green-600' : 'text-[var(--color-text-light)]'}`}>
                    <Check size={10} />8+字符
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasLetter ? 'text-green-600' : 'text-[var(--color-text-light)]'}`}>
                    <Check size={10} />字母
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasNumber ? 'text-green-600' : 'text-[var(--color-text-light)]'}`}>
                    <Check size={10} />数字
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="form-group !mb-4">
            <label className="form-label text-xs">确认密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]" />
              <input
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="再次输入密码"
                className="glass-input pl-11 py-3 text-sm"
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
            className="glass-button !mt-6 !py-3"
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            <span className="flex items-center justify-center gap-2 text-sm">
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
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--blue-alpha-medium)] to-transparent" />
          <span className="text-[var(--color-text-light)] text-xs">或</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--blue-alpha-medium)] to-transparent" />
        </div>

        {/* 登录链接 */}
        <div className="text-center">
          <p className="text-[var(--color-text-muted)] text-xs mb-2">
            已有账号？
          </p>
          <Link href="/login">
            <motion.button
              type="button"
              className="w-full py-2.5 px-6 rounded-xl font-medium text-sm text-[var(--color-blue-500)] 
                         bg-[var(--blue-alpha-subtle)] border border-[var(--blue-alpha-medium)]
                         hover:bg-[var(--blue-alpha-medium)] transition-all duration-300"
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
