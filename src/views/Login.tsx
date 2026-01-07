'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { ArrowRight, Loader2, User, Lock } from 'lucide-react'
import { BackgroundOrbs } from '@/components/ui/glass'

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
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-100 via-slate-50 to-purple-100">
      <BackgroundOrbs count={5} />

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
        className="relative z-10 w-full max-w-[420px] mx-4 p-10 rounded-[28px] bg-gradient-to-br from-white/40 via-white/25 to-white/35 backdrop-blur-2xl border border-white/60 shadow-[0_0_60px_rgba(255,255,255,0.5),0_0_40px_rgba(147,197,253,0.15),0_8px_32px_rgba(59,130,246,0.1),0_20px_60px_rgba(0,0,0,0.08),inset_0_2px_2px_rgba(255,255,255,0.8)]"
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
          <h1 className="text-[28px] font-bold bg-gradient-to-r from-blue-800 to-blue-500 bg-clip-text text-transparent">
            Huanvae Chat
          </h1>
          <p className="text-sm text-slate-500 mt-2">智能通讯平台</p>
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
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-600 pl-1">用户 ID</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                required
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                placeholder="请输入用户ID"
                className="w-full pl-12 pr-4 py-3.5 text-sm text-slate-800 bg-gradient-to-br from-white/50 to-white/35 backdrop-blur-xl border border-white/70 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-blue-300/60 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1),0_0_30px_rgba(147,197,253,0.25)]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-600 pl-1">密码</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
                className="w-full pl-12 pr-4 py-3.5 text-sm text-slate-800 bg-gradient-to-br from-white/50 to-white/35 backdrop-blur-xl border border-white/70 rounded-xl outline-none transition-all placeholder:text-slate-400 focus:border-blue-300/60 focus:shadow-[0_0_0_4px_rgba(59,130,246,0.1),0_0_30px_rgba(147,197,253,0.25)]"
              />
            </div>
          </div>

          <motion.button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 mt-6 rounded-xl font-semibold text-white text-base bg-gradient-to-r from-blue-400/70 via-blue-500/70 to-blue-600/70 backdrop-blur-lg border border-white/40 shadow-[0_0_30px_rgba(96,165,250,0.25),0_8px_20px_rgba(59,130,246,0.25),inset_0_1px_1px_rgba(255,255,255,0.5)] transition-all hover:from-blue-400/80 hover:via-blue-500/80 hover:to-blue-600/80 hover:shadow-[0_0_40px_rgba(96,165,250,0.35),0_12px_28px_rgba(59,130,246,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
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
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
          <span className="text-slate-400 text-sm">或</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
        </div>

        {/* 注册链接 */}
        <div className="text-center">
          <p className="text-slate-500 text-sm mb-3">
            还没有账号？
          </p>
          <Link href="/register">
            <motion.button
              type="button"
              className="w-full py-3 px-6 rounded-xl font-medium text-blue-500 bg-blue-100/20 border border-blue-300/30 hover:bg-blue-100/40 transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              立即注册
            </motion.button>
          </Link>
        </div>

        {/* 服务条款 */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>登录即表示您同意我们的</p>
          <p className="mt-1">
            <a href="#" className="text-blue-500 hover:underline">服务条款</a>
            {' '}和{' '}
            <a href="#" className="text-blue-500 hover:underline">隐私政策</a>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
