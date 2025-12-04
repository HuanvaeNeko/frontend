import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { Bot, ArrowRight, Star, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { 
  slideLeftVariants, 
  slideRightVariants, 
  staggerContainer,
  staggerItem,
  scaleInVariants, 
  shakeVariants,
  floatVariants,
  DURATION 
} from '../utils/motionAnimations'

export default function Login() {
  const navigate = useNavigate()
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
      navigate('/')
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
    <div className="min-h-screen flex">
      {/* 左侧 - 品牌展示区 */}
      <motion.div
        variants={slideLeftVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: DURATION.slow }}
        className="hidden lg:flex lg:w-1/2 gradient-bg-blue p-12 relative overflow-hidden"
      >
        {/* 背景装饰 */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center text-white">
          <motion.div variants={floatVariants} animate="animate" className="mb-8">
            <Bot size={96} strokeWidth={1.5} />
          </motion.div>
          <h1 className="text-6xl font-black mb-6 leading-tight">
            HuanVae<br/>Chat
          </h1>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
            className="space-y-4 text-xl font-light"
          >
            <motion.div variants={staggerItem} className="flex items-center gap-3">
              <Star size={24} fill="currentColor" />
              <span>AI 智能对话</span>
            </motion.div>
            <motion.div variants={staggerItem} className="flex items-center gap-3">
              <Star size={24} fill="currentColor" />
              <span>实时群组聊天</span>
            </motion.div>
            <motion.div variants={staggerItem} className="flex items-center gap-3">
              <Star size={24} fill="currentColor" />
              <span>高清视频会议</span>
            </motion.div>
          </motion.div>
          <div className="mt-12 text-white/70">
            <p className="text-lg">体验新一代智能通讯平台</p>
          </div>
        </div>
      </motion.div>

      {/* 右侧 - 登录表单区 */}
      <motion.div
        variants={slideRightVariants}
        initial="hidden"
        animate="visible"
        transition={{ duration: DURATION.slow }}
        className="flex-1 flex items-center justify-center p-8 bg-gray-50"
      >
        <motion.div
          variants={scaleInVariants}
          initial="hidden"
          animate={shouldShake ? "shake" : "visible"}
          transition={{ delay: 0.4, duration: DURATION.slow }}
          className="w-full max-w-md"
        >
          {/* Logo for mobile */}
          <div className="lg:hidden text-center mb-8">
            <Bot size={64} strokeWidth={1.5} className="text-primary mb-4 mx-auto" />
            <h1 className="text-4xl font-black gradient-text">
              HuanVae Chat
            </h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">欢迎回来</h2>
            <p className="text-muted-foreground">登录您的账号，继续精彩体验</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6 animate-shake">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="user_id" className="font-semibold">用户ID</Label>
              <Input
                id="user_id"
                type="text"
                required
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                placeholder="输入您的用户ID"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-semibold">密码</Label>
              <Input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="输入您的密码"
                className="h-12"
              />
              <div className="flex justify-end">
                <a href="#" className="text-sm text-primary hover:underline">
                  忘记密码？
                </a>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="ml-2 h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          <div className="my-8">
            <Separator className="my-4" />
            <p className="text-center text-sm text-muted-foreground">或</p>
          </div>

          <div className="text-center">
            <p className="text-muted-foreground mb-4">
              还没有账号？
            </p>
            <Link to="/register">
              <Button variant="outline" className="w-full h-12 font-semibold">
                立即注册
              </Button>
            </Link>
          </div>

          <div className="mt-12 text-center text-sm text-muted-foreground">
            <p>登录即表示您同意我们的</p>
            <p>
              <a href="#" className="text-primary hover:underline">服务条款</a>
              {' '}和{' '}
              <a href="#" className="text-primary hover:underline">隐私政策</a>
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
