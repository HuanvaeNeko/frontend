# HuanVae Chat - React 前端应用

基于 React + React Router + Vite + TypeScript 构建的聊天应用，包含 AI 聊天、群聊和音视频会议功能。

## 技术栈

- **React 18** - UI 框架
- **React Router 6** - 路由管理
- **Vite** - 构建工具
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **Zustand** - 状态管理
- **Font Awesome** - 图标库
- **Socket.io Client** - WebSocket 客户端（待对接后端）

## 功能特性

### 1. AI 聊天
- 与 AI 助手进行智能对话
- 支持自定义 API 配置
- 预览数据模式（等待后端对接）

### 2. 群聊
- 实时群组聊天
- 在线用户列表
- 连接/断开功能
- 预览数据模式（等待后端对接）

### 3. 音视频会议
- 多人视频会议
- 音频/视频开关控制
- 参与者列表
- 预览数据模式（等待后端对接）

### 4. API 配置
- 支持自定义 API 端点
- 本地存储配置
- 默认本地 API 服务

## 项目结构

```
frontend/
├── src/
│   ├── pages/          # 页面组件
│   │   ├── Home.tsx           # 首页
│   │   ├── AiChat.tsx         # AI 聊天
│   │   ├── GroupChat.tsx      # 群聊
│   │   ├── VideoMeeting.tsx   # 视频会议
│   │   └── Settings.tsx       # 设置页面
│   ├── store/           # 状态管理
│   │   └── apiConfig.ts       # API 配置存储
│   ├── types/          # TypeScript 类型定义
│   │   └── index.ts
│   ├── App.tsx         # 主应用组件
│   ├── main.tsx        # 入口文件
│   └── index.css       # 全局样式
├── index.html          # HTML 模板
├── vite.config.ts      # Vite 配置
├── tsconfig.json       # TypeScript 配置
├── tailwind.config.js  # Tailwind 配置
└── package.json        # 依赖配置
```

## 安装和运行

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

应用将在 `http://localhost:5173` 启动，并可通过 `http://0.0.0.0:5173` 从外部访问。

### 构建生产版本

```bash
pnpm build
```

### 预览生产构建

```bash
pnpm preview
```

## API 配置

### 默认配置

- **AI API URL**: `http://localhost:8000/api/chat`
- **WebSocket URL**: `http://localhost:3001`
- **使用自定义 API**: 关闭（使用默认本地服务）

### 自定义配置

1. 点击首页的"API 配置"按钮
2. 或进入设置页面 (`/settings`)
3. 开启"使用自定义 API"
4. 配置您的 API 端点和密钥
5. 保存配置

配置会自动保存到浏览器的 localStorage 中。

## 后端对接

### AI 聊天 API

**端点**: `POST /api/chat`

**请求格式**:
```json
{
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}
```

**响应格式**:
```json
{
  "message": "您好！有什么可以帮助您的吗？"
}
```

### WebSocket 连接

**连接地址**: `ws://localhost:3001`

**事件**:
- `connect` - 连接成功
- `message` - 接收消息
- `user_joined` - 用户加入
- `user_left` - 用户离开

## 预览数据

当前应用使用预览数据模式，所有功能都可以正常使用和测试。当后端服务就绪后，只需：

1. 配置正确的 API 端点
2. 确保 WebSocket 服务运行
3. 应用将自动切换到真实数据模式

## 开发说明

- 所有页面组件都包含预览数据，可以直接测试 UI 和交互
- API 配置存储在 localStorage，刷新页面后仍然保留
- 使用 Tailwind CSS 进行样式设计，支持响应式布局
- Font Awesome 图标已集成，可直接使用

## 待完成功能

- [ ] 对接真实 AI API
- [ ] 实现 WebSocket 实时通信
- [ ] 实现 WebRTC 音视频通话
- [ ] 用户认证系统
- [ ] 消息历史记录
- [ ] 文件上传功能