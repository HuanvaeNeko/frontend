import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from '../store/authStore'

const WEBRTC_BASE_URL = `${getApiBaseUrl()}/api/webrtc`

// 获取认证头
const getAuthHeaders = (): HeadersInit => {
  const accessToken = useAuthStore.getState().accessToken
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

// 带自动重试的 fetch 封装
const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authStore = useAuthStore.getState()
  
  if (authStore.checkTokenExpiry() && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
    } catch (error) {
      console.error('Failed to refresh token:', error)
    }
  }

  const headers = getAuthHeaders()
  
  let response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  })

  if (response.status === 401 && authStore.refreshToken) {
    try {
      await authStore.refreshAccessToken()
      const newHeaders = getAuthHeaders()
      response = await fetch(url, {
        ...options,
        headers: {
          ...newHeaders,
          ...options.headers,
        },
      })
    } catch (error) {
      console.error('Token refresh failed, redirecting to login')
      authStore.clearAuth()
      window.location.href = '/login'
      throw error
    }
  }

  return response
}

// ============================================
// 类型定义
// ============================================

export interface ICEServer {
  urls: string[]
  username?: string
  credential?: string
  credential_type?: 'password'
}

export interface ICEServersResponse {
  success: boolean
  data: {
    ice_servers: ICEServer[]
    expires_at: string
  }
}

export interface CreateRoomRequest {
  name?: string
  password?: string
  max_participants?: number
  expires_minutes?: number
}

export interface CreateRoomResponse {
  success: boolean
  data: {
    room_id: string
    password: string
    name?: string
    max_participants: number
    expires_at: string
  }
}

export interface JoinRoomRequest {
  password: string
  display_name: string
}

export interface JoinRoomResponse {
  success: boolean
  data: {
    participant_id: string
    ws_token: string
    room_name?: string
    ice_servers: ICEServer[]
    token_expires_at: string
  }
}

export interface Participant {
  id: string
  name: string
  is_creator: boolean
}

// WebSocket 消息类型
export interface WSJoinedMessage {
  type: 'joined'
  participant_id: string
  participants: Participant[]
}

export interface WSPeerJoinedMessage {
  type: 'peer_joined'
  participant: Participant
}

export interface WSPeerLeftMessage {
  type: 'peer_left'
  participant_id: string
}

export interface WSOfferMessage {
  type: 'offer'
  from: string
  sdp: string
}

export interface WSAnswerMessage {
  type: 'answer'
  from: string
  sdp: string
}

export interface WSCandidateMessage {
  type: 'candidate'
  from: string
  candidate: RTCIceCandidateInit
}

export interface WSRoomClosedMessage {
  type: 'room_closed'
  reason: string
}

export interface WSErrorMessage {
  type: 'error'
  code: string
  message: string
}

export type WSMessage =
  | WSJoinedMessage
  | WSPeerJoinedMessage
  | WSPeerLeftMessage
  | WSOfferMessage
  | WSAnswerMessage
  | WSCandidateMessage
  | WSRoomClosedMessage
  | WSErrorMessage

// ============================================
// API 方法
// ============================================

export const webrtcApi = {
  /**
   * 获取 ICE 服务器配置
   * GET /api/webrtc/ice-servers?region=xxx
   */
  getIceServers: async (region?: string): Promise<ICEServer[]> => {
    console.log('🌐 获取 ICE 服务器配置')
    
    const params = new URLSearchParams()
    if (region) {
      params.set('region', region)
    }
    
    const url = params.toString() 
      ? `${WEBRTC_BASE_URL}/ice-servers?${params}` 
      : `${WEBRTC_BASE_URL}/ice-servers`

    const response = await fetchWithAuth(url, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取 ICE 服务器配置失败' }))
      throw new Error(error.error?.message || error.error || '获取 ICE 服务器配置失败')
    }

    const data: ICEServersResponse = await response.json()
    console.log('✅ ICE 服务器配置获取成功, 过期时间:', data.data.expires_at)
    return data.data.ice_servers
  },

  /**
   * 创建房间（需登录）
   * POST /api/webrtc/rooms
   */
  createRoom: async (request: CreateRoomRequest = {}): Promise<CreateRoomResponse['data']> => {
    console.log('🏠 创建 WebRTC 房间:', request.name)
    const response = await fetchWithAuth(`${WEBRTC_BASE_URL}/rooms`, {
      method: 'POST',
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '创建房间失败' }))
      throw new Error(error.error || error.message || '创建房间失败')
    }

    const data: CreateRoomResponse = await response.json()
    console.log('✅ 房间创建成功:', data.data.room_id)
    return data.data
  },

  /**
   * 加入房间（无需登录）
   * POST /api/webrtc/rooms/{room_id}/join
   */
  joinRoom: async (roomId: string, request: JoinRoomRequest): Promise<JoinRoomResponse['data']> => {
    console.log('🚪 加入房间:', roomId)
    const response = await fetch(`${WEBRTC_BASE_URL}/rooms/${roomId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '加入房间失败' }))
      
      if (response.status === 401) {
        throw new Error('密码错误')
      } else if (response.status === 404) {
        throw new Error('房间不存在')
      } else if (response.status === 400) {
        throw new Error(error.error || error.message || '房间已过期或已满')
      }
      
      throw new Error(error.error || error.message || '加入房间失败')
    }

    const data: JoinRoomResponse = await response.json()
    console.log('✅ 加入房间成功, 参与者ID:', data.data.participant_id)
    return data.data
  },

  /**
   * 创建 WebSocket 信令连接
   * WS /ws/webrtc/rooms/{room_id}?token={token}
   * 
   * @param roomId 房间ID
   * @param token access_token (创建者) 或 ws_token (参与者)
   * @returns WebSocket 实例
   */
  createSignalingConnection: (roomId: string, token: string): WebSocket => {
    const baseUrl = getApiBaseUrl().replace(/^http/, 'ws')
    const wsUrl = `${baseUrl}/ws/webrtc/rooms/${roomId}?token=${token}`
    
    console.log('🔌 连接信令 WebSocket:', roomId)
    const ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      console.log('✅ 信令连接已建立')
    }
    
    ws.onclose = (event) => {
      console.log('🔌 信令连接已断开:', event.code, event.reason)
    }
    
    ws.onerror = (error) => {
      console.error('❌ 信令连接错误:', error)
    }
    
    return ws
  },

  /**
   * 发送信令消息
   */
  sendSignaling: (ws: WebSocket, message: Record<string, unknown>): void => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    } else {
      console.error('WebSocket 未连接, 消息发送失败')
    }
  },

  /**
   * 发送 Offer
   */
  sendOffer: (ws: WebSocket, targetId: string, sdp: string): void => {
    webrtcApi.sendSignaling(ws, {
      type: 'offer',
      to: targetId,
      sdp,
    })
  },

  /**
   * 发送 Answer
   */
  sendAnswer: (ws: WebSocket, targetId: string, sdp: string): void => {
    webrtcApi.sendSignaling(ws, {
      type: 'answer',
      to: targetId,
      sdp,
    })
  },

  /**
   * 发送 ICE Candidate
   */
  sendCandidate: (ws: WebSocket, targetId: string, candidate: RTCIceCandidateInit): void => {
    webrtcApi.sendSignaling(ws, {
      type: 'candidate',
      to: targetId,
      candidate,
    })
  },

  /**
   * 离开房间
   */
  leaveRoom: (ws: WebSocket): void => {
    webrtcApi.sendSignaling(ws, {
      type: 'leave',
    })
  },
}
