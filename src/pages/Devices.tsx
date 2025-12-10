import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Laptop, Smartphone, Monitor, Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import * as AlertDialog from '@radix-ui/react-alert-dialog'

export default function Devices() {
  const navigate = useNavigate()

  const devices = [
    {
      id: '1',
      name: 'MacBook Pro',
      type: 'desktop',
      icon: Laptop,
      location: '北京, 中国',
      lastActive: '当前设备',
      ip: '192.168.1.100',
      current: true
    },
    {
      id: '2',
      name: 'iPhone 13',
      type: 'mobile',
      icon: Smartphone,
      location: '上海, 中国',
      lastActive: '2 小时前',
      ip: '192.168.1.101',
      current: false
    },
    {
      id: '3',
      name: 'Windows PC',
      type: 'desktop',
      icon: Monitor,
      location: '深圳, 中国',
      lastActive: '3 天前',
      ip: '192.168.1.102',
      current: false
    }
  ]

  const handleRevoke = async (deviceId: string) => {
    // TODO: 实现设备移除 API 后启用
    console.log('移除设备:', deviceId)
    alert('设备已移除')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft size={18} />返回首页
          </Button>
        </div>

        <div className="mb-8 flex items-center gap-4">
          <Laptop size={32} className="text-blue-500" />
          <div>
            <h1 className="text-4xl font-bold">设备管理</h1>
            <p className="text-muted-foreground">管理您的登录设备</p>
          </div>
        </div>

        <div className="space-y-4">
          {devices.map((device) => (
            <Card key={device.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <device.icon size={32} className="text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{device.name}</h3>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <MapPin size={14} />
                          {device.location}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={14} />
                          最后活动: {device.lastActive}
                        </div>
                        <p className="text-xs">IP: {device.ip}</p>
                      </div>
                    </div>
                  </div>

                  {device.current ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">当前设备</span>
                  ) : (
                    <AlertDialog.Root>
                      <AlertDialog.Trigger asChild>
                        <Button variant="destructive">移除</Button>
                      </AlertDialog.Trigger>
                      <AlertDialog.Portal>
                        <AlertDialog.Overlay className="fixed inset-0 bg-black/50" />
                        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
                          <AlertDialog.Title className="text-lg font-semibold mb-2">
                            确认移除此设备？
                          </AlertDialog.Title>
                          <AlertDialog.Description className="text-sm text-muted-foreground mb-4">
                            移除后需要重新登录
                          </AlertDialog.Description>
                          <div className="flex gap-3 justify-end">
                            <AlertDialog.Cancel asChild>
                              <Button variant="outline">取消</Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                              <Button variant="destructive" onClick={() => handleRevoke(device.id)}>
                                确认
                              </Button>
                            </AlertDialog.Action>
                          </div>
                        </AlertDialog.Content>
                      </AlertDialog.Portal>
                    </AlertDialog.Root>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              💡 提示：定期检查您的登录设备，如发现异常设备请立即移除并修改密码
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
