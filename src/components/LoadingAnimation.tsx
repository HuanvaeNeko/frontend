'use client'

import { motion } from 'framer-motion'

export default function LoadingAnimation() {
  return (
    <div className="app-container">
      {/* 浮动装饰圆球 */}
      <div className="floating-orb orb-1" />
      <div className="floating-orb orb-2" />
      <div className="floating-orb orb-3" />
      <div className="floating-orb orb-4" />
      <div className="floating-orb orb-5" />

      {/* 加载内容 */}
      <div className="text-center z-10">
        {/* Logo */}
        <motion.div 
          className="mb-8 inline-block"
          animate={{ 
            scale: [1, 1.1, 1], 
            opacity: [1, 0.8, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            ease: 'easeInOut' 
          }}
        >
          <img 
            src="/logo.svg" 
            alt="Huanvae Chat" 
            className="w-28 h-28 drop-shadow-2xl"
          />
        </motion.div>

        {/* 品牌名称 */}
        <motion.h1 
          className="text-4xl font-black mb-4 gradient-text"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          Huanvae Chat
        </motion.h1>

        {/* 加载点 */}
        <div className="flex gap-3 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 rounded-full"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)'
              }}
              animate={{ 
                y: [-10, 0, -10],
                scale: [1, 1.2, 1]
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* 加载文字 */}
        <motion.p 
          className="mt-6 text-[var(--color-text-muted)] text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          正在加载...
        </motion.p>
      </div>
    </div>
  )
}
