'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail, Smile, Sparkles, User, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'
import { DEFAULT_AUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'

function PasswordStrengthIndicator({ password }: { password: string }) {
  const strength = {
    length: password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  }
  const score = Object.values(strength).filter(Boolean).length
  if (!password) return null

  return (
    <div className="space-y-2 rounded-lg border bg-muted/50 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">密码强度</span>
        <span className={score === 3 ? 'text-primary' : score === 2 ? 'text-muted-foreground' : 'text-destructive'}>
          {score === 3 ? '强' : score === 2 ? '中' : '弱'}
        </span>
      </div>
      <Progress value={(score / 3) * 100} className="h-1.5" />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${strength.length ? 'text-primary' : ''}`}>{strength.length ? <Check size={12} /> : <X size={12} />}8+ 字符</span>
        <span className={`inline-flex items-center gap-1 ${strength.hasLetter ? 'text-primary' : ''}`}>{strength.hasLetter ? <Check size={12} /> : <X size={12} />}包含字母</span>
        <span className={`inline-flex items-center gap-1 ${strength.hasNumber ? 'text-primary' : ''}`}>{strength.hasNumber ? <Check size={12} /> : <X size={12} />}包含数字</span>
      </div>
    </div>
  )
}

export default function Register() {
  const router = useRouter()
  const register = useAuthStore((state) => state.register)

  const [formData, setFormData] = useState({ user_id: '', nickname: '', email: '', password: '', confirmPassword: '' })
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
      await register({ user_id: formData.user_id, nickname: formData.nickname, email: formData.email, password: formData.password })
      playSuccess()
      router.push(DEFAULT_AUTHENTICATED_ROUTE)
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试')
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="relative app-min-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_0%_0%,hsl(var(--primary)/0.16),transparent_35%),radial-gradient(circle_at_100%_0%,hsl(162_70%_42%/0.12),transparent_30%)]" />
      <div className="relative z-10 mx-auto grid app-min-screen w-full max-w-6xl gap-6 p-4 md:grid-cols-2 md:p-8">
        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md border-border/80 bg-card ">
            <CardHeader>
              <CardTitle className="text-2xl">创建账户</CardTitle>
              <CardDescription>注册后即可使用全部功能</CardDescription>
            </CardHeader>
            <CardContent>
              {error && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>用户 ID</Label>
                  <div className="relative"><User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input required minLength={3} value={formData.user_id} onChange={(e) => setFormData({ ...formData, user_id: e.target.value })} className="pl-9" placeholder="至少 3 个字符" /></div>
                </div>
                <div className="space-y-2">
                  <Label>昵称</Label>
                  <div className="relative"><Smile className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input required value={formData.nickname} onChange={(e) => setFormData({ ...formData, nickname: e.target.value })} className="pl-9" placeholder="显示名称" /></div>
                </div>
                <div className="space-y-2">
                  <Label>邮箱</Label>
                  <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="pl-9" placeholder="your@email.com" /></div>
                </div>
                <div className="space-y-2">
                  <Label>密码</Label>
                  <div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input required minLength={8} type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="pl-9 pr-9" placeholder="至少 8 位，包含字母和数字" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                  <PasswordStrengthIndicator password={formData.password} />
                </div>
                <div className="space-y-2">
                  <Label>确认密码</Label>
                  <div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input required type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="pl-9 pr-9" placeholder="再次输入密码" /><button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                  {formData.confirmPassword && <div className={`text-xs ${passwordMatch ? 'text-primary' : 'text-destructive'}`}>{passwordMatch ? '密码匹配' : '密码不匹配'}</div>}
                </div>

                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={agreeTerms} onCheckedChange={(v) => { setAgreeTerms(Boolean(v)); playTap() }} />
                  <span>我已阅读并同意服务条款和隐私政策</span>
                </label>

                <Button type="submit" disabled={loading} className="w-full gap-1.5">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>创建账户<ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3"><Separator className="flex-1" /><span className="text-xs text-muted-foreground">或</span><Separator className="flex-1" /></div>
              <Link href={ROUTES.auth.login}><Button variant="outline" className="w-full">已有账户，去登录</Button></Link>
            </CardContent>
          </Card>
        </div>

        <div className="hidden rounded-2xl border bg-card p-8  md:flex md:flex-col md:justify-between">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-primary"><Sparkles className="h-6 w-6" /></div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight">加入 Huanvae Chat</h1>
            <p className="text-sm text-muted-foreground">新界面、新工作流。注册后即可使用即时聊天、AI 助手和多端协作能力。</p>
          </div>
          <div className="text-xs text-muted-foreground">快速注册 · 安全认证 · 实时同步</div>
        </div>
      </div>
    </div>
  )
}
