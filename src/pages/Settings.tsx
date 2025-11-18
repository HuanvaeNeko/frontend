import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faCog } from '@fortawesome/free-solid-svg-icons'
import { useApiConfigStore } from '../store/apiConfig'

export default function Settings() {
  const navigate = useNavigate()
  const apiConfigStore = useApiConfigStore()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <button 
              onClick={() => navigate('/')}
              className="text-gray-600 hover:text-gray-800"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
              返回首页
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              <FontAwesomeIcon icon={faCog} className="mr-2" />
              API 配置
            </h2>

            <div className="space-y-6">
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={apiConfigStore.useCustomApi}
                    onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700">使用自定义 API</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">关闭时将使用默认的本地 API 服务</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI API URL
                </label>
                <input
                  type="text"
                  value={apiConfigStore.aiApiUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                  placeholder="http://localhost:8000/api/chat"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">默认: http://localhost:8000/api/chat</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI API Key (可选)
                </label>
                <input
                  type="password"
                  value={apiConfigStore.aiApiKey}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                  placeholder="输入 API Key"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">某些 API 服务需要 API Key 进行身份验证</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WebSocket URL
                </label>
                <input
                  type="text"
                  value={apiConfigStore.wsUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ wsUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">默认: http://localhost:3001</p>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => apiConfigStore.resetToDefault()}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              >
                重置为默认
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                保存配置
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
            <h3 className="text-lg font-semibold mb-4">配置说明</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p><strong>默认模式：</strong>当"使用自定义 API"关闭时，系统将使用本地 API 服务（http://localhost:8000/api/chat）。</p>
              <p><strong>自定义模式：</strong>开启后可以配置自己的 API 端点，支持 OpenAI、DeepSeek 等 API 服务。</p>
              <p><strong>WebSocket：</strong>用于群聊和视频会议的实时通信服务。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
