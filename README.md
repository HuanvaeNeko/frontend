# Huanvae Chat - 即时通讯前端应用

> 基于 React + TypeScript + Vite 开发的现代化即时通讯应用

[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](https://tailwindcss.com/)

## 🌟 特性

- ✅ **统一聊天界面** - 三栏布局设计
- ✅ **好友系统** - 添加好友、好友列表、在线状态、输入状态
- ✅ **群聊系统** - 创建群聊、群管理、群公告、加群申请
- ✅ **实时通信** - WebSocket 自动连接、断线重连
- ✅ **视频通话** - WebRTC 房间创建和加入
- ✅ **文件管理** - 文件上传下载、预签名 URL
- ✅ **消息功能** - 分页加载、撤回、删除
- ✅ **动画效果** - Framer Motion 流畅过渡
- ✅ **类型安全** - 100% TypeScript 覆盖

## 🚀 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

### 访问应用

打开浏览器访问: http://localhost:5173

### 构建生产版本

```bash
pnpm build
```

## 📦 技术栈

| 类别 | 技术 |
|------|------|
| 核心框架 | React 18.3 + TypeScript 5.7 + Vite 7.2 |
| 状态管理 | Zustand（auth/chat/friends/groups/ws） |
| UI 组件 | shadcn/ui + Radix UI |
| 样式 | Tailwind CSS v4 |
| 动画 | Framer Motion |
| 图标 | Lucide React |
| 实时通信 | WebSocket + WebRTC |

## 📁 项目结构

```
src/
├── api/                    # API 接口层
│   ├── auth.ts            # 认证 API
│   ├── messages.ts        # 私聊消息 API
│   ├── groupMessages.ts   # 群消息 API
│   ├── friends.ts         # 好友 API
│   ├── groups.ts          # 群聊 API
│   ├── storage.ts         # 文件存储 API
│   └── webrtc.ts          # WebRTC API
├── components/            # 组件
│   ├── chat/             # 聊天相关组件
│   └── ui/               # UI 基础组件
├── pages/                # 页面
│   ├── ChatPage.tsx      # 统一聊天主界面
│   ├── Login.tsx         # 登录页
│   ├── Register.tsx      # 注册页
│   ├── VideoMeeting.tsx  # 视频会议页
│   └── ...
├── store/                # 状态管理
│   ├── authStore.ts      # 认证状态
│   ├── chatStore.ts      # 聊天状态
│   ├── friendsStore.ts   # 好友状态
│   ├── groupStore.ts     # 群聊状态
│   └── wsStore.ts        # WebSocket 状态
├── hooks/                # 自定义 Hooks
└── utils/                # 工具函数
```

## 💡 核心功能

### 统一聊天界面（ChatPage）

三栏布局设计：
- **左栏**: 功能切换（好友/群聊/文件/视频）
- **中栏**: 会话列表/好友列表/群聊列表
- **右栏**: 聊天窗口/WebRTC 面板

### 实时功能

- WebSocket 消息推送
- 好友在线状态显示
- 正在输入提示
- 消息撤回通知
- 群成员变动通知

## 🔧 配置

### API 地址配置

统一使用生产 API 地址，配置在 `src/lib/apiConfig.ts`:

```typescript
export const getApiBaseUrl = (): string => {
  // 如果设置了环境变量，优先使用
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  return 'https://api.huanvae.cn'
}
```

可通过环境变量 `NEXT_PUBLIC_API_URL` 覆盖。

## 📚 文档

- [文档索引](./docs/README.md)
- [开发路线图](./DEVELOPMENT_ROADMAP.md)
- [API 配置](./docs/API_CONFIG.md)
- [部署指南](./docs/DEPLOY.md)

## 🔗 相关链接

- **线上测试版**: https://web.huanvae.cn

## 📄 许可证

MIT License

---

**更新时间**: 2024-12-13  
**版本**: v1.0.0
