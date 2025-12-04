# API 配置文档

本文档详细说明 HuanVae Chat 前端项目的 API 配置和使用方法。

## 📡 API 基础信息

### 后端仓库
- **GitHub**: [HuanvaeNeko/Huanvae-Chat-Rust](https://github.com/HuanvaeNeko/Huanvae-Chat-Rust)
- **技术栈**: Rust + Axum + PostgreSQL + MinIO
- **文档**: 详见后端仓库 README

### API 基础地址

**生产环境（Production）**
```
https://api.huanvae.cn
```

**本地开发（Development）**
```
http://localhost:8080
```

前端统一配置为使用生产环境地址，可通过环境变量覆盖。

---

## 🔧 环境变量配置

在项目根目录创建 `.env` 文件：

```bash
# API 基础地址（可选，默认使用 https://api.huanvae.cn）
VITE_AUTH_API_URL=https://api.huanvae.cn

# WebSocket 地址（用于实时通讯）
VITE_WS_URL=wss://api.huanvae.cn

# MinIO 公共访问地址（用于头像等资源）
VITE_MINIO_PUBLIC_URL=https://minio.huanvae.cn
```

---

## 📚 API 端点说明

### 认证相关 (Authentication)

#### 1. 用户注册
```http
POST /api/auth/register
Content-Type: application/json
```

**请求体：**
```json
{
  "user_id": "user123",
  "nickname": "张三",
  "email": "zhangsan@example.com",
  "password": "password123"
}
```

**密码要求：**
- 至少 8 位
- 必须包含字母和数字

**响应：**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

#### 2. 用户登录
```http
POST /api/auth/login
Content-Type: application/json
```

**请求体：**
```json
{
  "user_id": "user123",
  "password": "password123",
  "device_info": "Chrome 120 on Windows 11",
  "mac_address": "00:11:22:33:44:55"
}
```

**字段说明：**
- `device_info`: 设备信息（浏览器、操作系统等）
- `mac_address`: 设备唯一标识

**响应：**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Token 说明：**
- `access_token`: 访问令牌，有效期 15 分钟
- `refresh_token`: 刷新令牌，有效期 7 天
- `expires_in`: 过期时间（秒）

---

#### 3. 刷新 Token
```http
POST /api/auth/refresh
Content-Type: application/json
```

**请求体：**
```json
{
  "refresh_token": "eyJ..."
}
```

**响应：**
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

---

#### 4. 用户登出
```http
POST /api/auth/logout
Authorization: Bearer {access_token}
```

**功能说明：**
- 撤销当前设备的 Refresh Token
- 将当前 Access Token 加入黑名单
- 启用用户的黑名单检查（15分钟）

**响应：**
```json
{
  "message": "Successfully logged out"
}
```

---

#### 5. 查看所有登录设备
```http
GET /api/auth/devices
Authorization: Bearer {access_token}
```

**响应：**
```json
{
  "devices": [
    {
      "id": "uuid",
      "user_id": "user123",
      "device_info": "Chrome 120 on Windows 11",
      "mac_address": "00:11:22:33:44:55",
      "last_used_at": "2024-01-01T12:00:00Z",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ]
}
```

---

#### 6. 撤销指定设备
```http
DELETE /api/auth/devices/:id
Authorization: Bearer {access_token}
```

**功能说明：**
- 撤销指定设备的登录状态
- 该设备需要重新登录

**⚠️ 重要行为说明：**
- **删除其他设备**：不影响当前设备的 Token，当前 Token 仍然有效
- **删除当前设备**：当前 Token 立即失效，后续请求返回 401

**示例场景：**
```typescript
// 场景 1: 删除其他设备
const devices = await fetch('https://api.huanvae.cn/api/auth/devices', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json())

const otherDevice = devices.devices.find(d => !d.is_current)
await fetch(`https://api.huanvae.cn/api/auth/devices/${otherDevice.id}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
})
// ✓ 当前 token 仍然有效

// 场景 2: 删除当前设备（相当于登出）
const currentDevice = devices.devices.find(d => d.is_current)
await fetch(`https://api.huanvae.cn/api/auth/devices/${currentDevice.id}`, {
  method: 'DELETE',
  headers: { 'Authorization': `Bearer ${token}` }
})
// ✗ 当前 token 已失效，后续请求返回 401
```

**响应：**
```json
{
  "message": "Device revoked successfully"
}
```

---

### 好友相关 (Friends)

#### 1. 发送好友申请
```http
POST /api/friends/requests
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体：**
```json
{
  "user_id": "user123",
  "target_user_id": "user456",
  "reason": "你好，我想加你为好友",
  "request_time": "2024-01-25T12:00:00Z"
}
```

**字段说明：**
- `user_id`: 发起人（当前用户）的 user_id
- `target_user_id`: 目标用户的 user_id
- `reason`: 申请理由（可选）
- `request_time`: 申请时间（ISO 8601 格式）

---

