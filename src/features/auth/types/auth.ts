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
 * 于是资料拿不到时全站显示"访客"/"用户"/"U"，零报错。改成可选后至少能把
 * "有值" 和 "没值" 分开，不再永远吞进同一个空字符串再报不出错。
 *
 * 注意：这里说的"没值"只到"没值"为止，没有再往下细分。归一函数
 * `optionalString`（authStore.ts）把空字符串 `''` 也当成"没值"处理，
 * 统一映射成 `undefined`——也就是说"后端压根没给这个字段"和"后端给了但值是
 * 空字符串"这两种情况，在 `User.nickname` / `email` 上是**分不开**的，
 * 都读到同一个 `undefined`。这是有意的简化，不是疏漏：全部消费点
 * （MessageItem.tsx:125、VideoMeeting.tsx:114）本来就只关心"有没有可显示的值"，
 * 写的是可选链 + `||` 兜底，从不区分"未知"和"确实为空"，加这个区分对它们
 * 没有任何行为意义，反而会让 `optionalString` 多一个分支要维护。
 * 如果未来某个消费点真的需要区分这两种情况，就不能再用 `optionalString`，
 * 得换一个保留空字符串的归一函数。
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
