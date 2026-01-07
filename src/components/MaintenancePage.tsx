'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Server, Wifi, WifiOff } from 'lucide-react'
import { GlassCard, GlassButton, BackgroundOrbs } from '@/components/ui/glass'

interface MaintenancePageProps {
  error: {
    message: string
    details?: string
    status?: number
    url?: string
    timestamp?: string
  }
  onRetry: () => void
  isRetrying?: boolean
}

export default function MaintenancePage({ error, onRetry, isRetrying }: MaintenancePageProps) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 flex items-center justify-center p-6 relative overflow-hidden">
      <BackgroundOrbs count={4} />

      <motion.div
        className="max-w-lg w-full relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* 主卡片 */}
        <GlassCard className="p-8 text-center">
          {/* 图标区域 */}
          <div className="mb-6 relative">
            {/* 信号波动画 */}
            <div className="absolute inset-0 flex items-center justify-center">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute w-24 h-24 border-2 border-orange-300/50 rounded-full"
                  animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.4,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
            
            {/* 服务器图标 */}
            <motion.div
              className="w-24 h-24 mx-auto rounded-2xl bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center relative shadow-lg shadow-orange-200/50"
              animate={{ scale: [1, 1.05, 1], opacity: [0.9, 1, 0.9] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Server className="h-12 w-12 text-orange-500" />
              
              {/* 断开连接图标 */}
              <motion.div
                className="absolute -bottom-1 -right-1 bg-red-500 rounded-xl p-2 shadow-lg shadow-red-500/30"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 500 }}
              >
                <WifiOff className="h-4 w-4 text-white" />
              </motion.div>
            </motion.div>
          </div>

          {/* 标题 */}
          <motion.h1
            className="text-2xl font-bold text-gray-800 mb-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            服务暂时不可用
          </motion.h1>
          <motion.p
            className="text-gray-500 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            无法连接到服务器，请稍后重试
          </motion.p>

          {/* 错误摘要 */}
          <motion.div
            className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-xl p-4 mb-6"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-start gap-3">
              <motion.div
                animate={isRetrying ? { rotate: [0, -10, 10, 0] } : {}}
                transition={{ duration: 0.5, repeat: isRetrying ? Infinity : 0 }}
              >
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              </motion.div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">
                  {error.message || '连接失败'}
                </p>
                {error.status && (
                  <p className="text-xs text-red-600 mt-1">
                    HTTP 状态码: {error.status}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* 重试按钮 */}
          <GlassButton
            onClick={onRetry}
            loading={isRetrying}
            className="w-full mb-4"
            size="lg"
          >
            <RefreshCw size={18} className={isRetrying ? 'animate-spin' : ''} />
            {isRetrying ? '正在重试...' : '重新连接'}
          </GlassButton>

          {/* 展开详情 */}
          {(error.details || error.url) && (
            <motion.button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 mx-auto transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div animate={{ rotate: showDetails ? 180 : 0 }} transition={{ duration: 0.3 }}>
                {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </motion.div>
              {showDetails ? '隐藏详情' : '查看详情'}
            </motion.button>
          )}
        </GlassCard>

        {/* 详细错误信息 */}
        <AnimatePresence>
          {showDetails && (error.details || error.url) && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="overflow-hidden"
            >
              <GlassCard className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  错误详情
                </h3>
                <div className="space-y-3 text-xs">
                  {error.url && (
                    <div className="bg-gray-50/80 rounded-lg p-3">
                      <span className="text-gray-500 block mb-1">请求地址:</span>
                      <code className="text-gray-800 break-all">{error.url}</code>
                    </div>
                  )}
                  {error.timestamp && (
                    <div className="bg-gray-50/80 rounded-lg p-3">
                      <span className="text-gray-500 block mb-1">发生时间:</span>
                      <code className="text-gray-800">{error.timestamp}</code>
                    </div>
                  )}
                  {error.details && (
                    <div className="bg-gray-50/80 rounded-lg p-3">
                      <span className="text-gray-500 block mb-1">详细信息:</span>
                      <pre className="text-gray-800 whitespace-pre-wrap break-all font-mono text-xs">
                        {error.details}
                      </pre>
                    </div>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 提示信息 */}
        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <motion.div
            className="flex items-center justify-center gap-2 text-sm text-gray-500"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Wifi size={16} />
            <span>请检查您的网络连接</span>
          </motion.div>
          <p className="text-xs text-gray-400 mt-2">
            如果问题持续存在，请联系技术支持
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
