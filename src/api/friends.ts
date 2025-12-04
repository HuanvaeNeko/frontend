import { getApiBaseUrl } from '../utils/apiConfig'
import { useAuthStore } from '../store/authStore'

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
      window.location.href = '/login'
      throw error
    }
  }

  return response
}

export interface Friend {
  user_id: string
  nickname: string
  avatar?: string
  status?: 'online' | 'offline' | 'busy'
}

export interface FriendRequest {
  request_id: string
  from_user_id: string
  to_user_id: string
  message?: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export const friendsApi = {
  // 获取好友列表
  getFriendsList: async (): Promise<Friend[]> => {
    console.log('📱 获取好友列表')
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/list`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取好友列表失败 (${response.status})` 
      }))
      console.error('获取好友列表失败:', error)
      throw new Error(error.message || '获取好友列表失败')
    }

    const data = await response.json()
    return data.friends || []
  },

  // 搜索用户
  searchUsers: async (query: string): Promise<Friend[]> => {
    console.log('🔍 搜索用户:', query)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `搜索用户失败 (${response.status})` 
      }))
      console.error('搜索用户失败:', error)
      throw new Error(error.message || '搜索用户失败')
    }

    const data = await response.json()
    return data.users || []
  },

  // 发送好友请求
  sendFriendRequest: async (toUserId: string, message?: string): Promise<void> => {
    console.log('📤 发送好友请求给:', toUserId)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/request`, {
      method: 'POST',
      body: JSON.stringify({
        to_user_id: toUserId,
        message: message || '你好，我想加你为好友',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `发送好友请求失败 (${response.status})` 
      }))
      console.error('发送好友请求失败:', error)
      throw new Error(error.message || '发送好友请求失败')
    }

    console.log('✅ 好友请求发送成功')
  },

  // 获取好友请求列表
  getFriendRequests: async (): Promise<FriendRequest[]> => {
    console.log('📬 获取好友请求列表')
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/requests`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取好友请求失败 (${response.status})` 
      }))
      console.error('获取好友请求失败:', error)
      throw new Error(error.message || '获取好友请求失败')
    }

    const data = await response.json()
    return data.requests || []
  },

  // 接受好友请求
  acceptFriendRequest: async (requestId: string): Promise<void> => {
    console.log('✅ 接受好友请求:', requestId)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/request/${requestId}/accept`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `接受好友请求失败 (${response.status})` 
      }))
      console.error('接受好友请求失败:', error)
      throw new Error(error.message || '接受好友请求失败')
    }

    console.log('✅ 已接受好友请求')
  },

  // 拒绝好友请求
  rejectFriendRequest: async (requestId: string): Promise<void> => {
    console.log('❌ 拒绝好友请求:', requestId)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/request/${requestId}/reject`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `拒绝好友请求失败 (${response.status})` 
      }))
      console.error('拒绝好友请求失败:', error)
      throw new Error(error.message || '拒绝好友请求失败')
    }

    console.log('✅ 已拒绝好友请求')
  },

  // 删除好友
  deleteFriend: async (friendUserId: string): Promise<void> => {
    console.log('🗑️ 删除好友:', friendUserId)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/${friendUserId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `删除好友失败 (${response.status})` 
      }))
      console.error('删除好友失败:', error)
      throw new Error(error.message || '删除好友失败')
    }

    console.log('✅ 已删除好友')
  },

  // 屏蔽用户
  blockUser: async (userId: string): Promise<void> => {
    console.log('🚫 屏蔽用户:', userId)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/block/${userId}`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `屏蔽用户失败 (${response.status})` 
      }))
      console.error('屏蔽用户失败:', error)
      throw new Error(error.message || '屏蔽用户失败')
    }

    console.log('✅ 已屏蔽用户')
  },

  // 取消屏蔽用户
  unblockUser: async (userId: string): Promise<void> => {
    console.log('✅ 取消屏蔽用户:', userId)
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/unblock/${userId}`, {
      method: 'POST',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `取消屏蔽失败 (${response.status})` 
      }))
      console.error('取消屏蔽失败:', error)
      throw new Error(error.message || '取消屏蔽失败')
    }

    console.log('✅ 已取消屏蔽')
  },

  // 获取屏蔽列表
  getBlockedUsers: async (): Promise<Friend[]> => {
    console.log('📋 获取屏蔽列表')
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/blocked`, {
      method: 'GET',
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: `获取屏蔽列表失败 (${response.status})` 
      }))
      console.error('获取屏蔽列表失败:', error)
      throw new Error(error.message || '获取屏蔽列表失败')
    }

    const data = await response.json()
    return data.blocked_users || []
  },
}

