'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import { 
  ArrowRight, 
  Loader2, 
  User, 
  Lock, 
  Eye, 
  EyeOff,
  MessageCircle,
  Users,
  Video,
  Shield,
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'

const REMEMBER_USER_KEY = 'huanvae-remember-user_id'

const FeatureCard = ({ icon: Icon, title, description, delay }: {
  icon: React.ElementType
  title: string
  description: string
  delay: number
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.5 }}
    className="flex items-start gap-4 p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
  >
    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0">
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-slate-400">{description}</p>
    </div>
  </motion.div>
)

export default function Login() {
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  
  const [formData, setFormData] = useState({
    user_id: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [mounted, setMounted] = useState(false)

  // 恢复“记住我”保存的用户 ID（仅客户端）
  useEffect(() => {
    setMounted(true)
    warmupSound()
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_USER_KEY) : null
      if (saved) {
        setFormData((prev) => ({ ...prev, user_id: saved }))
        setRememberMe(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    playButton()

    try {
      await login(formData)
      if (rememberMe) {
        try {
          localStorage.setItem(REMEMBER_USER_KEY, formData.user_id.trim())
        } catch {
          // ignore
        }
      } else {
        try {
          localStorage.removeItem(REMEMBER_USER_KEY)
        } catch {
          // ignore
        }
      }
      playSuccess()
      router.push('/')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '登录失败，请检查用户名和密码'
      setError(errorMsg)
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen w-full flex">
      {/* 左侧品牌区域 */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-white">Huanvae</h1>
                <p className="text-blue-300">智能通讯平台</p>
              </div>
            </div>
            <p className="text-xl text-slate-300 max-w-md leading-relaxed">
              连接世界，畅享沟通。安全、快速、智能的即时通讯体验。
            </p>
          </motion.div>

          <div className="space-y-4 max-w-md">
            <FeatureCard icon={MessageCircle} title="即时消息" description="支持富文本、Markdown、文件传输" delay={0.2} />
            <FeatureCard icon={Users} title="群聊管理" description="创建群组，邀请好友，团队协作" delay={0.3} />
            <FeatureCard icon={Video} title="视频通话" description="高清视频会议，屏幕共享" delay={0.4} />
            <FeatureCard icon={Shield} title="安全加密" description="端到端加密，保护您的隐私" delay={0.5} />
          </div>
        </div>
      </div>

      {/* 右侧登录表单 */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-4 sm:p-6 md:p-12 bg-background min-h-[100dvh] lg:min-h-0">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px]"
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
              <CardTitle className="text-2xl">欢迎回来 👋</CardTitle>
              <CardDescription>登录您的账户以继续</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {/* 错误提示 */}
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
                      value={formData.user_id}
                      onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                      placeholder="请输入用户 ID"
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
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="请输入密码"
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
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => {
                        setRememberMe(e.target.checked)
                        playTap()
                      }}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-ring focus:ring-offset-0"
                    />
                    <span className="text-sm text-muted-foreground">记住我</span>
                  </label>
                  <a href="#" className="text-sm text-primary hover:underline">
                    忘记密码？
                  </a>
                </div>

                <Button type="submit" disabled={loading} className="w-full" size="lg">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      登录中...
                    </>
                  ) : (
                    <>
                      登录
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
                <p className="text-muted-foreground mb-3 text-sm">还没有账号？</p>
                <Link href="/register">
                  <Button variant="outline" className="w-full" size="lg">
                    创建新账户
                  </Button>
                </Link>
              </div>

              <div className="mt-6 text-center text-xs text-muted-foreground">
                <p>登录即表示您同意我们的</p>
                <p className="mt-1">
                  <a href="#" className="text-primary hover:underline">服务条款</a>
                  {' '}和{' '}
                  <a href="#" className="text-primary hover:underline">隐私政策</a>
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
