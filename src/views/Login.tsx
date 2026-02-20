'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Sparkles, User } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'
import { DEFAULT_AUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'

const REMEMBER_USER_KEY = 'huanvae-remember-user_id'

export default function Login() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const login = useAuthStore((state) => state.login)

  const [formData, setFormData] = useState({ user_id: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [mounted, setMounted] = useState(false)
  const nextPath = searchParams.get('next')

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
      if (rememberMe) localStorage.setItem(REMEMBER_USER_KEY, formData.user_id.trim())
      else localStorage.removeItem(REMEMBER_USER_KEY)
      playSuccess()
      const target = nextPath && nextPath.startsWith('/') ? nextPath : DEFAULT_AUTHENTICATED_ROUTE
      router.push(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查用户名和密码')
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
        <div className="hidden rounded-2xl border bg-card p-8  md:flex md:flex-col md:justify-between">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight">Huanvae Chat</h1>
            <p className="text-sm text-muted-foreground">统一通信工作台。即时消息、AI 助手、会议协作集中在一个应用中。</p>
          </div>
          <div className="text-xs text-muted-foreground">安全登录 · 端到端传输 · 多端同步</div>
        </div>

        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md border-border/80 bg-card ">
            <CardHeader>
              <CardTitle className="text-2xl">登录账户</CardTitle>
              <CardDescription>输入账号继续访问</CardDescription>
            </CardHeader>
            <CardContent>
              {error && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user_id">用户 ID</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="user_id" required value={formData.user_id} onChange={(e) => setFormData({ ...formData, user_id: e.target.value })} className="pl-9" placeholder="请输入用户 ID" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="password" type={showPassword ? 'text' : 'password'} required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="pl-9 pr-9" placeholder="请输入密码" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox checked={rememberMe} onCheckedChange={(v) => { setRememberMe(Boolean(v)); playTap() }} />记住我
                  </label>
                  <button type="button" className="text-sm text-primary">忘记密码？</button>
                </div>

                <Button type="submit" disabled={loading} className="w-full gap-1.5">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>登录<ArrowRight className="h-4 w-4" /></>}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">或</span>
                <Separator className="flex-1" />
              </div>

              <Link href={ROUTES.auth.register}>
                <Button variant="outline" className="w-full">创建新账户</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
