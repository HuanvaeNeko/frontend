'use client'

import { Home, ArrowLeft, Ghost } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ROUTES } from '@/lib/routes'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-50">
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-20 left-[20%] w-72 h-72 bg-gradient-to-br from-blue-400/20 to-sky-400/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 right-[20%] w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-violet-400/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.4, 0.3],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      </div>

      {/* 内容卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 text-center px-8 py-12 max-w-md mx-4"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.4) 100%)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderRadius: '28px',
          border: '1px solid rgba(147, 197, 253, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.15), 0 0 0 1px rgba(255,255,255,0.5) inset',
        }}
      >
        {/* 幽灵图标 */}
        <motion.div
          className="mx-auto mb-6 w-24 h-24 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(147, 197, 253, 0.3) 0%, rgba(96, 165, 250, 0.2) 100%)',
          }}
          animate={{
            y: [0, -8, 0],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Ghost className="w-12 h-12 text-blue-500" />
        </motion.div>

        {/* 404 文字 */}
        <motion.div
          className="text-8xl font-black mb-4"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #0ea5e9 50%, #6366f1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          animate={{
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        >
          404
        </motion.div>
        
        <h1 className="text-2xl font-bold text-slate-700 mb-2">
          页面未找到
        </h1>
        <p className="text-slate-500 mb-8">
          抱歉，您访问的页面不存在或已被移除
        </p>
        
        {/* 按钮组 */}
        <div className="flex gap-4 justify-center">
          <motion.button
            onClick={() => router.back()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-slate-600 transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(147, 197, 253, 0.3)',
            }}
            whileHover={{ 
              scale: 1.02,
              background: 'rgba(147, 197, 253, 0.2)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={18} />
            返回上页
          </motion.button>
          
          <Link href={ROUTES.app.chat}>
            <motion.button
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)',
              }}
              whileHover={{ 
                scale: 1.02,
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.5)',
              }}
              whileTap={{ scale: 0.98 }}
            >
              <Home size={18} />
              返回首页
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
