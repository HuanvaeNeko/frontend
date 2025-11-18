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

### 认证相关

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新 Token
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/devices` - 查看登录设备
- `DELETE /api/auth/devices/:id` - 撤销设备

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
