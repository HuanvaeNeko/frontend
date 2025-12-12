import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Laptop, Smartphone, Monitor, Clock, MapPin, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { authApi } from '../api/auth'
import { useToast } from '../hooks/use-toast'
import { useAuthStore } from '../store/authStore'
import { 
  fadeInVariants, 
  staggerContainer,
  staggerItem,
} from '../utils/motionAnimations'

interface Device {
  device_id: string
  device_info: string
  ip_address: string
  last_active_at: string
  created_at: string
  is_current: boolean
}

export default function Devices() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { clearAuth } = useAuthStore()
  
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)

  // 加载设备列表
  const loadDevices = async () => {
    setLoading(true)
    try {
      const response = await authApi.getDevices()
      const deviceList = response.devices || response.data?.devices || []
      setDevices(Array.isArray(deviceList) ? deviceList : [])
    } catch (error) {
      console.error('加载设备列表失败:', error)
      toast({
        title: '加载失败',
        description: error instanceof Error ? error.message : '无法获取设备列表',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 移除设备
  const handleRevoke = async (deviceId: string, isCurrent: boolean) => {
    setRevoking(deviceId)
    try {
      await authApi.revokeDevice(deviceId)
      
      if (isCurrent) {
        // 如果删除的是当前设备，清除认证并跳转到登录页
        toast({
          title: '已退出登录',
          description: '当前设备已被移除，请重新登录',
        })
        clearAuth()
        navigate('/login')
      } else {
        toast({
          title: '成功',
          description: '设备已移除',
        })
        // 重新加载设备列表
        await loadDevices()
      }
    } catch (error) {
      toast({
        title: '移除失败',
        description: error instanceof Error ? error.message : '无法移除设备',
        variant: 'destructive',
      })
    } finally {
      setRevoking(null)
    }
  }

  // 根据设备信息判断设备类型图标
  const getDeviceIcon = (deviceInfo: string) => {
    const info = deviceInfo.toLowerCase()
    if (info.includes('mobile') || info.includes('android') || info.includes('iphone') || info.includes('ipad')) {
      return Smartphone
    }
    if (info.includes('mac') || info.includes('windows') || info.includes('linux')) {
      return Laptop
    }
    return Monitor
  }

  // 解析设备信息获取可读名称
  const getDeviceName = (deviceInfo: string) => {
    // 尝试从 User-Agent 中提取浏览器和系统信息
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
    
    // 如果无法识别，返回截断的设备信息
    return deviceInfo.length > 30 ? deviceInfo.substring(0, 30) + '...' : deviceInfo
  }

  // 格式化时间
  const formatTime = (timeString: string) => {
    const date = new Date(timeString)
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
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft size={18} />返回首页
          </Button>
        </div>

        <motion.div
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <Laptop size={32} className="text-blue-500" />
            <div>
              <h1 className="text-4xl font-bold">设备管理</h1>
              <p className="text-muted-foreground">管理您的登录设备</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={loadDevices}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : devices.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
              <p>暂无设备信息</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {devices.map((device) => {
              const DeviceIcon = getDeviceIcon(device.device_info)
              
              return (
                <motion.div key={device.device_id} variants={staggerItem}>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <DeviceIcon size={32} className="text-blue-500" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                              {getDeviceName(device.device_info)}
                              {device.is_current && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                  当前设备
                                </span>
                              )}
                            </h3>
                            <div className="space-y-1 text-sm text-muted-foreground mt-1">
                              <div className="flex items-center gap-2">
                                <MapPin size={14} />
                                IP: {device.ip_address || '未知'}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock size={14} />
                                最后活动: {formatTime(device.last_active_at)}
                              </div>
                              <p className="text-xs">
                                登录时间: {new Date(device.created_at).toLocaleString('zh-CN')}
                              </p>
                            </div>
                          </div>
                        </div>

                        <AlertDialog.Root>
                          <AlertDialog.Trigger asChild>
                            <Button 
                              variant={device.is_current ? 'outline' : 'destructive'}
                              disabled={revoking === device.device_id}
                            >
                              {revoking === device.device_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : device.is_current ? (
                                '退出登录'
                              ) : (
                                '移除'
                              )}
                            </Button>
                          </AlertDialog.Trigger>
                          <AlertDialog.Portal>
                            <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
                            <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 w-full max-w-md shadow-xl z-50">
                              <AlertDialog.Title className="text-lg font-semibold mb-2">
                                {device.is_current ? '确认退出登录？' : '确认移除此设备？'}
                              </AlertDialog.Title>
                              <AlertDialog.Description className="text-sm text-muted-foreground mb-4">
                                {device.is_current 
                                  ? '退出后需要重新登录才能继续使用'
                                  : '移除后该设备将无法继续访问，需要重新登录'}
                              </AlertDialog.Description>
                              <div className="flex gap-3 justify-end">
                                <AlertDialog.Cancel asChild>
                                  <Button variant="outline">取消</Button>
                                </AlertDialog.Cancel>
                                <AlertDialog.Action asChild>
                                  <Button 
                                    variant="destructive" 
                                    onClick={() => handleRevoke(device.device_id, device.is_current)}
                                  >
                                    确认
                                  </Button>
                                </AlertDialog.Action>
                              </div>
                            </AlertDialog.Content>
                          </AlertDialog.Portal>
                        </AlertDialog.Root>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium">安全提示</p>
                <p className="text-sm text-muted-foreground mt-1">
                  定期检查您的登录设备，如发现异常设备请立即移除并修改密码。
                  建议在公共设备上使用后及时退出登录。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
