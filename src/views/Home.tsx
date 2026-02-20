'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Bot,
  MessageCircle,
  Video,
  Settings,
  LogOut,
  User,
  Laptop,
  Users,
  IdCard,
  ArrowRight,
  Sparkles,
  Activity,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { DEFAULT_UNAUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'
import { useI18n } from '@/i18n/I18nProvider'

export default function Home() {
  const router = useRouter()
  const { t } = useI18n()
  const { user, logout, isAuthenticated } = useAuthStore()
  const { openProfileModal } = useUIStore()

  const handleLogout = async () => {
    try {
      await logout()
      router.push(DEFAULT_UNAUTHENTICATED_ROUTE)
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (!isAuthenticated) return null

  const features = [
    { icon: MessageCircle, title: t('home.feature.chat.title'), description: t('home.feature.chat.desc'), path: ROUTES.app.chat, badge: t('home.feature.chat.badge') },
    { icon: Bot, title: t('home.feature.ai.title'), description: t('home.feature.ai.desc'), path: ROUTES.app.aiChat, badge: t('home.feature.ai.badge') },
    { icon: Video, title: t('home.feature.video.title'), description: t('home.feature.video.desc'), path: ROUTES.app.videoMeeting, badge: t('home.feature.video.badge') },
    { icon: Users, title: t('home.feature.friends.title'), description: t('home.feature.friends.desc'), path: ROUTES.app.friends, badge: t('home.feature.friends.badge') },
    { icon: Settings, title: t('home.feature.settings.title'), description: t('home.feature.settings.desc'), path: ROUTES.app.settings, badge: t('home.feature.settings.badge') },
  ]

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 pb-8 md:p-6">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-2xl border bg-card"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-primary/20" />
          <div className="grid gap-6 p-5 md:grid-cols-[1fr_auto] md:p-7">
            <div className="space-y-3">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                全新控制台
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {t('home.welcomeBack', { name: user?.nickname || user?.user_id || 'User' })}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                {t('home.subtitle')}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button onClick={() => router.push(ROUTES.app.chat)} className="gap-2">
                  <MessageCircle className="h-4 w-4" />{t('home.openChat')}
                </Button>
                <Button variant="outline" onClick={() => router.push(ROUTES.app.aiChat)} className="gap-2">
                  <Bot className="h-4 w-4" />{t('home.openAi')}
                </Button>
              </div>
            </div>

            <div className="flex items-start justify-end">
              <Card className="w-full min-w-[260px] max-w-[320px]">
                <CardContent className="space-y-4 pt-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user?.avatar_url} />
                      <AvatarFallback>{user?.nickname?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{user?.nickname || '用户'}</div>
                      <div className="truncate text-xs text-muted-foreground">{user?.user_id}</div>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t('home.currentStatus')}</span>
                    <span className="inline-flex items-center gap-1 text-primary"><Activity className="h-3.5 w-3.5" />{t('home.online')}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.04, duration: 0.25 }}
            >
              <Card
                className="group cursor-pointer border-border/80 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                onClick={() => router.push(feature.path)}
              >
                <CardHeader className="pb-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="rounded-xl border bg-muted p-2.5 text-primary">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline">{feature.badge}</Badge>
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors group-hover:text-primary">
                    {t('home.feature.open')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('home.accountAndDevice')}</CardTitle>
            <CardDescription>{t('home.commonActions')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openProfileModal} className="gap-2">
              <IdCard className="h-4 w-4" />个人资料
            </Button>
            <Button variant="outline" onClick={() => router.push(ROUTES.app.devices)} className="gap-2">
              <Laptop className="h-4 w-4" />设备管理
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2"><User className="h-4 w-4" />{t('home.more')}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => router.push(ROUTES.app.friends)}>
                  <Users className="mr-2 h-4 w-4" />{t('home.friendsManage')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
