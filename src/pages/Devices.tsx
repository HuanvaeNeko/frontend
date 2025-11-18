import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faTrash, faLaptop } from '@fortawesome/free-solid-svg-icons'
import { authApi } from '../api/auth'
import type { Device } from '../types/auth'

export default function Devices() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    if (!confirm('确定要撤销此设备吗？该设备将需要重新登录。')) {
      return
    }

    try {
      await authApi.revokeDevice(deviceId)
      await loadDevices()
    } catch (err) {
      alert(err instanceof Error ? err.message : '撤销设备失败')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            返回首页
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <FontAwesomeIcon icon={faLaptop} />
            设备管理
          </h1>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">暂无登录设备</div>
          ) : (
            <div className="space-y-4">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <FontAwesomeIcon icon={faLaptop} className="text-gray-400" />
                      <span className="font-semibold text-gray-800">{device.device_info}</span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>MAC 地址: {device.mac_address}</p>
                      <p>最后使用: {formatDate(device.last_used_at)}</p>
                      <p>创建时间: {formatDate(device.created_at)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(device.id)}
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    撤销
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={loadDevices}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              刷新列表
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
