# 🚀 HuanVae Chat 快速启动指南

## 最新更新 (2024-12-11)

✅ **统一聊天界面已完成！** 参考线上版本 https://web.huanvae.cn/ 开发。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

确保后端 API 地址正确配置在 `src/utils/apiConfig.ts`:

```typescript
export const getApiBaseUrl = (): string => {
  // 开发环境
  if (import.meta.env.DEV) {
    return 'http://localhost:8080'  // 修改为你的后端地址
  }
  // 生产环境
  return 'https://api.huanvae.cn'   // 修改为你的生产 API 地址
}
```

### 3. 启动开发服务器

```bash
pnpm dev --port 5173
```

### 4. 访问应用

打开浏览器访问: http://localhost:5173

## 功能导航

### 登录/注册
- 访问首页会自动跳转到登录页面
- 注册新账号或使用现有账号登录

### 统一聊天界面（主界面）
登录后会看到三栏布局：

#### 左侧功能栏
- 💬 **好友** - 好友聊天
- 👥 **群聊** - 群组聊天
- 📁 **文件** - 文件管理
- 🎥 **视频** - WebRTC 视频通话

#### 中间列表区
根据左侧选择的功能，显示不同内容：

**好友标签**:
- 好友列表 - 所有好友
- 新朋友 - 待处理的好友请求
- 已发送 - 我发送的好友请求

**群聊标签**:
- 我的群聊 - 已加入的群聊
- 群邀请 - 收到的群邀请（待实现）

**文件标签**:
- 我的文件 - 已上传的文件（待实现）
- 上传文件 - 上传新文件

**视频标签**:
- 显示 WebRTC 功能介绍和操作

#### 右侧主内容区
- 聊天窗口 - 与好友或群聊的对话
- WebRTC 面板 - 创建或加入视频房间

## 核心功能使用

### 添加好友
1. 点击左侧"好友"图标
2. 点击中间区域"添加好友"按钮
3. 输入对方用户ID和验证消息
4. 点击"发送请求"

### 处理好友请求
1. 点击"新朋友"标签
2. 查看收到的好友请求
3. 点击"同意"或"拒绝"

### 开始聊天
1. 在好友列表中点击好友
2. 在右侧聊天窗口输入消息
3. 点击发送或按 Enter 键

### 创建群聊
1. 点击左侧"群聊"图标
2. 点击"创建群聊"按钮
3. 填写群名称、群描述
4. 选择加群方式
5. 点击"创建"

### 群聊天
1. 在我的群聊列表中点击群组
2. 在聊天窗口发送消息
3. 群消息会显示发送者昵称

### WebRTC 视频通话

#### 创建房间
1. 点击左侧"视频"图标
2. 点击"创建房间"
3. 填写房间信息（可选）
4. 点击"创建房间"
5. 复制房间号和密码分享给朋友

#### 加入房间
1. 点击"加入房间"
2. 输入房间号和密码
3. 输入你的昵称（可选）
4. 点击"加入房间"

## 技术架构

### 前端技术栈
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 7
- **路由**: React Router 6
- **状态管理**: Zustand
- **UI 组件**: shadcn/ui
- **样式**: Tailwind CSS v4
- **动画**: Framer Motion
- **图标**: Lucide React
- **HTTP**: Fetch API
- **WebSocket**: 原生 WebSocket
- **WebRTC**: 原生 WebRTC API

### 项目结构
```
src/
├── api/              # API 接口层
│   ├── auth.ts       # 认证 API
│   ├── messages.ts   # 私聊消息 API
│   ├── groupMessages.ts  # 群消息 API
│   ├── friends.ts    # 好友 API
│   ├── groups.ts     # 群聊 API
│   ├── storage.ts    # 文件存储 API
│   └── webrtc.ts     # WebRTC API
├── components/       # 组件
│   ├── chat/         # 聊天相关组件
│   │   ├── ChatWindow.tsx      # 聊天窗口
│   │   ├── FriendList.tsx      # 好友列表
│   │   ├── GroupList.tsx       # 群聊列表
│   │   ├── FileManager.tsx     # 文件管理
│   │   └── WebRTCPanel.tsx     # WebRTC 面板
│   └── ui/           # UI 基础组件
├── pages/            # 页面
│   ├── ChatPage.tsx  # 统一聊天主页面 ⭐
│   ├── Login.tsx     # 登录页
│   └── Register.tsx  # 注册页
├── store/            # 状态管理
│   ├── authStore.ts  # 认证状态
│   ├── chatStore.ts  # 聊天状态
│   ├── friendsStore.ts  # 好友状态
│   ├── groupStore.ts    # 群聊状态
│   └── wsStore.ts       # WebSocket 状态
├── hooks/            # 自定义 Hooks
│   └── use-toast.ts  # Toast 通知
└── utils/            # 工具函数
    └── apiConfig.ts  # API 配置
```