#### 2. 同意好友申请
```http
POST /api/friends/requests/approve
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体：**
```json
{
  "user_id": "user456",
  "applicant_user_id": "user123",
  "approved_time": "2024-01-25T12:05:00Z",
  "approved_reason": "通过"
}
```

**字段说明：**
- `user_id`: 当前用户（被申请人）的 user_id
- `applicant_user_id`: 申请人的 user_id
- `approved_time`: 通过时间（ISO 8601 格式）
- `approved_reason`: 通过原因（可选）

---

#### 3. 拒绝好友申请
```http
POST /api/friends/requests/reject
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体：**
```json
{
  "user_id": "user456",
  "applicant_user_id": "user123",
  "reject_reason": "暂不需要"
}
```

**字段说明：**
- `user_id`: 当前用户（被申请人）的 user_id
- `applicant_user_id`: 申请人的 user_id
- `reject_reason`: 拒绝原因（可选）

---

#### 4. 查看已发送的好友请求
```http
GET /api/friends/requests/sent
Authorization: Bearer {access_token}
```

---

#### 5. 查看待处理的好友请求
```http
GET /api/friends/requests/pending
Authorization: Bearer {access_token}
```

---

#### 6. 查看好友列表
```http
GET /api/friends
Authorization: Bearer {access_token}
```

---

#### 7. 删除好友
```http
POST /api/friends/remove
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体：**
```json
{
  "user_id": "user123",
  "friend_user_id": "user456",
  "remove_time": "2024-01-25T12:10:00Z",
  "remove_reason": "不常联系"
}
```

**字段说明：**
- `user_id`: 当前用户的 user_id
- `friend_user_id`: 要删除的好友的 user_id
- `remove_time`: 删除时间（ISO 8601 格式）
- `remove_reason`: 删除原因（可选）

**注意：** 此操作是标记删除，会在数据库中记录删除时间和原因

---

### 个人资料 (Profile)

#### 1. 获取个人信息
```http
GET /api/profile
Authorization: Bearer {access_token}
```

**响应：**
```json
{
  "data": {
    "user_id": "user123",
    "user_nickname": "张三",
    "user_email": "zhangsan@example.com",
    "user_avatar_url": "https://minio.huanvae.cn/avatars/user123.jpg",
    "user_signature": "这是我的个性签名",
    "admin": "false",
    "created_at": "2024-01-01T10:00:00Z",
    "updated_at": "2024-01-25T12:00:00Z"
  }
}
```

**字段说明：**
- `user_id`: 用户 ID
- `user_nickname`: 用户昵称
- `user_email`: 用户邮箱
- `user_avatar_url`: 头像 URL
- `user_signature`: 个性签名
- `admin`: 是否管理员（"true" / "false"）
- `created_at`: 创建时间
- `updated_at`: 更新时间

---

#### 2. 更新个人信息
```http
PUT /api/profile
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体：**
```json
{
  "email": "newemail@example.com",
  "signature": "新的个性签名"
}
```

---

#### 3. 修改密码
```http
PUT /api/profile/password
Authorization: Bearer {access_token}
Content-Type: application/json
```

**请求体：**
```json
{
  "old_password": "oldpass123",
  "new_password": "newpass456"
}
```

**安全说明：**
- 修改密码后会启用 15 分钟黑名单检查
- 所有其他设备的 Token 将失效

---

#### 4. 上传头像
```http
POST /api/profile/avatar
Authorization: Bearer {access_token}
Content-Type: multipart/form-data
```

**请求体：**
```
avatar: [文件]
```

**支持的图片格式：**
- JPEG / JPG
- PNG
- GIF
- WebP
- BMP

**文件大小限制：** 5MB（建议）

**前端实现建议：**
```typescript
async function uploadAvatar(file: File, token: string) {
  // 验证文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('不支持的图片格式')
  }
  
  // 验证文件大小 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('文件大小不能超过 5MB')
  }
  
  const formData = new FormData()
  formData.append('avatar', file)
  
  const response = await fetch('https://api.huanvae.cn/api/profile/avatar', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // 注意：不要设置 Content-Type，让浏览器自动设置
    },
    body: formData
  })
  
  if (!response.ok) {
    throw new Error('上传失败')
  }
  
  return await response.json()
}
```

**响应：**
```json
{
  "avatar_url": "https://minio.huanvae.cn/avatars/user123.jpg"
}
```

---

## 🔐 认证流程详解

### Token 机制

**双 Token 系统：**
1. **Access Token** (访问令牌)
   - 有效期：15 分钟
   - 用途：API 请求认证
   - 签名方式：RSA 2048 位私钥签名

2. **Refresh Token** (刷新令牌)
   - 有效期：7 天
   - 用途：刷新 Access Token
   - 存储：数据库持久化
   - 关联：设备信息

### 请求认证

所有需要认证的 API 请求都需要在请求头中携带 Token：

```http
Authorization: Bearer {access_token}
```

### Token 刷新策略

**前端实现建议：**

