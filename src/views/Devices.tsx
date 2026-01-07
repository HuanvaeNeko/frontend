'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Laptop, Smartphone, Monitor, Clock, MapPin, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { authApi } from '../api/auth'
import { useToast } from '../hooks/use-toast'
import { useAuthStore } from '../store/authStore'
import { BackgroundOrbs } from '@/components/ui/glass'

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
        toast({
          title: '已退出登录',
          description: '当前设备已被移除，请重新登录',
        })
        clearAuth()
        router.push('/login')
      } else {
        toast({
          title: '成功',
          description: '设备已移除',
        })
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
    <div className="min-h-screen relative overflow-x-hidden bg-gradient-to-br from-blue-100 via-slate-50 to-purple-100">
      <BackgroundOrbs count={3} />
      
      <div className="relative z-10 max-w-[1000px] mx-auto px-6 py-8">
        <motion.div 
          className="mb-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <motion.button 
            onClick={() => router.push('/chat')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-lg border border-blue-200/30 rounded-xl text-slate-600 transition-all hover:bg-white/90 hover:-translate-x-1"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={18} />
            返回首页
          </motion.button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-blue-500 to-blue-400 flex items-center justify-center text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)]">
              <Laptop size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-700">设备管理</h1>
              <p className="text-sm text-slate-500 mt-1">管理您的登录设备</p>
            </div>
          </div>
          <motion.button 
            onClick={loadDevices}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/60 backdrop-blur-lg border border-blue-200/30 rounded-xl text-slate-600 transition-all hover:bg-white/90 hover:border-blue-500 hover:text-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </motion.button>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : devices.length === 0 ? (
          <Card className="bg-white/70 backdrop-blur-lg border-blue-200/30">
            <CardContent className="py-10 text-center text-slate-500">
              <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
              <p>暂无设备信息</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            {devices.map((device, index) => {
              const DeviceIcon = getDeviceIcon(device.device_info)
              
              return (
                <motion.div 
                  key={device.device_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="bg-white/70 backdrop-blur-lg border-blue-200/30">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="w-16 h-16 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <DeviceIcon size={32} className="text-blue-500" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
                              {getDeviceName(device.device_info)}
                              {device.is_current && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                  当前设备
                                </span>
                              )}
                            </h3>
                            <div className="space-y-1 text-sm text-slate-500 mt-1">
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
                            <AlertDialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
                            <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 w-full max-w-md shadow-xl z-50">
                              <AlertDialog.Title className="text-lg font-semibold mb-2 text-slate-700">
                                {device.is_current ? '确认退出登录？' : '确认移除此设备？'}
                              </AlertDialog.Title>
                              <AlertDialog.Description className="text-sm text-slate-500 mb-4">
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

        <Card className="mt-6 bg-white/70 backdrop-blur-lg border-blue-200/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium text-slate-700">安全提示</p>
                <p className="text-sm text-slate-500 mt-1">
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
