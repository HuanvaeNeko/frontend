'use client'

import { motion } from 'framer-motion'

export default function LoadingAnimation() {
  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="text-center">
        {/* Logo */}
        <motion.div 
          className="mb-8 inline-block"
          animate={{ scale: [1, 1.1, 1], opacity: [1, 0.8, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <img 
            src="/logo.svg" 
            alt="Huanvae Chat" 
            className="w-24 h-24 drop-shadow-2xl"
          />
        </motion.div>

        {/* 品牌名称 */}
        <h1 className="text-4xl font-black mb-4 gradient-text">
          Huanvae Chat
        </h1>

        {/* 加载点 */}
        <div className="flex gap-2 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 rounded-full bg-primary"
              animate={{ y: [-8, 0], opacity: [0.4, 1] }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                repeatType: 'reverse',
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* 加载文字 */}
        <p className="mt-6 text-muted-foreground text-sm">正在加载...</p>
      </div>

      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
    </div>
  )
}
