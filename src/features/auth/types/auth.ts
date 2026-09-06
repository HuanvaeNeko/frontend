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

/**
 * 当前登录用户。
 *
 * `nickname` / `email` 从必填改为可选：登录响应里这两个字段**没有文档保证**
 * （backend-docs 的 auth 文档只定义了 token 三件套），原来的
 * `nickname: data.nickname || ''` 把"后端没给"和"用户真的没填昵称"压成了同一个
 * 空字符串，而下游 `user?.nickname || '访客'` 又把空字符串再兜一层——
 * 于是资料拿不到时全站显示"访客"/"用户"/"U"，零报错。
 * 改成可选后，缺失就是 `undefined`（未知），与真实空值区分得开；
 * 已核实全部消费点（MessageItem.tsx:125、VideoMeeting.tsx:114）本来就写着
 * 可选链 + `||` 兜底，行为不变。
 */
export interface User {
  user_id: string
  nickname?: string
  email?: string
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
