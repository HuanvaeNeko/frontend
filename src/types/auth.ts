// 认证相关类型定义

export interface LoginRequest {
  user_id: string
  password: string
  device_info?: string
  mac_address?: string
}

export interface RegisterRequest {
  user_id: string
  nickname: string
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface RefreshTokenRequest {
  refresh_token: string
}

export interface User {
  user_id: string
  nickname: string
  email: string
  avatar_url?: string
  signature?: string
}

export interface Device {
  id: string
  device_info: string
  mac_address: string
  last_used_at: string
  created_at: string
}

export interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  tokenExpiry: number | null
}

export interface AuthStore extends AuthState {
  login: (credentials: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<void>
  setTokens: (tokens: { accessToken: string; refreshToken: string; expiresIn: number }) => void
  clearAuth: () => void
  checkTokenExpiry: () => boolean
}
