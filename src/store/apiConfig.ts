import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ApiConfig } from '../types'
import { getApiBaseUrl } from '../utils/apiConfig'

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

export const useApiConfigStore = create<ApiConfigState>()(
  persist(
    (set) => ({
      ...defaultConfig,
      setApiConfig: (config) => set((state) => ({ ...state, ...config })),
      resetToDefault: () => set(defaultConfig)
    }),
    {
      name: 'api-config-storage',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
