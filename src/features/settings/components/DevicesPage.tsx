'use client'

import { useState, useEffect } from 'react'
import { useRouter } from '@/lib/navigation'
import { AlertTriangle, ArrowLeft, Clock, Laptop, Loader2, MapPin, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { authApi } from '@/features/auth/api/auth'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useI18n } from '@/i18n/I18nProvider'
import { DEFAULT_UNAUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'

interface Device {
  device_id: string
  device_info: string
  ip_address: string
  last_active_at: string
  created_at: string
  is_current: boolean
}

export default function Devices({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter()
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const { logout } = useAuthStore()

  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadDevices = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await authApi.getDevices()
      // 没有 `|| []`：getDevices 现在要么抛错、要么返回真数组（解包层已 require
      // devices/total）。留着兜底唯一的作用是在下一次响应形状漂移时再把空值咽下去，
      // 变回"设备页永远显示暂无设备、撤销按钮永远不渲染"的静默故障。
      // 出错就走下面 catch 的「加载失败」toast，故障可见。
      //
      // is_current 不能用 `?? false` 兜底：`require: ['devices','total']` 不保护
      // 数组元素内部的字段，一旦某条设备记录漏了 is_current，`?? false` 会让它
      // 悄悄读成"不是当前设备"——「当前设备」徽章消失，用户可能因此在不知情的
      // 情况下把自己正在用的会话当成别人的设备撤销掉。这和 presence 那批 bug
      // 是同一类："把失败伪装成数据"，只是这里伪装出来的"数据"直接影响安全操作。
      // 这里选择让整页加载失败（下面的 catch 已经有「加载失败」toast），
      // 而不是画一个和"不是当前设备"混在一起、容易被忽略的"未知"状态——
      // 视觉上能和"不是当前设备"分清楚的"未知"状态，成本并不比让整页报错更低，
      // 而报错至少保证用户不会在这条信息缺失的情况下继续做撤销操作。
      const normalized: Device[] = response.devices.map((d) => {
        if (typeof d.is_current !== 'boolean') {
          throw new Error(t('devices.errors.missingIsCurrent', { id: d.device_id || t('devices.errors.noId') }))
        }
        return {
          device_id: d.device_id,
          device_info: d.device_info ?? '',
          ip_address: d.ip_address ?? '',
          last_active_at: d.last_active_at ?? '',
          created_at: d.created_at ?? '',
          is_current: d.is_current,
        }
      })
      setDevices(normalized)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('devices.toast.loadFailedFallback')
      // 列表区原地显示错误 + 重试：原来只弹 toast，列表落到「暂无设备信息」，看起来像没有登录设备
      setLoadError(message)
      toast({ title: t('devices.toast.loadFailed'), description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRevoke = async (deviceId: string, isCurrent: boolean) => {
    setRevoking(deviceId)
    try {
      await authApi.revokeDevice(deviceId)
      if (isCurrent) {
        toast({ title: t('devices.toast.loggedOutTitle'), description: t('devices.toast.loggedOutDesc') })
        // 撤销当前设备 = 登出。必须走 authStore.logout()（它打 BFF 的
        // /api/auth/logout，由 BFF 删会话、清 cookie、关该会话的 WS），
        // 而不是只清本地 state —— 只清本地的话 cookie 还在，刷新页面就又登回去了。
        await logout()
        router.push(DEFAULT_UNAUTHENTICATED_ROUTE)
      } else {
        toast({ title: t('devices.toast.success'), description: t('devices.toast.removed') })
        await loadDevices()
      }
    } catch (error) {
      toast({
        title: t('devices.toast.removeFailed'),
        description: error instanceof Error ? error.message : t('devices.toast.removeFailedFallback'),
        variant: 'destructive',
      })
    } finally {
      setRevoking(null)
    }
  }

  const getDeviceIcon = (deviceInfo: string) => {
    const info = deviceInfo.toLowerCase()
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone') || info.includes('ipad')) return Smartphone
    if (info.includes('mac') || info.includes('windows') || info.includes('linux')) return Laptop
    return Monitor
  }

  const getDeviceName = (deviceInfo: string) => {
    if (deviceInfo.includes('Chrome')) {
      if (deviceInfo.includes('Windows')) return 'Windows Chrome'
      if (deviceInfo.includes('Mac')) return 'Mac Chrome'
      if (deviceInfo.includes('Linux')) return 'Linux Chrome'
      if (deviceInfo.includes('Android')) return 'Android Chrome'
      return t('devices.browser', { name: 'Chrome' })
    }
    if (deviceInfo.includes('Firefox')) return t('devices.browser', { name: 'Firefox' })
    if (deviceInfo.includes('Safari') && !deviceInfo.includes('Chrome')) return t('devices.browser', { name: 'Safari' })
    if (deviceInfo.includes('Edge')) return t('devices.browser', { name: 'Edge' })
    return deviceInfo.length > 30 ? deviceInfo.substring(0, 30) + '...' : deviceInfo
  }

  const formatTime = (timeString: string | null | undefined) => {
    if (!timeString) return t('devices.unknown')
    const date = new Date(timeString)
    if (isNaN(date.getTime())) return t('devices.unknown')

    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return t('devices.time.justNow')
    if (minutes < 60) return t('devices.time.minutesAgo', { n: minutes })
    if (hours < 24) return t('devices.time.hoursAgo', { n: hours })
    if (days < 7) return t('devices.time.daysAgo', { n: days })
    return date.toLocaleDateString(locale)
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className={embedded ? '' : 'mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-8 md:p-6'}>
        <div className="flex items-center justify-between">
          {!embedded && (
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => router.push(ROUTES.app.chat)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{t('nav.devices')}</h1>
                <p className="text-sm text-muted-foreground">{t('devices.subtitle')}</p>
              </div>
            </div>
          )}
          <Button variant="outline" onClick={loadDevices} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('devices.refresh')}
          </Button>
        </div>

        {loading ? (
          <div className="flex h-52 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />{t('devices.loading')}</div>
        ) : loadError ? (
          <Card>
            <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-medium text-destructive">{t('devices.loadFailed')}</p>
              <p className="max-w-sm text-xs text-muted-foreground">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadDevices}>{t('devices.retry')}</Button>
            </CardContent>
          </Card>
        ) : devices.length === 0 ? (
          <Card>
            <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <AlertTriangle className="h-8 w-8" />
              {t('devices.empty')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device.device_info)
              return (
                <Card key={device.device_id}>
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border bg-muted">
                          <DeviceIcon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate font-medium">{getDeviceName(device.device_info)}</div>
                            {device.is_current && <Badge>{t('devices.current')}</Badge>}
                          </div>
                          {/* 两段原来是相邻的 inline-flex，中间没有间距：「127.0.0.1」和时钟图标贴在一起 */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />IP: {device.ip_address || t('devices.unknown')}</span>
                            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{t('devices.lastActive', { time: formatTime(device.last_active_at) })}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{t('devices.loginTime', { time: new Date(device.created_at).toLocaleString(locale) })}</div>
                        </div>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant={device.is_current ? 'outline' : 'destructive'} disabled={revoking === device.device_id}>
                            {revoking === device.device_id ? <Loader2 className="h-4 w-4 animate-spin" /> : device.is_current ? t('shell.settings.logout') : t('devices.remove')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{device.is_current ? t('devices.confirmLogoutTitle') : t('devices.confirmRemoveTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{device.is_current ? t('devices.confirmLogoutDesc') : t('devices.confirmRemoveDesc')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('devices.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRevoke(device.device_id, device.is_current)}>{t('devices.confirm')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('devices.securityTitle')}</CardTitle>
            <CardDescription>{t('devices.securityDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t('devices.securityBody')}</CardContent>
        </Card>
      </div>
    </div>
  )
}