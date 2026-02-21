'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff, Globe, Loader2, Lock, Sparkles, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'
import { DEFAULT_AUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'
import { getApiBaseUrl, normalizeApiBaseUrl, setApiBaseUrl } from '@/lib/apiConfig'

const REMEMBER_USER_KEY = 'huanvae-remember-user_id'
const DEFAULT_PROTOCOL: 'https://' | 'http://' = 'https://'

function parseServer(baseUrl: string): { protocol: 'https://' | 'http://'; host: string } {
  try {
    const normalized = normalizeApiBaseUrl(baseUrl)
    const parsed = new URL(normalized)
    return {
      protocol: parsed.protocol === 'http:' ? 'http://' : 'https://',
      host: parsed.host,
    }
  } catch {
    return { protocol: DEFAULT_PROTOCOL, host: 'api.huanvae.cn' }
  }
}

export default function Login() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useI18n()
  const login = useAuthStore((state) => state.login)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const [formData, setFormData] = useState({ user_id: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [mounted, setMounted] = useState(false)
  const initialServer = parseServer(getApiBaseUrl())
  const [serverProtocol, setServerProtocol] = useState<'https://' | 'http://'>(initialServer.protocol || DEFAULT_PROTOCOL)
  const [serverHost, setServerHost] = useState(initialServer.host)
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

  useEffect(() => {
    if (!mounted) return

    const hasHydrated = useAuthStore.persist.hasHydrated()
    if (!hasHydrated) return
    if (!isAuthenticated) return

    const target = nextPath && nextPath.startsWith('/') ? nextPath : DEFAULT_AUTHENTICATED_ROUTE
    router.replace(target)
  }, [isAuthenticated, mounted, nextPath, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    playButton()

    try {
      setApiBaseUrl(`${serverProtocol}${serverHost.trim()}`)
      await login(formData)
      if (rememberMe) localStorage.setItem(REMEMBER_USER_KEY, formData.user_id.trim())
      else localStorage.removeItem(REMEMBER_USER_KEY)
      playSuccess()
      const target = nextPath && nextPath.startsWith('/') ? nextPath : DEFAULT_AUTHENTICATED_ROUTE
      router.push(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.login.errorDefault'))
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="relative min-h-[100dvh] w-full overflow-y-auto bg-background/80">
      <div className="fixed inset-0 pointer-events-none [background:radial-gradient(circle_at_0%_0%,hsl(var(--primary)/0.16),transparent_35%),radial-gradient(circle_at_100%_0%,hsl(162_70%_42%/0.12),transparent_30%)]" />
      
      <div className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center p-4 md:p-8">
        <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-2">
          <div className="hidden rounded-2xl border bg-card/50 p-8 backdrop-blur md:flex md:flex-col md:justify-between">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight">Huanvae Chat</h1>
              <p className="text-sm text-muted-foreground">{t('common.appIntro')}</p>
            </div>
            <div className="text-xs text-muted-foreground">{t('common.appSecurity')}</div>
          </div>

          <div className="flex w-full items-center justify-center">
            <Card className="w-full max-w-md border-border/80 bg-card/95 backdrop-blur shadow-xl">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold">{t('auth.login.title')}</CardTitle>
                <CardDescription>{t('auth.login.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                {error && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="server_host">服务器</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-24 shrink-0 justify-center text-xs"
                        onClick={() => setServerProtocol((prev) => (prev === 'https://' ? 'http://' : 'https://'))}
                      >
                        {serverProtocol}
                      </Button>
                      <div className="relative flex-1">
                        <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="server_host"
                          required
                          value={serverHost}
                          onChange={(e) => setServerHost(e.target.value)}
                          className="pl-9"
                          placeholder="api.huanvae.cn"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="user_id">{t('auth.login.userId')}</Label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="user_id" required value={formData.user_id} onChange={(e) => setFormData({ ...formData, user_id: e.target.value })} className="pl-9" placeholder={t('auth.login.userIdPlaceholder')} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">{t('auth.login.password')}</Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="password" type={showPassword ? 'text' : 'password'} required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="pl-9 pr-9" placeholder={t('auth.login.passwordPlaceholder')} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox checked={rememberMe} onCheckedChange={(v) => { setRememberMe(Boolean(v)); playTap() }} />{t('auth.login.rememberMe')}
                    </label>
                    <button type="button" className="text-sm text-primary">{t('auth.login.forgotPassword')}</button>
                  </div>

                  <Button 
                    type="submit" 
                    disabled={loading} 
                    className="w-full gap-2 font-medium shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('auth.login.submit')}<ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </form>

                <div className="my-5 flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">{t('common.or')}</span>
                  <Separator className="flex-1" />
                </div>

                <Link href={ROUTES.auth.register}>
                  <Button variant="outline" className="w-full">{t('auth.login.createAccount')}</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
