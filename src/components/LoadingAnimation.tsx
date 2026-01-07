'use client'

import { motion } from 'framer-motion'
import { BackgroundOrbs } from '@/components/ui/glass'

export default function LoadingAnimation() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 relative overflow-hidden">
      <BackgroundOrbs count={5} />

      {/* 加载内容 */}
      <div className="relative z-10 text-center">
        {/* Logo */}
        <motion.div 
          className="mb-8 inline-block"
          animate={{ 
            scale: [1, 1.08, 1], 
            rotate: [0, 3, -3, 0]
          }}
          transition={{ 
            duration: 2.5, 
            repeat: Infinity, 
            ease: 'easeInOut' 
          }}
        >
          <div className="relative">
            {/* 光环效果 */}
            <motion.div
              className="absolute inset-0 rounded-3xl bg-gradient-to-r from-blue-400/30 to-purple-400/30 blur-2xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <img 
              src="/logo.svg" 
              alt="Huanvae Chat" 
              className="w-28 h-28 relative z-10 drop-shadow-2xl"
            />
          </div>
        </motion.div>

        {/* 品牌名称 */}
        <motion.h1 
          className="text-4xl font-black mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{
            background: 'linear-gradient(135deg, #1e40af, #3b82f6, #0ea5e9)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Huanvae Chat
        </motion.h1>

        {/* 加载指示器 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col items-center gap-6"
        >
          {/* 加载点 */}
          <div className="flex gap-3 justify-center">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-3 h-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)'
                }}
                animate={{ 
                  y: [-8, 4, -8],
                  scale: [1, 1.2, 1],
                  opacity: [0.6, 1, 0.6]
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.12,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>

          {/* 加载文字 */}
          <motion.p 
            className="text-gray-400 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            正在加载...
          </motion.p>
        </motion.div>
      </div>
    </div>
  )
}