```typescript
// 检查 Token 是否快过期（剩余时间 < 5 分钟）
const checkTokenExpiry = () => {
  const expiresAt = localStorage.getItem('token_expires_at')
  if (!expiresAt) return false
  
  const now = Date.now()
  const expires = parseInt(expiresAt)
  const timeLeft = expires - now
  
  // 剩余时间少于 5 分钟
  return timeLeft < 5 * 60 * 1000
}

// 自动刷新 Token
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) throw new Error('No refresh token')
  
  const response = await fetch('https://api.huanvae.cn/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  
  if (!response.ok) {
    // Refresh Token 也过期了，需要重新登录
    throw new Error('Token refresh failed')
  }
  
  const data = await response.json()
  
  // 保存新的 Access Token
  localStorage.setItem('access_token', data.access_token)
  localStorage.setItem('token_expires_at', Date.now() + data.expires_in * 1000)
}

// 在每次请求前检查
setInterval(() => {
  if (checkTokenExpiry()) {
    refreshAccessToken().catch(console.error)
  }
}, 60000) // 每分钟检查一次
```

---

## 🛡️ 安全特性

### 1. 智能黑名单检查

**设计理念：**
- **正常情况**：跳过黑名单查询，性能最优
- **安全事件**（修改密码、远程登出）：启用 15 分钟黑名单检查
- **自动恢复**：15 分钟后自动关闭检查

**实现方式：**
- Redis 存储用户标记 `need-blacklist-check:{user_id}`
- TTL 自动过期
- 中间件智能判断

### 2. 多设备管理

**功能特点：**
- 每个设备独立的 Refresh Token
- 支持查看所有登录设备
- 支持远程撤销指定设备
- 设备信息记录（浏览器、操作系统、MAC 地址）

### 3. 密码安全

**加密方式：**
- bcrypt 哈希（cost=12）
- 单向加密，不可逆

**密码要求：**
- 最少 8 位
- 必须包含字母
- 必须包含数字

### 4. RSA 签名

**密钥信息：**
- 算法：RSA 2048 位
- 签名：私钥签名
- 验证：公钥验证
- 存储：文件系统持久化

---

## 🚀 前端集成示例

### Zustand Store 实现

```typescript
// src/store/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<void>
  checkTokenExpiry: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      
      login: async (credentials) => {
        const response = await fetch('https://api.huanvae.cn/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: credentials.user_id,
            password: credentials.password,
            device_info: navigator.userAgent,
            mac_address: 'browser-' + Math.random().toString(36)
          })
        })
        
        if (!response.ok) {
          throw new Error('Login failed')
        }
        
        const data = await response.json()
        
        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          isAuthenticated: true
        })
      },
      
      logout: async () => {
        const { accessToken } = get()
        
        await fetch('https://api.huanvae.cn/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
        
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false
        })
      },
      
      refreshAccessToken: async () => {
        const { refreshToken } = get()
        
        const response = await fetch('https://api.huanvae.cn/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        })
        
        if (!response.ok) {
          throw new Error('Token refresh failed')
        }
        
        const data = await response.json()
        
        set({ accessToken: data.access_token })
      },
      
      checkTokenExpiry: () => {
        // 实现 Token 过期检查逻辑
        return false
      }
    }),
    {
      name: 'auth-storage'
    }
  )
)
```

---

## 📝 错误处理

### 常见错误代码

| 状态码 | 说明                |
| ------ | ------------------- |
| 400    | 请求参数错误        |
| 401    | 未认证或 Token 无效 |
| 403    | 权限不足            |
| 404    | 资源不存在          |
| 409    | 资源冲突（如用户已存在） |
| 500    | 服务器内部错误      |

### 错误响应格式

```json
{
  "error": "错误类型",
  "message": "详细错误信息"
}
```

### 前端错误处理建议

```typescript
async function apiRequest(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, options)
    
    if (!response.ok) {
      const error = await response.json()
      
      // 根据状态码处理
      switch (response.status) {
        case 401:
          // Token 过期，尝试刷新
          await refreshAccessToken()
          // 重试请求
          return apiRequest(url, options)
          
        case 403:
          // 权限不足
          throw new Error('权限不足')
          
        case 404:
          throw new Error('资源不存在')
          
        default:
          throw new Error(error.message || '请求失败')
      }
    }
    
    return await response.json()
  } catch (error) {
    console.error('API Error:', error)
    throw error
  }
}
```

---

## 🔗 相关链接

- **后端仓库**: [HuanvaeNeko/Huanvae-Chat-Rust](https://github.com/HuanvaeNeko/Huanvae-Chat-Rust)
- **后端 API 文档**: 详见后端仓库 `接口调取文档` 目录
- **生产环境**: https://api.huanvae.cn
- **MinIO 存储**: https://minio.huanvae.cn

---

## 📅 版本历史

### v1.0.0 (2024-01-25)
- 统一使用生产环境 API 地址 `https://api.huanvae.cn`
- 完善 API 端点文档
- 添加认证流程详解
- 添加安全特性说明
- 添加前端集成示例

---

## 👨‍💻 维护者

HuanVae Chat Team - 欢伪

如有问题或建议，欢迎在 GitHub 提交 Issue。
