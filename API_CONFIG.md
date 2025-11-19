# API 配置说明

## 环境自动判断

系统会根据当前访问的域名自动判断使用哪个 API 地址：

- **开发环境**: `http://192.168.9.11:8080`
- **生产环境**: `https://api.huanvae.cn`

### 判断逻辑

1. 如果设置了环境变量 `VITE_AUTH_API_URL`，优先使用该值
2. 如果域名包含 `huanvae.cn`，使用生产环境地址
3. 其他情况使用开发环境地址

## 手动配置

如果需要手动指定 API 地址，可以在项目根目录创建 `.env` 文件：

```bash
VITE_AUTH_API_URL=http://192.168.9.11:8080
```

## API 端点

### 公开端点（无需认证）

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新 Token

### 需要认证的端点

- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/devices` - 查看登录设备
- `DELETE /api/auth/devices/:id` - 撤销设备

### 好友相关（需要认证）

- `POST /api/friends/requests` - 发送好友请求
- `POST /api/friends/requests/approve` - 同意好友请求
- `POST /api/friends/requests/reject` - 拒绝好友请求
- `POST /api/friends/remove` - 删除好友
- `GET /api/friends/requests/sent` - 查看已发送的请求
- `GET /api/friends/requests/pending` - 查看待处理的请求
- `GET /api/friends/` - 获取好友列表

## 请求格式说明

### 注册请求

```json
{
  "user_id": "user123",
  "nickname": "张三",
  "email": "zhangsan@example.com",
  "password": "password123"
}
```

**注意**：字段名使用下划线 `user_id`。

### 登录请求

```json
{
  "user_id": "user123",
  "password": "password123",
  "device_info": "Chrome 120 on Windows 11",
  "mac_address": "00:11:22:33:44:55"
}
```

### 登录响应

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

- `access_token` 有效期：15 分钟
- `refresh_token` 有效期：7 天

## 认证机制

### Token 使用

所有需要认证的请求都需要在 Header 中携带 Access Token：

```
Authorization: Bearer <access_token>
```

### 智能黑名单检查

- **正常情况**：跳过黑名单查询，性能最优
- **安全事件**（登出、删除设备）：启用 15 分钟黑名单检查
- **自动恢复**：15 分钟后自动关闭检查

### 多设备支持

- 每个设备独立的 Refresh Token
- 支持查看所有登录设备
- 支持远程撤销指定设备

### WebSocket

WebSocket URL 会根据 HTTP API 地址自动生成：
- HTTP → WS
- HTTPS → WSS
- 端口从 8080 自动转换为 3001

## 使用示例

```typescript
import { getApiBaseUrl, getAuthApiUrl } from './utils/apiConfig'

// 获取 API 基础地址
const baseUrl = getApiBaseUrl() // http://192.168.9.11:8080 或 https://api.huanvae.cn

// 获取认证 API 地址
const authUrl = getAuthApiUrl() // ${baseUrl}/api/auth
```
