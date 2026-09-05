'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/lib/navigation'
import { AppLink as Link } from '@/components/common/AppLink'
import { ArrowRight, Check, Eye, EyeOff, Globe, Loader2, Lock, Mail, Smile, Sparkles, User, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { useAuthStore } from '@/features/auth/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'
import { DEFAULT_AUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'
import { getApiBaseUrl, normalizeApiBaseUrl, setApiBaseUrl } from '@/lib/apiConfig'

function parseServer(baseUrl: string): { protocol: 'https://' | 'http://'; host: string } {
  try {
    const normalized = normalizeApiBaseUrl(baseUrl)
    const parsed = new URL(normalized)
    return {
      protocol: parsed.protocol === 'http:' ? 'http://' : 'https://',
      host: parsed.host,
    }
  } catch {
    return {
      protocol: 'https://',
      host: 'api.huanvae.cn',
    }
  }
}

function PasswordStrengthIndicator({ password }: { password: string }) {
  const { t } = useI18n()
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
        <span className="text-muted-foreground">{t('common.passwordStrength')}</span>
        <span className={score === 3 ? 'text-primary' : score === 2 ? 'text-muted-foreground' : 'text-destructive'}>
          {score === 3 ? t('common.passwordStrong') : score === 2 ? t('common.passwordMedium') : t('common.passwordWeak')}
        </span>
      </div>
      <Progress value={(score / 3) * 100} className="h-1.5" />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${strength.length ? 'text-primary' : ''}`}>{strength.length ? <Check size={12} /> : <X size={12} />}{t('common.passwordRuleLength')}</span>
        <span className={`inline-flex items-center gap-1 ${strength.hasLetter ? 'text-primary' : ''}`}>{strength.hasLetter ? <Check size={12} /> : <X size={12} />}{t('common.passwordRuleLetter')}</span>
        <span className={`inline-flex items-center gap-1 ${strength.hasNumber ? 'text-primary' : ''}`}>{strength.hasNumber ? <Check size={12} /> : <X size={12} />}{t('common.passwordRuleNumber')}</span>
      </div>
    </div>
  )
}

export default function Register() {
  const router = useRouter()
  const { t } = useI18n()
  const register = useAuthStore((state) => state.register)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  const initialServer = parseServer(getApiBaseUrl())
  const [serverProtocol, setServerProtocol] = useState<'https://' | 'http://'>(initialServer.protocol)

  // Form Schema
  const registerSchema = z.object({
    serverHost: z.string().min(1, t('common.required')),
    user_id: z.string().min(3, t('auth.register.userIdPlaceholder')),
    nickname: z.string().min(1, t('auth.register.nicknamePlaceholder')),
    email: z.string().email(t('auth.register.emailPlaceholder')),
    password: z.string()
      .min(8, t('auth.register.passwordPlaceholder'))
      .regex(/[a-zA-Z]/, t('common.passwordRuleLetter'))
      .regex(/[0-9]/, t('common.passwordRuleNumber')),
    confirmPassword: z.string(),
    agreeTerms: z.boolean().refine(val => val === true, {
      message: t('auth.register.agreeTerms'),
    }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('common.passwordNotMatch'),
    path: ["confirmPassword"],
  })

  type RegisterFormValues = z.infer<typeof registerSchema>

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      serverHost: initialServer.host,
      user_id: '',
      nickname: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeTerms: false,
    },
  })

  useEffect(() => {
    setMounted(true)
    warmupSound()
  }, [])

  const onSubmit = async (values: RegisterFormValues) => {
    setError('')
    setLoading(true)
    playButton()

    try {
      setApiBaseUrl(`${serverProtocol}${values.serverHost.trim()}`)
      await register({
        user_id: values.user_id,
        nickname: values.nickname,
        email: values.email,
        password: values.password
      })
      playSuccess()
      router.push(DEFAULT_AUTHENTICATED_ROUTE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Register failed, please try again later')
      playError()
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="relative app-min-screen overflow-hidden bg-background/80">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_0%_0%,hsl(var(--primary)/0.16),transparent_35%),radial-gradient(circle_at_100%_0%,hsl(162_70%_42%/0.12),transparent_30%)]" />
      <div className="relative z-10 mx-auto grid app-min-screen w-full max-w-6xl gap-6 p-4 md:grid-cols-2 md:p-8">
        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md border-border/80 bg-card ">
            <CardHeader>
              <CardTitle className="text-2xl">{t('auth.register.title')}</CardTitle>
              <CardDescription>{t('auth.register.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {error && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="serverHost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>服务器</FormLabel>
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
                            <FormControl>
                              <Input {...field} className="pl-9" placeholder="api.huanvae.cn" />
                            </FormControl>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="user_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.register.userId')}</FormLabel>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input {...field} className="pl-9" placeholder={t('auth.register.userIdPlaceholder')} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nickname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.register.nickname')}</FormLabel>
                        <div className="relative">
                          <Smile className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input {...field} className="pl-9" placeholder={t('auth.register.nicknamePlaceholder')} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.register.email')}</FormLabel>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input {...field} type="email" className="pl-9" placeholder={t('auth.register.emailPlaceholder')} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.register.password')}</FormLabel>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input {...field} type={showPassword ? 'text' : 'password'} className="pl-9 pr-9" placeholder={t('auth.register.passwordPlaceholder')} />
                          </FormControl>
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <PasswordStrengthIndicator password={field.value} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('auth.register.confirmPassword')}</FormLabel>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <FormControl>
                            <Input {...field} type={showConfirmPassword ? 'text' : 'password'} className="pl-9 pr-9" placeholder={t('auth.register.confirmPasswordPlaceholder')} />
                          </FormControl>
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="agreeTerms"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked)
                              playTap()
                            }}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal text-muted-foreground">
                            {t('auth.register.agreeTerms')}
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={loading} className="w-full gap-1.5">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('auth.register.submit')}<ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </form>
              </Form>

              <div className="my-5 flex items-center gap-3"><Separator className="flex-1" /><span className="text-xs text-muted-foreground">{t('common.or')}</span><Separator className="flex-1" /></div>
              <Link href={ROUTES.auth.login}><Button variant="outline" className="w-full">{t('auth.register.toLogin')}</Button></Link>
            </CardContent>
          </Card>
        </div>

        <div className="hidden rounded-2xl border bg-card p-8  md:flex md:flex-col md:justify-between">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-primary"><Sparkles className="h-6 w-6" /></div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight">{t('common.joinTitle')}</h1>
            <p className="text-sm text-muted-foreground">{t('common.joinSubtitle')}</p>
          </div>
          <div className="text-xs text-muted-foreground">{t('common.joinFooter')}</div>
        </div>
      </div>
    </div>
  )
}
