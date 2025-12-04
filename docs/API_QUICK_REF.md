# API 快速参考

快速查阅 HuanVae Chat API 的常用端点和示例。

> 📚 **完整文档**: 详见 [API_CONFIG.md](./API_CONFIG.md)  
> 🔗 **后端文档**: [Huanvae-Chat-Rust/接口调取文档](https://github.com/HuanvaeNeko/Huanvae-Chat-Rust/tree/main/%E6%8E%A5%E5%8F%A3%E8%B0%83%E5%8F%96%E6%96%87%E6%A1%A3)

---

## 🌐 基础配置

```typescript
const API_BASE = 'https://api.huanvae.cn'
const WS_BASE = 'wss://api.huanvae.cn'
```

---

## 🔐 认证 API

### 注册
```typescript
POST /api/auth/register

{
  "user_id": "user123",
  "nickname": "张三",
  "email": "user@example.com",
  "password": "password123"  // 最少8位，含字母+数字
}

// 返回: { access_token, refresh_token, expires_in }
```

### 登录
```typescript
POST /api/auth/login

{
  "user_id": "user123",
  "password": "password123",
  "device_info": navigator.userAgent,
  "mac_address": "browser-" + Math.random().toString(36)
}

// 返回: { access_token, refresh_token, expires_in }
```

### 刷新 Token
```typescript
POST /api/auth/refresh

{
  "refresh_token": "eyJ..."
}

// 返回: { access_token, expires_in }
```

### 登出
```typescript
POST /api/auth/logout
Authorization: Bearer {access_token}

// 返回: { message: "Successfully logged out" }
```

### 设备管理
```typescript
// 查看所有设备
GET /api/auth/devices
Authorization: Bearer {access_token}

// 撤销设备
DELETE /api/auth/devices/:id
Authorization: Bearer {access_token}

// ⚠️ 重要行为：
// - 删除其他设备：不影响当前 Token
// - 删除当前设备：当前 Token 立即失效（相当于登出）
```

---

## 👥 好友 API

### 发送好友申请
```typescript
POST /api/friends/requests
Authorization: Bearer {access_token}

{
  "user_id": "user123",           // 当前用户ID
  "target_user_id": "user456",    // 目标用户ID
  "reason": "你好，想加你为好友",  // 可选
  "request_time": new Date().toISOString()
}
```

### 处理好友申请
```typescript
// 同意
POST /api/friends/requests/approve
Authorization: Bearer {access_token}

{
  "user_id": "user456",           // 当前用户（被申请人）
  "applicant_user_id": "user123", // 申请人
  "approved_time": new Date().toISOString(),
  "approved_reason": "通过"       // 可选
}

// 拒绝
POST /api/friends/requests/reject
Authorization: Bearer {access_token}

{
  "user_id": "user456",
  "applicant_user_id": "user123",
  "reject_reason": "暂不需要"     // 可选
}
```

### 查询好友
```typescript
// 已发送的请求
GET /api/friends/requests/sent
Authorization: Bearer {access_token}

// 待处理的请求
GET /api/friends/requests/pending
Authorization: Bearer {access_token}

// 好友列表
GET /api/friends
Authorization: Bearer {access_token}
```

### 删除好友
```typescript
POST /api/friends/remove
Authorization: Bearer {access_token}

{
  "user_id": "user123",
  "friend_user_id": "user456",
  "remove_time": new Date().toISOString(),
  "remove_reason": "不常联系"     // 可选
}
```

---

## 👤 个人资料 API

### 获取个人信息
```typescript
GET /api/profile
Authorization: Bearer {access_token}

// 返回: 
// {
//   "data": {
//     "user_id": "user123",
//     "user_nickname": "张三",
//     "user_email": "user@example.com",
//     "user_avatar_url": "https://...",
//     "user_signature": "个性签名",
//     "admin": "false",
//     "created_at": "2024-01-01T10:00:00Z",
//     "updated_at": "2024-01-25T12:00:00Z"
//   }
// }
```

### 更新个人信息
```typescript
PUT /api/profile
Authorization: Bearer {access_token}

{
  "email": "new@example.com",    // 可选
  "signature": "我的个性签名"      // 可选
}
```

### 修改密码
```typescript
PUT /api/profile/password
Authorization: Bearer {access_token}

{
  "old_password": "oldpass123",
  "new_password": "newpass456"
}

// ⚠️ 修改密码后会触发15分钟黑名单检查
```

### 上传头像
```typescript
POST /api/profile/avatar
Authorization: Bearer {access_token}
Content-Type: multipart/form-data

FormData: { avatar: File }

// 支持: JPEG, PNG, GIF, WebP
// 限制: 5MB
// 返回: { avatar_url }
```

---

## 💡 前端实现示例

### Fetch 封装
```typescript
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  })

  if (response.status === 401) {
    // Token 过期，尝试刷新
    await refreshToken()
    return apiRequest(endpoint, options) // 重试
  }

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '请求失败')
  }

  return response.json()
}
```

### 自动刷新 Token
```typescript
let isRefreshing = false
let refreshPromise: Promise<void> | null = null

async function refreshToken() {
  // 防止并发刷新
  if (isRefreshing) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) throw new Error('No refresh token')

      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!response.ok) {
        // Refresh Token 也过期了，需要重新登录
        localStorage.clear()
        window.location.href = '/login'
        return
      }

      const data = await response.json()
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem(
        'token_expires_at',
        String(Date.now() + data.expires_in * 1000)
      )
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// 定期检查 Token 是否快过期
setInterval(() => {
  const expiresAt = localStorage.getItem('token_expires_at')
  if (!expiresAt) return

  const timeLeft = parseInt(expiresAt) - Date.now()
  
  // 剩余时间 < 5 分钟，提前刷新
  if (timeLeft < 5 * 60 * 1000) {
    refreshToken().catch(console.error)
  }
}, 60000) // 每分钟检查一次
```

### 登录示例
```typescript
async function login(userId: string, password: string) {
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      password: password,
      device_info: navigator.userAgent,
      mac_address: `browser-${Math.random().toString(36).slice(2)}`,
    }),
  })

  // 保存 Token
  localStorage.setItem('access_token', data.access_token)
  localStorage.setItem('refresh_token', data.refresh_token)
  localStorage.setItem(
    'token_expires_at',
    String(Date.now() + data.expires_in * 1000)
  )

  return data
}
```

### 上传头像示例
```typescript
async function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('avatar', file)

  const token = localStorage.getItem('access_token')
  
  const response = await fetch(`${API_BASE}/api/profile/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData, // 不设置 Content-Type，让浏览器自动设置
  })

  if (!response.ok) {
    throw new Error('上传失败')
  }

  return response.json()
}
```

---

## 🔒 安全注意事项

### Token 存储
```typescript
// ✅ 推荐：使用 localStorage（SPA 应用）
localStorage.setItem('access_token', token)

