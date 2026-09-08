import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ApiConfig } from '@/types'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { registerSessionReset, sessionScopedLocalStorage } from '@/lib/sessionScope'

interface ApiConfigState extends ApiConfig {
  setApiConfig: (config: Partial<ApiConfig>) => void
  resetToDefault: () => void
}

const apiBaseUrl = getApiBaseUrl()

// 根据 API 基础地址生成 WebSocket URL
const getDefaultWsUrl = (): string => {
  if (apiBaseUrl.startsWith('https://')) {
    return apiBaseUrl.replace('https://', 'wss://').replace(':8080', ':3001')
  }
  return apiBaseUrl.replace('http://', 'ws://').replace(':8080', ':3001')
}

const defaultConfig: ApiConfig = {
  aiApiUrl: `${apiBaseUrl}/api/chat`,
  aiApiKey: '',
  wsUrl: getDefaultWsUrl(),
  useCustomApi: false
}

/**
 * ⚠️ 这个 store 里的 `aiApiKey` 是**用户自备的第三方 API 密钥**，明文落在
 * `api-config-storage` 里，而且会被真的用出去：`AiChatPage` 在
 * `useCustomApi && aiApiKey` 时把它塞进 `X-API-Key` 请求头。`useCustomApi`
 * 同样持久化，所以在此之前，登出之后下一个用这台电脑的人，AI 请求会静默地
 * 带着上一个人的密钥发出去（他的账单、他的配额、他的审计日志）——密钥输入框是
 * `type="password"`，屏幕上看不见，devtools 里一览无余。
 *
 * 现在整个键跟着账号走：落盘副本由 `endSession` 的反向名单删掉，内存副本由
 * 本文件底部登记的重置回调恢复成默认值。
 */
export const useApiConfigStore = create<ApiConfigState>()(
  persist(
    (set) => ({
      ...defaultConfig,
      setApiConfig: (config) => set((state) => ({ ...state, ...config })),
      resetToDefault: () => set(defaultConfig)
    }),
    {
      name: 'api-config-storage',
      storage: createJSONStorage(() => sessionScopedLocalStorage)
    }
  )
)

// 会话结束时把 AI 配置（含明文密钥）恢复成默认值。`resetToDefault` 在此之前
// 只有两个用户手点的"重置"按钮会调（`SettingsPage` / `AiChatPage`），没有一条
// 登出路径碰过它。
registerSessionReset(() => {
  useApiConfigStore.getState().resetToDefault()
})
