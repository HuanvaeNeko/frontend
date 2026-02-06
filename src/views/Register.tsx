'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { 
  ArrowRight, 
  Check, 
  Loader2, 
  User, 
  Lock, 
  Mail, 
  Smile,
  Eye,
  EyeOff,
  Sparkles,
  Zap,
  Globe,
  Heart,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'


// 密码强度指示器
const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const strength = {
    length: password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  }
  const score = Object.values(strength).filter(Boolean).length

  if (!password) return null

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-2 p-3 rounded-lg bg-muted space-y-2"
    >
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">密码强度</span>
        <span className={
          score === 3 ? 'text-emerald-600 font-medium' : 
          score === 2 ? 'text-amber-600 font-medium' : 'text-red-500 font-medium'
        }>
          {score === 3 ? '强' : score === 2 ? '中' : '弱'}
        </span>
      </div>
      <Progress 
        value={(score / 3) * 100} 
        className={`h-1.5 ${
          score === 3 ? '[&>div]:bg-emerald-500' : 
          score === 2 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500'
        }`}
      />
      <div className="flex flex-wrap gap-3 text-xs">
        <span className={`flex items-center gap-1 ${strength.length ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {strength.length ? <Check size={12} /> : <X size={12} />}
          8+ 字符
        </span>
        <span className={`flex items-center gap-1 ${strength.hasLetter ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {strength.hasLetter ? <Check size={12} /> : <X size={12} />}
          包含字母
        </span>
        <span className={`flex items-center gap-1 ${strength.hasNumber ? 'text-emerald-600' : 'text-muted-foreground'}`}>
          {strength.hasNumber ? <Check size={12} /> : <X size={12} />}
          包含数字
        </span>
      </div>
    </motion.div>
  )
}

export default function Register() {
  const router = useRouter()
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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    warmupSound()
  }, [])

  const passwordStrength = {
    length: formData.password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
  }
  const passwordMatch = formData.password && formData.password === formData.confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!agreeTerms) {
      setError('请阅读并同意服务条款和隐私政策')
      playError()
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      playError()
      return
    }

    if (!passwordStrength.length || !passwordStrength.hasLetter || !passwordStrength.hasNumber) {
      setError('密码必须至少8位，包含字母和数字')
      playError()
      return
    }

    setLoading(true)
    playButton()

    try {
      await register({
        user_id: formData.user_id,
        nickname: formData.nickname,
        email: formData.email,
        password: formData.password,
      })
      playSuccess()
      router.push('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '注册失败，请稍后重试'
      setError(errorMsg)
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen w-full flex">
      {/* 左侧注册表单 */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-6 sm:p-12 bg-background overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[440px] py-8"
        >
          {/* 移动端 Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Huanvae Chat</h1>
            <p className="text-muted-foreground mt-1">智能通讯平台</p>
          </div>

          <Card className="border-0 shadow-none bg-transparent">
            <CardHeader className="px-0">
              <CardTitle className="text-2xl">创建账户 ✨</CardTitle>
              <CardDescription>加入我们，开启智能通讯之旅</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm overflow-hidden"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user_id">用户 ID</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="user_id"
                      type="text"
                      required
                      minLength={3}
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      placeholder="至少 3 个字符"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nickname">昵称</Label>
                  <div className="relative">
                    <Smile className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="nickname"
                      type="text"
                      required
                      value={formData.nickname}
                      onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                      placeholder="您的显示名称"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">邮箱</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="your@email.com"
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="至少 8 位，包含字母和数字"
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrengthIndicator password={formData.password} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认密码</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="再次输入密码"
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {formData.confirmPassword && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`text-xs flex items-center gap-1 mt-1 ${
                        passwordMatch ? 'text-emerald-600' : 'text-destructive'
                      }`}
                    >
                      {passwordMatch ? <Check size={14} /> : <X size={14} />}
                      {passwordMatch ? '密码匹配' : '密码不匹配'}
                    </motion.div>
                  )}
                </div>

                <div className="pt-1">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => {
                        setAgreeTerms(e.target.checked)
                        playTap()
                      }}
                      className="w-4 h-4 mt-0.5 rounded border-input text-primary focus:ring-ring focus:ring-offset-0"
                    />
                    <span className="text-sm text-muted-foreground">
                      我已阅读并同意{' '}
                      <a href="#" className="text-primary hover:underline">服务条款</a>
                      {' '}和{' '}
                      <a href="#" className="text-primary hover:underline">隐私政策</a>
                    </span>
                  </label>
                </div>

                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      注册中...
                    </>
                  ) : (
                    <>
                      创建账户
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="flex items-center gap-4 my-6">
                <Separator className="flex-1" />
                <span className="text-muted-foreground text-sm">或</span>
                <Separator className="flex-1" />
              </div>

              <div className="text-center">
                <p className="text-muted-foreground mb-3 text-sm">已有账户？</p>
                <Link href="/login">
                  <Button variant="outline" className="w-full" size="lg">
                    立即登录
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* 右侧品牌区域 */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
        
        <div className="relative z-10 flex flex-col justify-center items-center px-12 xl:px-20 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-blue-500/40 mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-bold text-white mb-3">Huanvae</h1>
            <p className="text-xl text-blue-200">开启全新通讯体验</p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-3 max-w-md">
            {[
              { icon: Zap, text: '即时通讯', delay: 0.2 },
              { icon: Globe, text: '全球连接', delay: 0.3 },
              { icon: Heart, text: '社区互动', delay: 0.4 },
            ].map(({ icon: Icon, text, delay }) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay, duration: 0.4 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20"
              >
                <Icon className="w-4 h-4 text-blue-300" />
                <span className="text-sm text-white/90">{text}</span>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-16 grid grid-cols-3 gap-8 text-center"
          >
            <div>
              <div className="text-4xl font-bold text-white mb-1">10K+</div>
              <div className="text-blue-300 text-sm">活跃用户</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-1">99.9%</div>
              <div className="text-blue-300 text-sm">在线率</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-white mb-1">24/7</div>
              <div className="text-blue-300 text-sm">全天候服务</div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