### 状态管理
使用 Zustand 管理不同领域的状态：

- **authStore** - 用户认证、Token 管理
- **chatStore** - 聊天会话、消息列表
- **friendsStore** - 好友列表、好友请求
- **groupStore** - 群聊列表、群成员
- **wsStore** - WebSocket 连接、消息推送

### API 调用
所有 API 调用都使用统一的 `fetchWithAuth` 函数：
- 自动添加认证 Token
- Token 过期自动刷新
- 401 错误自动重试
- 统一错误处理

### WebSocket 通信
- 登录后自动连接 WebSocket
- 断线自动重连（5秒后）
- 支持消息处理器注册
- 实时接收新消息、好友请求、群邀请

## 开发指南

### 添加新的 API
1. 在 `src/api/` 目录创建新文件
2. 定义类型接口
3. 使用 `fetchWithAuth` 封装请求
4. 导出 API 对象

### 添加新的页面
1. 在 `src/pages/` 创建组件
2. 在 `src/App.tsx` 添加路由
3. 使用 `<ProtectedRoute>` 保护需要登录的页面

### 添加新的状态
1. 在 `src/store/` 创建 Store
2. 使用 Zustand 的 `create` 函数
3. 定义状态接口和 Actions
4. 在组件中使用 Hook

### 样式开发
- 优先使用 Tailwind CSS 工具类
- 复杂组件使用 shadcn/ui
- 自定义样式写在组件内
- 全局样式写在 `src/index.css`

## 常见问题

### Q: WebSocket 连接失败
A: 检查后端 WebSocket 端点是否正确，默认为 `/ws/messages?token={token}`

### Q: Token 过期怎么办
A: 系统会自动刷新 Token，如果刷新失败会跳转到登录页

### Q: 消息发送失败
A: 检查网络连接和后端 API 是否正常

### Q: 文件上传功能在哪
A: 文件上传功能框架已完成，需要连接后端分片上传 API

### Q: WebRTC 视频画面在哪
A: 目前只完成房间创建和加入，视频流处理需要独立页面（下一阶段开发）

## 下一步开发

### 优先级 P0（必须完成）
- [ ] WebSocket 消息实时处理和显示
- [ ] 文件上传完整实现（分片上传）
- [ ] WebRTC 视频通话界面

### 优先级 P1（重要功能）
- [ ] 群成员管理（邀请、移除、权限）
- [ ] 群公告功能
- [ ] 图片/视频消息预览
- [ ] 消息撤回功能

### 优先级 P2（体验优化）
- [ ] 桌面通知
- [ ] 表情选择器
- [ ] @成员功能
- [ ] 消息搜索

### 优先级 P3（性能优化）
- [ ] 消息虚拟滚动
- [ ] 图片懒加载
- [ ] 代码分割

## 部署

### 构建生产版本
```bash
pnpm build
```

### 预览构建结果
```bash
pnpm preview
```

### 部署到服务器
将 `dist/` 目录上传到服务器，配置 Nginx 或其他 Web 服务器。

示例 Nginx 配置：
```nginx
server {
    listen 80;
    server_name chat.huanvae.cn;
    root /var/www/huanvae-frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket 代理
    location /ws/ {
        proxy_pass http://backend:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 相关文档

- [API 集成完整文档](./API_INTEGRATION_COMPLETE.md)
- [聊天界面实现文档](./CHAT_IMPLEMENTATION_COMPLETE.md)
- [开发路线图](./DEVELOPMENT_ROADMAP.md)
- [shadcn/ui 文档](https://ui.shadcn.com)
- [Tailwind CSS 文档](https://tailwindcss.com)
- [Zustand 文档](https://docs.pmnd.rs/zustand)

## 联系和支持

- 线上测试版: https://web.huanvae.cn
- GitHub: (待添加)
- 问题反馈: (待添加)

---

**最后更新**: 2024-12-11  
**版本**: v1.0.0  
**状态**: ✅ 核心功能已完成，持续开发中