// ⚠️ 注意：不要存储在 sessionStorage（刷新页面会丢失）
// ⚠️ 注意：不要存储在 cookie（CSRF 风险）
```

### 敏感操作
修改密码、删除账号等敏感操作会触发：
- ✅ 15 分钟黑名单检查
- ✅ 其他设备 Token 失效
- ✅ 需要重新登录

### 设备管理
```typescript
// 定期检查设备列表
async function checkDevices() {
  const devices = await apiRequest('/api/auth/devices')
  
  // 发现可疑设备？
  const suspiciousDevice = devices.find(d => 
    !isMyDevice(d.device_info)
  )
  
  if (suspiciousDevice) {
    // 撤销可疑设备
    await apiRequest(`/api/auth/devices/${suspiciousDevice.id}`, {
      method: 'DELETE'
    })
  }
}
```

---

## 📊 常见错误码

| 状态码 | 说明 | 处理方式 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查请求体格式 |
| 401 | Token 无效/过期 | 刷新 Token 或重新登录 |
| 403 | 权限不足 | 提示用户权限不足 |
| 404 | 资源不存在 | 检查 API 路径 |
| 409 | 资源冲突 | 如用户已存在 |
| 500 | 服务器错误 | 稍后重试 |

---

## 🔗 相关链接

- 📖 [完整 API 文档](./API_CONFIG.md)
- 🦀 [后端项目](https://github.com/HuanvaeNeko/Huanvae-Chat-Rust)
- 📝 [后端接口文档](https://github.com/HuanvaeNeko/Huanvae-Chat-Rust/tree/main/%E6%8E%A5%E5%8F%A3%E8%B0%83%E5%8F%96%E6%96%87%E6%A1%A3)
- 🚀 [部署文档](./DEPLOY.md)
- 🎨 [UI 设计文档](./UI_REDESIGN.md)

---

## 📝 快速命令

### 测试 API（浏览器控制台）
```javascript
// 注册
await fetch('https://api.huanvae.cn/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'test123',
    nickname: '测试用户',
    email: 'test@example.com',
    password: 'test1234'
  })
}).then(r => r.json())

// 登录
const res = await fetch('https://api.huanvae.cn/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'test123',
    password: 'test1234',
    device_info: navigator.userAgent,
    mac_address: 'test-device'
  })
}).then(r => r.json())

const token = res.access_token

// 获取个人信息
await fetch('https://api.huanvae.cn/api/profile', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json())
```

---

**最后更新**: 2024-01-25  
**维护者**: HuanVae Chat Team

