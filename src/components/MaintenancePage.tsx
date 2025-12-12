import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Server, Wifi, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fadeInVariants,
  slideUpVariants,
  scaleInVariants,
  staggerContainer,
  staggerItem,
  EASING,
  DURATION,
} from '../utils/motionAnimations'

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

// 服务器图标动画 - 呼吸效果
const serverPulseVariants = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [0.8, 1, 0.8],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// 信号波动画
const signalWaveVariants = {
  animate: (i: number) => ({
    scale: [1, 2.5],
    opacity: [0.6, 0],
    transition: {
      duration: 2,
      repeat: Infinity,
      delay: i * 0.4,
      ease: 'easeOut',
    },
  }),
}

// 错误图标摇晃动画
const shakeVariants = {
  shake: {
    x: [-8, 8, -6, 6, -4, 4, 0],
    transition: {
      duration: 0.5,
    },
  },
}

// 详情展开动画
const detailsVariants = {
  hidden: {
    opacity: 0,
    height: 0,
    marginTop: 0,
  },
  visible: {
    opacity: 1,
    height: 'auto',
    marginTop: 16,
    transition: {
      duration: DURATION.normal,
      ease: EASING.smooth,
      staggerChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginTop: 0,
    transition: {
      duration: DURATION.fast,
    },
  },
}

// 详情项动画
const detailItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATION.fast,
      ease: EASING.smooth,
    },
  },
}

// 网络状态动画
const wifiPulseVariants = {
  animate: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

export default function MaintenancePage({ error, onRetry, isRetrying }: MaintenancePageProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)

  const handleRetry = () => {
    setShakeKey(prev => prev + 1) // 触发重新摇晃动画
    onRetry()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 flex items-center justify-center p-6 overflow-hidden">
      {/* 背景装饰动画 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-20 w-64 h-64 bg-orange-200/30 rounded-full blur-3xl"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-80 h-80 bg-red-200/20 rounded-full blur-3xl"
          animate={{
            x: [0, -25, 0],
            y: [0, 25, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <motion.div
        className="max-w-lg w-full relative z-10"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {/* 主卡片 */}
        <motion.div
          className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 text-center border border-white/50"
          variants={scaleInVariants}
        >
          {/* 图标区域 */}
          <motion.div className="mb-6 relative" variants={staggerItem}>
            {/* 信号波动画 */}
            <div className="absolute inset-0 flex items-center justify-center">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute w-24 h-24 border-2 border-orange-300 rounded-full"
                  variants={signalWaveVariants}
                  animate="animate"
                  custom={i}
                />
              ))}
            </div>
            
            {/* 服务器图标 */}
            <motion.div
              className="w-24 h-24 mx-auto bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center relative shadow-lg"
              variants={serverPulseVariants}
              animate="animate"
            >
              <Server className="h-12 w-12 text-orange-500" />
              
              {/* 断开连接的小图标 */}
              <motion.div
                className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1.5 shadow-md"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 500 }}
              >
                <WifiOff className="h-3.5 w-3.5 text-white" />
              </motion.div>
            </motion.div>
          </motion.div>

          {/* 标题 */}
          <motion.h1
            className="text-2xl font-bold text-gray-900 mb-2"
            variants={slideUpVariants}
          >
            服务暂时不可用
          </motion.h1>
          <motion.p
            className="text-gray-600 mb-6"
            variants={slideUpVariants}
          >
            无法连接到服务器，请稍后重试或联系管理员
          </motion.p>

          {/* 错误摘要 */}
          <motion.div
            key={shakeKey}
            className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
            variants={shakeVariants}
            initial="hidden"
            animate={isRetrying ? 'shake' : 'visible'}
          >
            <div className="flex items-start gap-3">
              <motion.div
                animate={isRetrying ? { rotate: [0, -10, 10, -10, 0] } : {}}
                transition={{ duration: 0.5 }}
              >
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              </motion.div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800">
                  {error.message || '连接失败'}
                </p>
                {error.status && (
                  <motion.p
                    className="text-xs text-red-600 mt-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    HTTP 状态码: {error.status}
                  </motion.p>
                )}
              </div>
            </div>
          </motion.div>

          {/* 重试按钮 */}
          <motion.div variants={staggerItem}>
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full mb-4 gap-2 h-12 text-base"
              size="lg"
            >
              <motion.div
                animate={isRetrying ? { rotate: 360 } : { rotate: 0 }}
                transition={{
                  duration: 1,
                  repeat: isRetrying ? Infinity : 0,
                  ease: 'linear',
                }}
              >
                <RefreshCw className="h-5 w-5" />
              </motion.div>
              {isRetrying ? '正在重试...' : '重新连接'}
            </Button>
          </motion.div>

          {/* 展开详情按钮 */}
          {(error.details || error.url) && (
            <motion.button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 mx-auto transition-colors"
              variants={fadeInVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.div
                animate={{ rotate: showDetails ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                {showDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </motion.div>
              {showDetails ? '隐藏详情' : '查看详情'}
            </motion.button>
          )}
        </motion.div>

        {/* 详细错误信息 */}
        <AnimatePresence>
          {showDetails && (error.details || error.url) && (
            <motion.div
              className="bg-white/90 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-white/50 overflow-hidden"
              variants={detailsVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <motion.h3
                className="text-sm font-semibold text-gray-700 mb-3"
                variants={detailItemVariants}
              >
                错误详情
              </motion.h3>
              <div className="space-y-3 text-xs">
                {error.url && (
                  <motion.div
                    className="bg-gray-50 rounded-lg p-3"
                    variants={detailItemVariants}
                  >
                    <span className="text-gray-500 block mb-1">请求地址:</span>
                    <code className="text-gray-800 break-all">{error.url}</code>
                  </motion.div>
                )}
                {error.timestamp && (
                  <motion.div
                    className="bg-gray-50 rounded-lg p-3"
                    variants={detailItemVariants}
                  >
                    <span className="text-gray-500 block mb-1">发生时间:</span>
                    <code className="text-gray-800">{error.timestamp}</code>
                  </motion.div>
                )}
                {error.details && (
                  <motion.div
                    className="bg-gray-50 rounded-lg p-3"
                    variants={detailItemVariants}
                  >
                    <span className="text-gray-500 block mb-1">详细信息:</span>
                    <pre className="text-gray-800 whitespace-pre-wrap break-all font-mono text-xs">
                      {error.details}
                    </pre>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 提示信息 */}
        <motion.div
          className="mt-6 text-center"
          variants={fadeInVariants}
        >
          <motion.div
            className="flex items-center justify-center gap-2 text-sm text-gray-500"
            variants={wifiPulseVariants}
            animate="animate"
          >
            <Wifi className="h-4 w-4" />
            <span>请检查您的网络连接</span>
          </motion.div>
          <motion.p
            className="text-xs text-gray-400 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            如果问题持续存在，请联系技术支持
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  )
}
