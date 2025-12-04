import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings as SettingsIcon, Wand2, Globe, Shield, Palette } from 'lucide-react'
import { useApiConfigStore } from '../store/apiConfig'

export default function Settings() {
  const navigate = useNavigate()
  const apiConfigStore = useApiConfigStore()

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
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
            <SettingsIcon size={32} className="text-primary" />
            设置中心
          </h1>
          <p className="text-base-content/60 text-lg">配置您的应用偏好设置</p>
        </div>

        {/* 设置卡片网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI API 配置 */}
          <div className="card bg-base-100 shadow-xl border border-base-300 hover:shadow-2xl transition-all">
            <div className="card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="avatar placeholder">
                  <div className="bg-gradient-to-br from-primary to-secondary text-primary-content rounded-lg w-12">
                    <Wand2 size={20} />
                  </div>
                </div>
                <h2 className="card-title text-2xl">AI 配置</h2>
              </div>

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-4">
                  <input
                    type="checkbox"
                    checked={apiConfigStore.useCustomApi}
                    onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                      className="toggle toggle-primary toggle-lg"
                  />
                    <div>
                      <span className="label-text font-semibold text-base">使用自定义 API</span>
                      <p className="text-xs text-base-content/60">启用后可配置自己的 AI 服务</p>
                    </div>
                </label>
              </div>

                <div className="divider my-2"></div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">API 地址</span>
                </label>
                <input
                  type="text"
                  value={apiConfigStore.aiApiUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                  placeholder="http://localhost:8000/api/chat"
                  disabled={!apiConfigStore.useCustomApi}
                    className="input input-bordered"
                />
              </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">API Key</span>
                </label>
                <input
                  type="password"
                  value={apiConfigStore.aiApiKey}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                    placeholder="输入 API Key（可选）"
                  disabled={!apiConfigStore.useCustomApi}
                    className="input input-bordered"
                  />
                </div>
              </div>

              <div className="card-actions justify-end mt-4">
                <button className="btn btn-ghost btn-sm">
                  测试连接
                </button>
              </div>
            </div>
          </div>

          {/* WebSocket 配置 */}
          <div className="card bg-base-100 shadow-xl border border-base-300 hover:shadow-2xl transition-all">
            <div className="card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="avatar placeholder">
                  <div className="bg-gradient-to-br from-secondary to-accent text-secondary-content rounded-lg w-12">
                    <Globe size={20} />
                  </div>
                </div>
                <h2 className="card-title text-2xl">网络配置</h2>
              </div>

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">WebSocket URL</span>
                </label>
                <input
                  type="text"
                  value={apiConfigStore.wsUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ wsUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                  disabled={!apiConfigStore.useCustomApi}
                    className="input input-bordered"
                  />
                  <label className="label">
                    <span className="label-text-alt text-base-content/60">
                      用于群聊和视频会议的实时通信
                    </span>
                  </label>
                </div>

                <div className="stats bg-base-200 w-full">
                  <div className="stat place-items-center">
                    <div className="stat-title">连接状态</div>
                    <div className="stat-value text-success text-2xl">在线</div>
                    <div className="stat-desc">延迟: 15ms</div>
                  </div>
                </div>
              </div>

              <div className="card-actions justify-end mt-4">
                <button className="btn btn-ghost btn-sm">
                  重新连接
                </button>
              </div>
            </div>
          </div>

          {/* 隐私与安全 */}
          <div className="card bg-base-100 shadow-xl border border-base-300 hover:shadow-2xl transition-all">
            <div className="card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="avatar placeholder">
                  <div className="bg-gradient-to-br from-accent to-primary text-accent-content rounded-lg w-12">
                    <Shield size={20} />
                  </div>
                </div>
                <h2 className="card-title text-2xl">隐私与安全</h2>
              </div>

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-4">
                    <input type="checkbox" defaultChecked className="toggle toggle-success" />
                    <span className="label-text">端到端加密</span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-4">
                    <input type="checkbox" defaultChecked className="toggle toggle-success" />
                    <span className="label-text">自动保存聊天记录</span>
                  </label>
                </div>

                <div className="form-control">
                  <label className="label cursor-pointer justify-start gap-4">
                    <input type="checkbox" className="toggle toggle-success" />
                    <span className="label-text">允许陌生人消息</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 外观设置 */}
          <div className="card bg-base-100 shadow-xl border border-base-300 hover:shadow-2xl transition-all">
            <div className="card-body">
              <div className="flex items-center gap-3 mb-4">
                <div className="avatar placeholder">
                  <div className="bg-gradient-to-br from-pink-500 to-purple-500 text-white rounded-lg w-12">
                    <Palette size={20} />
                  </div>
                </div>
                <h2 className="card-title text-2xl">外观设置</h2>
              </div>

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">主题</span>
                  </label>
                  <select className="select select-bordered w-full">
                    <option>Light - 浅色</option>
                    <option>Dark - 深色</option>
                    <option>Cupcake - 杯子蛋糕</option>
                    <option>Cyberpunk - 赛博朋克</option>
                    <option>Synthwave - 合成波</option>
                  </select>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-semibold">字体大小</span>
                  </label>
                  <input type="range" min="12" max="20" defaultValue="16" className="range range-primary" />
                  <div className="w-full flex justify-between text-xs px-2 mt-2">
                    <span>小</span>
                    <span>中</span>
                    <span>大</span>
                  </div>
                </div>
              </div>
            </div>
              </div>
            </div>

        {/* 操作按钮 */}
        <div className="flex justify-between items-center mt-8 p-6 bg-base-100 rounded-box shadow-xl border border-base-300">
              <button
                onClick={() => apiConfigStore.resetToDefault()}
            className="btn btn-ghost gap-2"
              >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
                重置为默认
              </button>
              <button
                onClick={() => navigate('/')}
            className="btn btn-primary gap-2"
              >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            保存设置
              </button>
          </div>

        {/* 底部说明 */}
        <div className="alert alert-info mt-6 shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <div>
            <h3 className="font-bold">温馨提示</h3>
            <div className="text-xs">修改配置后需要重新加载页面才能生效。部分设置可能需要重新登录。</div>
          </div>
        </div>
      </div>
    </div>
  )
}
