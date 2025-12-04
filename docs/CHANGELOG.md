# 更新日志

## [2024-11-19] - API 字段名称修复

### 修复

- **修复 API 字段名称不匹配问题**
  - 后端使用 `user-id`（连字符），前端之前使用 `user_id`（下划线）
  - 更新 `src/api/auth.ts` 中的登录和注册请求
  - 更新 `src/store/authStore.ts` 中的直接 API 调用
  - 确保所有请求字段名称与后端 API 文档一致

### 文档更新

- **更新 API_CONFIG.md**
  - 添加详细的请求格式说明
  - 添加好友相关 API 端点文档
  - 说明 Token 有效期和认证机制
  - 添加智能黑名单检查说明
  - 添加多设备支持说明

### 参考

- 后端 API 文档：https://github.com/HuanvaeNeko/Huanvae-Chat-Rust/blob/main/README.md

## [2024-11-19] - GitHub Pages 自动部署

### 新增

- **GitHub Actions 自动部署**
  - 配置自动构建和部署到 gh-pages 分支
  - 支持 main 和 dev 分支触发
  - 使用 pnpm 作为包管理器
  - 集成依赖缓存加速构建

- **部署配置**
  - 配置 Vite base 路径为 `/frontend/`
  - 添加 `.nojekyll` 文件支持 GitHub Pages
  - 修复 pnpm-workspace.yaml 配置

- **文档**
  - 创建 DEPLOY.md 详细部署指南
  - 说明 GitHub Pages 配置步骤
  - 提供常见问题解决方案

### 修复

- 修复 TypeScript 编译错误
  - 移除未使用的导入和变量
  - 确保通过所有类型检查

## 已实现功能

### 认证系统

- ✅ 用户注册/登录
- ✅ 双 Token 机制（Access Token + Refresh Token）
- ✅ Token 自动刷新
- ✅ 多设备登录管理
- ✅ 设备列表查看和撤销
- ✅ 智能黑名单检查

### 页面

- ✅ 登录页面
- ✅ 注册页面
- ✅ 首页导航
- ✅ 设备管理页面
- ✅ AI 聊天页面（UI）
- ✅ 群聊页面（UI）
- ✅ 视频会议页面（UI）
- ✅ 设置页面（UI）

### 基础设施

- ✅ React Router 路由管理
- ✅ Zustand 状态管理
- ✅ TypeScript 类型安全
- ✅ Tailwind CSS 样式
- ✅ FontAwesome 图标
- ✅ 响应式设计

## 待实现功能

### 好友系统

- [ ] 好友列表显示
- [ ] 发送好友请求
- [ ] 处理好友请求（同意/拒绝）
- [ ] 删除好友

### 实时通信

- [ ] WebSocket 连接管理
- [ ] 私聊功能
- [ ] 群聊功能
- [ ] 在线状态显示
- [ ] 消息已读/未读状态

### 视频会议

- [ ] WebRTC 集成
- [ ] 视频通话
- [ ] 音频通话
- [ ] 屏幕共享

### 其他

- [ ] 用户个人资料编辑
- [ ] 头像上传
- [ ] 消息历史记录
- [ ] 文件传输
- [ ] 表情包支持

## 技术栈

- **前端框架**: React 18.3
- **类型系统**: TypeScript 5.6
- **构建工具**: Vite 6.0
- **样式**: Tailwind CSS 3.4
- **状态管理**: Zustand 5.0
- **路由**: React Router 6.28
- **图标**: FontAwesome 7.1
- **包管理**: pnpm 9

## 后端

- **语言**: Rust 1.91
- **框架**: Axum 0.8
- **数据库**: PostgreSQL
- **认证**: JWT (RSA 签名)
- **密码**: bcrypt

## 部署

- **前端**: GitHub Pages
- **后端**: 自托管服务器
- **CI/CD**: GitHub Actions

