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
import { DEFAULT_UNAUTHENTICATED_ROUTE, ROUTES } from '@/lib/routes'

interface Device {
  device_id: string
  device_info: string
  ip_address: string
  last_active_at: string
  created_at: string
  is_current: boolean
}

export default function Devices() {
  const router = useRouter()
  const { toast } = useToast()
  const { clearAuth } = useAuthStore()

  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  const loadDevices = async () => {
    setLoading(true)
    try {
      const response = await authApi.getDevices()
      const normalized: Device[] = (response.devices || []).map((d) => ({
        device_id: d.device_id,
        device_info: d.device_info ?? '',
        ip_address: d.ip_address ?? '',
        last_active_at: d.last_active_at ?? '',
        created_at: d.created_at ?? '',
        is_current: d.is_current ?? false,
      }))
      setDevices(normalized)
    } catch (error) {
      toast({ title: '加载失败', description: error instanceof Error ? error.message : '无法获取设备列表', variant: 'destructive' })
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
        toast({ title: '已退出登录', description: '当前设备已被移除，请重新登录' })
        clearAuth()
        router.push(DEFAULT_UNAUTHENTICATED_ROUTE)
      } else {
        toast({ title: '成功', description: '设备已移除' })
        await loadDevices()
      }
    } catch (error) {
      toast({ title: '移除失败', description: error instanceof Error ? error.message : '无法移除设备', variant: 'destructive' })
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
      return 'Chrome 浏览器'
    }
    if (deviceInfo.includes('Firefox')) return 'Firefox 浏览器'
    if (deviceInfo.includes('Safari') && !deviceInfo.includes('Chrome')) return 'Safari 浏览器'
    if (deviceInfo.includes('Edge')) return 'Edge 浏览器'
    return deviceInfo.length > 30 ? deviceInfo.substring(0, 30) + '...' : deviceInfo
  }

  const formatTime = (timeString: string | null | undefined) => {
    if (!timeString) return '未知'
    const date = new Date(timeString)
    if (isNaN(date.getTime())) return '未知'

    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 7) return `${days} 天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-8 md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => router.push(ROUTES.app.chat)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">设备管理</h1>
              <p className="text-sm text-muted-foreground">查看并移除已登录设备</p>
            </div>
          </div>
          <Button variant="outline" onClick={loadDevices} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
        </div>

        {loading ? (
          <div className="flex h-52 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />加载中...</div>
        ) : devices.length === 0 ? (
          <Card>
            <CardContent className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <AlertTriangle className="h-8 w-8" />
              暂无设备信息
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
                            {device.is_current && <Badge>当前设备</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />IP: {device.ip_address || '未知'}</div>
                          <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />最后活动: {formatTime(device.last_active_at)}</div>
                          <div className="text-xs text-muted-foreground">登录时间: {new Date(device.created_at).toLocaleString('zh-CN')}</div>
                        </div>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant={device.is_current ? 'outline' : 'destructive'} disabled={revoking === device.device_id}>
                            {revoking === device.device_id ? <Loader2 className="h-4 w-4 animate-spin" /> : device.is_current ? '退出登录' : '移除'}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{device.is_current ? '确认退出登录？' : '确认移除此设备？'}</AlertDialogTitle>
                            <AlertDialogDescription>{device.is_current ? '退出后需要重新登录才能继续使用。' : '移除后该设备将无法继续访问。'}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRevoke(device.device_id, device.is_current)}>确认</AlertDialogAction>
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
            <CardTitle className="text-base">安全提示</CardTitle>
            <CardDescription>定期检查设备并移除异常登录</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            建议在公共设备使用后及时退出，发现陌生设备请立即移除并修改密码。
          </CardContent>
        </Card>
      </div>
    </div>
  )
}