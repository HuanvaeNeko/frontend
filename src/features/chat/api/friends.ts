import { getApiBaseUrl } from '@/lib/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

const FRIENDS_BASE_URL = `${getApiBaseUrl()}/api/friends`

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
  
  // 检查 Token 是否即将过期，如果是则刷新
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

  // 如果 Token 过期，尝试刷新后重试一次
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
      window.location.href = ROUTES.auth.login
      throw error
    }
  }

  return response
}

// ============================================
// 类型定义
// ============================================

export interface Friend {
  user_id: string
  nickname: string
  avatar_url?: string
  email?: string
  signature?: string
}

export interface FriendRequest {
  user_id: string
  target_user_id: string
  reason?: string
  request_time: string
  status?: 'pending' | 'approved' | 'rejected'
}

export interface PendingRequest {
  applicant_user_id: string
  nickname: string
  reason?: string
  request_time: string
}

export interface SentRequest {
  target_user_id: string
  reason?: string
  request_time: string
  status: string
}

// ============================================
// API 方法
// ============================================

export const friendsApi = {
  /**
   * 获取好友列表
   * GET /api/friends
   */
  getFriendsList: async (): Promise<Friend[]> => {
    console.log('📱 获取好友列表')
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取好友列表失败 (${response.status})` 
      }))
      console.error('获取好友列表失败:', error)
      throw new Error(error.message || error.error || '获取好友列表失败')
    }

    const data = await response.json()
    console.log('📱 好友列表响应:', data)
    // 确保返回数组
    const friends = data.friends || data || []
    return Array.isArray(friends) ? friends : []
  },

  /**
   * 发送好友请求
   * POST /api/friends/requests
   * 请求体: { user_id, target_user_id, reason?, request_time }
   */
  sendFriendRequest: async (targetUserId: string, reason?: string): Promise<void> => {
    console.log('📤 发送好友请求给:', targetUserId)
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        target_user_id: targetUserId,
        reason: reason || '你好，我想加你为好友',
        request_time: new Date().toISOString(),
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `发送好友请求失败 (${response.status})` 
      }))
      console.error('发送好友请求失败:', error)
      throw new Error(error.message || error.error || '发送好友请求失败')
    }

    console.log('✅ 好友请求发送成功')
  },

  /**
   * 同意好友请求
   * POST /api/friends/requests/approve
   * 请求体: { user_id, applicant_user_id, approved_time, approved_reason? }
   */
  approveFriendRequest: async (applicantUserId: string, approvedReason?: string): Promise<void> => {
    console.log('✅ 同意好友请求:', applicantUserId)
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/approve`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        applicant_user_id: applicantUserId,
        approved_time: new Date().toISOString(),
        approved_reason: approvedReason,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `同意好友请求失败 (${response.status})` 
      }))
      console.error('同意好友请求失败:', error)
      throw new Error(error.message || error.error || '同意好友请求失败')
    }

    console.log('✅ 已同意好友请求')
  },

  /**
   * 拒绝好友请求
   * POST /api/friends/requests/reject
   * 请求体: { user_id, applicant_user_id, reject_reason? }
   */
  rejectFriendRequest: async (applicantUserId: string, rejectReason?: string): Promise<void> => {
    console.log('❌ 拒绝好友请求:', applicantUserId)
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/reject`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        applicant_user_id: applicantUserId,
        reject_reason: rejectReason,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `拒绝好友请求失败 (${response.status})` 
      }))
      console.error('拒绝好友请求失败:', error)
      throw new Error(error.message || error.error || '拒绝好友请求失败')
    }

    console.log('✅ 已拒绝好友请求')
  },

  /**
   * 获取已发送的好友请求
   * GET /api/friends/requests/sent
   */
  getSentRequests: async (): Promise<SentRequest[]> => {
    console.log('📤 获取已发送的好友请求')
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/sent`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取已发送请求失败 (${response.status})` 
      }))
      console.error('获取已发送请求失败:', error)
      throw new Error(error.message || error.error || '获取已发送请求失败')
    }

    const data = await response.json()
    console.log('📤 已发送请求响应:', data)
    // 确保返回数组
    const requests = data.requests || data || []
    return Array.isArray(requests) ? requests : []
  },

  /**
   * 获取待处理的好友请求
   * GET /api/friends/requests/pending
   */
  getPendingRequests: async (): Promise<PendingRequest[]> => {
    console.log('📬 获取待处理的好友请求')
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests/pending`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取待处理请求失败 (${response.status})` 
      }))
      console.error('获取待处理请求失败:', error)
      throw new Error(error.message || error.error || '获取待处理请求失败')
    }

    const data = await response.json()
    console.log('📬 待处理请求响应:', data)
    // 确保返回数组
    const requests = data.requests || data || []
    return Array.isArray(requests) ? requests : []
  },

  /**
   * 删除好友
   * POST /api/friends/remove
   * 请求体: { user_id, friend_user_id, remove_time, remove_reason? }
   */
  removeFriend: async (friendUserId: string, removeReason?: string): Promise<void> => {
    console.log('🗑️ 删除好友:', friendUserId)
    const authStore = useAuthStore.getState()
    const userId = authStore.user?.user_id

    if (!userId) {
      throw new Error('用户未登录')
    }

    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/remove`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        friend_user_id: friendUserId,
        remove_time: new Date().toISOString(),
        remove_reason: removeReason,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `删除好友失败 (${response.status})` 
      }))
      console.error('删除好友失败:', error)
      throw new Error(error.message || error.error || '删除好友失败')
    }

    console.log('✅ 已删除好友')
  },
}
