'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/lib/navigation'
import { AppLink as Link } from '@/components/common/AppLink'
import { ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail, Smile, Sparkles, User, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'

import { FormErrorSlot } from '@/features/auth/components/FormErrorSlot'
import { useRedirectIfAuthenticated } from '@/features/auth/hooks/useRedirectIfAuthenticated'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { playButton, playTap, playSuccess, playError, warmupSound } from '@/hooks/useSound'
import { PASSWORD_LIMITS } from '@/lib/passwordRules'
import { DEFAULT_AUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'

/**
 * 强度只是参考：后端只限长度（{@link PASSWORD_LIMITS} 6–100），不要求字符种类，所以清单里只列长度这一条
 * 硬性要求。原来把「8+ 字符 / 包含字母 / 包含数字」都列成打叉的必须项，和后端、APP 都对不上。
 */
function PasswordStrengthIndicator({ password }: { password: string }) {
  const { t } = useI18n()
  if (!password) return null
  const { newMin: min, newMax: max } = PASSWORD_LIMITS
  const lengthOk = password.length >= min && password.length <= max
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  const score = !lengthOk ? 1 : password.length >= 12 || (password.length >= 8 && variety >= 3) ? 3 : password.length >= 8 || variety >= 2 ? 2 : 1

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
        <span className={`inline-flex items-center gap-1 ${lengthOk ? 'text-primary' : ''}`}>{lengthOk ? <Check size={12} /> : <X size={12} />}{t('common.passwordRuleLength', { min, max })}</span>
      </div>
    </div>
  )
}

export default function Register() {
  const router = useRouter()
  const { t } = useI18n()
  const register = useAuthStore((state) => state.register)
  const login = useAuthStore((state) => state.login)
  const { toast } = useToast()
  useRedirectIfAuthenticated()

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Form Schema
  const registerSchema = z.object({
    // 报错要说哪里错了——原来直接复用占位符 key，昵称为空报「显示名称」、邮箱为空报「your@email.com」
    user_id: z.string().trim().min(3, t('auth.register.errUserId')),
    nickname: z.string().trim().min(1, t('auth.register.errNickname')),
    email: z.string().email(t('auth.register.errEmail')),
    // 跟随后端：6–100 个字符、不限字符种类（见 PASSWORD_LIMITS）
    password: z.string()
      .min(PASSWORD_LIMITS.newMin, t('auth.register.errPasswordLength', { min: PASSWORD_LIMITS.newMin, max: PASSWORD_LIMITS.newMax }))
      .max(PASSWORD_LIMITS.newMax, t('auth.register.errPasswordLength', { min: PASSWORD_LIMITS.newMin, max: PASSWORD_LIMITS.newMax })),
    confirmPassword: z.string(),
    agreeTerms: z.boolean().refine(val => val === true, {
      message: t('auth.register.errAgreeTerms'),
    }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('common.passwordNotMatch'),
    path: ["confirmPassword"],
  })

  type RegisterFormValues = z.infer<typeof registerSchema>

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
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
      await register({
        user_id: values.user_id,
        nickname: values.nickname,
        email: values.email,
        password: values.password
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.register.failed'))
      playError()
      setLoading(false)
      return
    }

    playSuccess()
    // 注册接口不建会话。原来直接 push 到 /app/chat，被守卫弹回一个空白登录页，看不出注册成没成；
    // 与 APP 一样（App.tsx handleRegister）用刚填的账号密码直接登录。
    try {
      await login({ user_id: values.user_id, password: values.password })
      router.push(DEFAULT_AUTHENTICATED_ROUTE)
    } catch {
      toast({ title: t('auth.register.successPleaseLogin') })
      router.push(ROUTES.auth.login)
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="relative app-min-screen overflow-hidden bg-background/80">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_0%_0%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_35%),radial-gradient(circle_at_100%_0%,color-mix(in_srgb,var(--status-success)_12%,transparent),transparent_30%)]" />
      <div className="relative z-10 mx-auto grid app-min-screen w-full max-w-6xl gap-6 p-4 md:grid-cols-2 md:p-8">
        <div className="flex items-center justify-center">
          <Card className="w-full max-w-md border-border/80 bg-card ">
            <CardHeader>
              <CardTitle className="text-2xl">{t('auth.register.title')}</CardTitle>
              <CardDescription>{t('auth.register.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                            <Input {...field} type={showPassword ? 'text' : 'password'} className="pl-9 pr-9" placeholder={t('auth.register.passwordPlaceholder', { min: PASSWORD_LIMITS.newMin })} />
                          </FormControl>
                          <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
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
                          <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? t('auth.login.hidePassword') : t('auth.login.showPassword')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
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

                  <div className="space-y-2">
                    <FormErrorSlot message={error} />
                    <Button type="submit" disabled={loading} className="w-full gap-1.5">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{t('auth.register.submit')}<ArrowRight className="h-4 w-4" /></>}
                    </Button>
                  </div>
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
