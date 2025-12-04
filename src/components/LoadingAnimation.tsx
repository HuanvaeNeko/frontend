import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'

export default function LoadingAnimation() {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-base-100 via-base-200 to-base-300 flex items-center justify-center z-50">
      <div className="text-center">
        {/* Logo */}
        <motion.div 
          className="mb-8 inline-block"
          animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center text-white shadow-2xl">
            <Bot size={48} strokeWidth={2} />
          </div>
        </motion.div>

        {/* 品牌名称 */}
        <h1 className="text-4xl font-black mb-4 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
          HuanVae Chat
        </h1>

        {/* 加载点 */}
        <div className="flex gap-2 justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`w-3 h-3 rounded-full ${
                i === 0 ? 'bg-primary' : i === 1 ? 'bg-secondary' : 'bg-accent'
              }`}
              animate={{ y: [-10, 0], opacity: [0.3, 1] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatType: 'reverse',
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>

        {/* 加载文字 */}
        <p className="mt-6 text-base-content/60 text-sm">正在加载惊艳体验...</p>
      </div>

      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-secondary/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
    </div>
  )
}
