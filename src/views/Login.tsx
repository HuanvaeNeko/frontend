'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { ArrowRight, Loader2, User, Lock } from 'lucide-react'

export default function Login() {
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  
  const [formData, setFormData] = useState({
    user_id: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shouldShake, setShouldShake] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(formData)
      router.push('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '登录失败，请检查用户名和密码'
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

      {/* 毛玻璃登录卡片 */}
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
        className="glass-card"
      >
        {/* Logo */}
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <img 
            src="/logo.svg" 
            alt="Huanvae Chat" 
            className="w-20 h-20 mx-auto mb-4 drop-shadow-lg"
          />
          <h1 className="login-title">Huanvae Chat</h1>
          <p className="login-subtitle">智能通讯平台</p>
        </motion.div>

        {/* 错误提示 */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm"
          >
            {error}
          </motion.div>
        )}

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="form-group">
            <label className="form-label">用户 ID</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-light)]" />
              <input
                type="text"
                required
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                placeholder="请输入用户ID"
                className="glass-input pl-12"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-light)]" />
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                className="glass-input pl-12"
              />
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            className="glass-button mt-6"
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
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--blue-alpha-medium)] to-transparent" />
          <span className="text-[var(--color-text-light)] text-sm">或</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--blue-alpha-medium)] to-transparent" />
        </div>

        {/* 注册链接 */}
        <div className="text-center">
          <p className="text-[var(--color-text-muted)] text-sm mb-3">
            还没有账号？
          </p>
          <Link href="/register">
            <motion.button
              type="button"
              className="w-full py-3 px-6 rounded-xl font-medium text-[var(--color-blue-500)] 
                         bg-[var(--blue-alpha-subtle)] border border-[var(--blue-alpha-medium)]
                         hover:bg-[var(--blue-alpha-medium)] transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              立即注册
            </motion.button>
          </Link>
        </div>

        {/* 服务条款 */}
        <div className="mt-8 text-center text-xs text-[var(--color-text-light)]">
          <p>登录即表示您同意我们的</p>
          <p className="mt-1">
            <a href="#" className="text-link">服务条款</a>
            {' '}和{' '}
            <a href="#" className="text-link">隐私政策</a>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
