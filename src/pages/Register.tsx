import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { Bot, ArrowRight, Check, Loader2 } from 'lucide-react'
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
  pulseVariants,
  DURATION 
} from '../utils/motionAnimations'

export default function Register() {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  
  const [formData, setFormData] = useState({
    user_id: '',
    nickname: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shouldShake, setShouldShake] = useState(false)

  // 密码强度检查
  const passwordStrength = {
    length: formData.password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
  }
  const strengthScore = Object.values(passwordStrength).filter(Boolean).length
  const passwordMatch = formData.password && formData.password === formData.confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      setShouldShake(true)
      setTimeout(() => setShouldShake(false), 500)
      return
    }

    if (!passwordStrength.length || !passwordStrength.hasLetter || !passwordStrength.hasNumber) {
      setError('密码必须至少8位，包含字母和数字')
      setShouldShake(true)
      setTimeout(() => setShouldShake(false), 500)
      return
    }

    setLoading(true)

    try {
      await register({
        user_id: formData.user_id,
        nickname: formData.nickname,
        email: formData.email,
        password: formData.password,
      })
      navigate('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '注册失败，请稍后重试'
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
        className="hidden lg:flex lg:w-1/2 gradient-bg-purple p-12 relative overflow-hidden"
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center text-white">
          <motion.div 
            variants={pulseVariants}
            animate="animate"
            className="mb-8"
          >
            <Bot size={96} strokeWidth={1.5} />
          </motion.div>
          <h1 className="text-6xl font-black mb-6 leading-tight">
            开始你的<br/>智能之旅
          </h1>
          <p className="text-xl font-light mb-8">
            加入 HuanVae Chat，体验全新的智能通讯方式
          </p>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            <motion.div variants={staggerItem} className="flex items-center gap-3 text-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check size={20} />
              </div>
              <span>永久免费使用</span>
            </motion.div>
            <motion.div variants={staggerItem} className="flex items-center gap-3 text-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check size={20} />
              </div>
              <span>AI 智能助手</span>
            </motion.div>
            <motion.div variants={staggerItem} className="flex items-center gap-3 text-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check size={20} />
              </div>
              <span>安全加密通讯</span>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* 右侧 - 注册表单区 */}
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
          <div className="lg:hidden text-center mb-8">
            <Bot size={64} strokeWidth={1.5} className="text-purple-500 mb-4 mx-auto" />
            <h1 className="text-4xl font-black gradient-text">HuanVae Chat</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">创建账号</h2>
            <p className="text-muted-foreground">填写信息，开始您的智能体验</p>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-6 animate-shake">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="user_id">用户ID</Label>
              <Input
                id="user_id"
                required
                minLength={3}
                value={formData.user_id}
                onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                placeholder="至少3个字符"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nickname">昵称</Label>
              <Input
                id="nickname"
                required
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="您的昵称"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="your@email.com"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="至少8位，包含字母和数字"
                className="h-12"
              />
              {formData.password && (
                <div className="mt-2 p-3 bg-gray-100 rounded-lg space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>密码强度</span>
                    <span>{strengthScore === 3 ? '强' : strengthScore === 2 ? '中' : '弱'}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        strengthScore === 3 ? 'bg-green-500' : 
                        strengthScore === 2 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${(strengthScore / 3) * 100}%` }}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className={`text-xs flex items-center gap-2 ${passwordStrength.length ? 'text-green-600' : 'text-gray-400'}`}>
                      <Check size={14} />至少8个字符
                    </div>
                    <div className={`text-xs flex items-center gap-2 ${passwordStrength.hasLetter ? 'text-green-600' : 'text-gray-400'}`}>
                      <Check size={14} />包含字母
                    </div>
                    <div className={`text-xs flex items-center gap-2 ${passwordStrength.hasNumber ? 'text-green-600' : 'text-gray-400'}`}>
                      <Check size={14} />包含数字
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="再次输入密码"
                className="h-12"
              />
              {formData.confirmPassword && (
                <div className={`text-xs flex items-center gap-2 ${passwordMatch ? 'text-green-600' : 'text-red-600'}`}>
                  <Check size={14} />
                  {passwordMatch ? '密码匹配' : '密码不匹配'}
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  注册中...
                </>
              ) : (
                <>
                  创建账号
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
            <p className="text-muted-foreground mb-4">已有账号？</p>
            <Link to="/login">
              <Button variant="outline" className="w-full h-12 font-semibold">
                立即登录
              </Button>
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
