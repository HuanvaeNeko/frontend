import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Trash2, 
  Laptop, 
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import { authApi } from '../api/auth'
import type { Device } from '../types/auth'

export default function Devices() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      setLoading(true)
      const data = await authApi.getDevices()
      setDevices(data.devices || data || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载设备列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (deviceId: string) => {
    try {
      await authApi.revokeDevice(deviceId)
      await loadDevices()
      setSelectedDevice(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '撤销设备失败')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days} 天前`
    return date.toLocaleDateString('zh-CN')
  }

  const getDeviceIcon = (deviceInfo: string) => {
    const info = deviceInfo.toLowerCase()
    if (info.includes('mobile') || info.includes('iphone') || info.includes('android')) {
      return Smartphone
    }
    if (info.includes('tablet') || info.includes('ipad')) {
      return Tablet
    }
    if (info.includes('desktop') || info.includes('windows') || info.includes('mac')) {
      return Monitor
    }
    return Laptop
  }

  const getDeviceColor = (index: number) => {
    const colors = [
      'from-blue-500 to-cyan-500',
      'from-purple-500 to-pink-500',
      'from-orange-500 to-red-500',
      'from-green-500 to-emerald-500',
      'from-indigo-500 to-violet-500'
    ]
    return colors[index % colors.length]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* 面包屑导航 */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="btn btn-ghost gap-2"
          >
            <ArrowLeft size={20} />
            返回首页
          </button>
        </div>

        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-4xl font-black mb-2 flex items-center gap-3">
            <Laptop size={32} className="text-primary" />
            设备管理
          </h1>
          <p className="text-base-content/60 text-lg">管理您的所有登录设备</p>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="stats shadow-xl bg-gradient-to-br from-primary to-secondary text-primary-content">
            <div className="stat">
              <div className="stat-title text-primary-content/70">设备总数</div>
              <div className="stat-value">{devices.length}</div>
              <div className="stat-desc text-primary-content/70">已授权设备</div>
            </div>
          </div>

          <div className="stats shadow-xl bg-gradient-to-br from-secondary to-accent text-secondary-content">
            <div className="stat">
              <div className="stat-title text-secondary-content/70">活跃设备</div>
              <div className="stat-value">{devices.filter(d => {
                const lastUsed = new Date(d.last_used_at)
                const daysSinceUse = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)
                return daysSinceUse < 7
              }).length}</div>
              <div className="stat-desc text-secondary-content/70">7天内使用</div>
            </div>
          </div>

          <div className="stats shadow-xl bg-gradient-to-br from-accent to-primary text-accent-content">
            <div className="stat">
              <div className="stat-title text-accent-content/70">安全状态</div>
              <div className="stat-value text-2xl flex items-center gap-2">
                <CheckCircle size={18} />
                安全
              </div>
              <div className="stat-desc text-accent-content/70">无异常登录</div>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="alert alert-error mb-6 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* 设备列表 */}
        <div className="card bg-base-100 shadow-xl border border-base-300">
          <div className="card-body">
            <div className="flex justify-between items-center mb-6">
              <h2 className="card-title text-2xl">设备列表</h2>
              <button
                onClick={loadDevices}
                className="btn btn-primary btn-sm gap-2"
                disabled={loading}
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                刷新
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <span className="loading loading-spinner loading-lg text-primary mb-4"></span>
                <p className="text-base-content/60">加载设备列表...</p>
              </div>
            ) : devices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="text-6xl text-base-content/20 mb-4">
                  <AlertTriangle size={18} />
                </div>
                <p className="text-xl text-base-content/60">暂无登录设备</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map((device, index) => (
                  <div
                    key={device.id}
                    className={`card bg-base-200 shadow-lg hover:shadow-2xl transition-all cursor-pointer border-2 ${
                      selectedDevice === device.id ? 'border-primary' : 'border-transparent'
                    }`}
                    onClick={() => setSelectedDevice(device.id)}
                  >
                    <div className="card-body">
                      {/* 设备图标 */}
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${getDeviceColor(index)} flex items-center justify-center text-white text-2xl shadow-lg`}>
                          {(() => {
                            const IconComponent = getDeviceIcon(device.device_info)
                            return <IconComponent size={28} />
                          })()}
                        </div>
                        <div className="dropdown dropdown-end">
                          <label tabIndex={0} className="btn btn-ghost btn-sm btn-circle">
                            •••
                          </label>
                          <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-xl bg-base-100 rounded-box w-52">
                            <li>
                              <a className="text-error" onClick={(e) => {
                                e.stopPropagation()
                                if (confirm('确定要撤销此设备吗？')) {
                                  handleRevoke(device.id)
                                }
                              }}>
                                <Trash2 size={16} />
                                撤销设备
                              </a>
                            </li>
                          </ul>
                        </div>
                      </div>

                      {/* 设备信息 */}
                      <h3 className="card-title text-lg mb-2">{device.device_info}</h3>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="badge badge-ghost badge-sm">MAC</div>
                          <span className="font-mono text-xs">{device.mac_address}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="badge badge-ghost badge-sm">最后使用</div>
                          <span>{formatDate(device.last_used_at)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="badge badge-ghost badge-sm">创建时间</div>
                          <span>{formatDate(device.created_at)}</span>
                        </div>
                      </div>

                      {/* 状态标签 */}
                      <div className="card-actions justify-end mt-4">
                        {(() => {
                          const lastUsed = new Date(device.last_used_at)
                          const daysSinceUse = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)
                          if (daysSinceUse < 1) {
                            return <div className="badge badge-success gap-1">
                              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                              活跃
                            </div>
                          }
                          if (daysSinceUse < 7) {
                            return <div className="badge badge-warning">最近使用</div>
                          }
                          return <div className="badge badge-ghost">不活跃</div>
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 安全提示 */}
        <div className="alert alert-warning shadow-lg mt-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-bold">安全提示</h3>
            <div className="text-xs">定期检查您的设备列表，撤销不认识的设备以保护账号安全。撤销后该设备需要重新登录。</div>
          </div>
        </div>
      </div>
    </div>
  )
}
