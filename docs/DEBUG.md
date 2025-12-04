# 调试指南

## 🔍 如何调试认证问题

### 1. 打开浏览器开发者工具

按 `F12` 或右键 → 检查，打开开发者工具的 **Console** 标签。

### 2. 查看详细日志

现在所有的认证请求都会输出详细的日志信息：

#### 登录日志示例

```
🔐 登录请求 URL: http://192.168.9.11:8080/api/auth/login
🔐 登录请求数据: {
  user-id: "testuser",
  password: "***",
  device_info: "Mozilla/5.0...",
  mac_address: "unknown"
}
🔐 登录响应状态: 200 OK
🔐 登录成功，Token 已获取
```

#### 注册日志示例

```
📝 注册请求 URL: http://192.168.9.11:8080/api/auth/register
📝 注册请求数据: {
  user-id: "testuser",
  nickname: "测试用户",
  email: "test@example.com",
  password: "***"
}
📝 注册响应状态: 200 OK
📝 注册成功，准备自动登录
```

### 3. 常见错误及解决方案

#### ❌ 登录失败 (401 Unauthorized)

**可能原因：**
- 用户不存在
- 密码错误

**日志示例：**
```
🔐 登录响应状态: 401 Unauthorized
🔐 登录失败响应: {"message":"Invalid credentials"}
❌ 登录错误: Error: Invalid credentials
```

**解决方法：**
- 检查用户ID和密码是否正确
- 确认用户已注册

#### ❌ 注册失败 (422 Unprocessable Entity)

**可能原因：**
- 密码强度不足（必须包含字母和数字）
- 邮箱格式错误
- 用户ID已存在

**日志示例：**
```
📝 注册响应状态: 422 Unprocessable Entity
📝 注册失败响应: {"message":"Password must contain letters and numbers"}
❌ 注册错误: Error: Password must contain letters and numbers
```

**解决方法：**
- 密码必须至少8位，包含字母和数字
- 使用有效的邮箱格式
- 更换不同的用户ID

#### ❌ 网络错误 (Failed to fetch)

**日志示例：**
```
❌ 登录错误: TypeError: Failed to fetch
```

**可能原因：**
- 后端服务未运行
- API 地址配置错误
- 网络连接问题
- CORS 问题

**解决方法：**
1. 检查后端服务是否运行：
   ```bash
   curl http://192.168.9.11:8080/api/auth/login
   ```

2. 检查 API 配置：
   - 开发环境：`http://192.168.9.11:8080`
   - 生产环境：`https://api.huanvae.cn`

3. 确认 CORS 配置允许前端域名访问

#### ❌ 登录失败 (空白错误)

**日志示例：**
```
🔐 登录响应状态: 500 Internal Server Error
🔐 登录失败响应: 
❌ 登录错误: Error: 登录失败 (500: Internal Server Error)
```

**可能原因：**
- 后端服务内部错误
- 数据库连接问题

**解决方法：**
- 检查后端服务日志
- 确认数据库连接正常
- 检查后端环境变量配置

## 🌐 检查 API 配置

### 当前 API 地址

在浏览器控制台运行：

```javascript
// 检查当前使用的 API 地址
console.log('API Base URL:', localStorage.getItem('api-base-url') || '自动检测')
console.log('当前域名:', window.location.hostname)
```

### 环境判断逻辑

- 域名包含 `huanvae.cn` → 生产环境 `https://api.huanvae.cn`
- 其他 → 开发环境 `http://192.168.9.11:8080`

### 手动设置 API 地址（仅开发）

如果需要临时更改 API 地址：

```javascript
// 在浏览器控制台运行
localStorage.setItem('api-override', 'http://localhost:8080')
location.reload()
```

恢复自动检测：

```javascript
localStorage.removeItem('api-override')
location.reload()
```

## 🔐 检查认证状态

在浏览器控制台运行：

```javascript
// 查看当前认证状态
const authState = JSON.parse(localStorage.getItem('auth-storage') || '{}')
console.log('认证状态:', {
  isAuthenticated: authState.state?.isAuthenticated,
  hasAccessToken: !!authState.state?.accessToken,
  hasRefreshToken: !!authState.state?.refreshToken,
  tokenExpiry: authState.state?.tokenExpiry 
    ? new Date(authState.state.tokenExpiry).toLocaleString() 
    : null
})
```

清除认证信息：

```javascript
localStorage.removeItem('auth-storage')
location.reload()
```

## 📊 网络请求监控

### 使用 Network 标签

1. 打开开发者工具的 **Network** 标签
2. 尝试登录/注册
3. 查找 `login` 或 `register` 请求
4. 点击请求查看：
   - **Headers** - 请求头和响应头
   - **Payload** - 发送的数据
   - **Response** - 服务器响应

### 关键检查点

#### Request Headers
```
Content-Type: application/json
Authorization: Bearer eyJ... (仅需要认证的请求)
```

#### Request Payload
```json
{
  "user_id": "testuser",  // ✅ 注意是下划线
  "password": "Test1234"
}
```

#### Response
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

## 🛠️ 常用调试命令

### 测试 API 连接

```bash
# 测试注册
curl -X POST http://192.168.9.11:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "testuser123",
    "nickname": "测试用户",
    "email": "test@example.com",
    "password": "Test1234"
  }'

# 测试登录
curl -X POST http://192.168.9.11:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "testuser123",
    "password": "Test1234",
    "device_info": "curl",
    "mac_address": "00:00:00:00:00:00"
  }'
```

## 📱 移动端调试

### iOS Safari
1. 设置 → Safari → 高级 → 网页检查器
2. 连接 Mac，使用 Safari 的开发菜单

### Android Chrome
1. 开启 USB 调试
2. Chrome 访问 `chrome://inspect`
3. 选择设备查看控制台

## 🔄 问题持续存在？

如果问题仍未解决，请提供以下信息：

1. **完整的控制台日志**（包含 emoji 标记的日志）
2. **Network 标签中的请求详情**
3. **当前环境**：
   - 浏览器版本
   - 操作系统
   - 访问的 URL
   - 后端服务地址
4. **重现步骤**

## 📚 相关文档

- [API 配置说明](./API_CONFIG.md)
- [更新日志](./CHANGELOG.md)
- [部署指南](./DEPLOY.md)
- [后端 API 文档](https://github.com/HuanvaeNeko/Huanvae-Chat-Rust/blob/main/README.md)

