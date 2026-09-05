# Huanvae Chat - 即时通讯前端应用

> 基于 React Router + Vite + TypeScript 开发的现代化即时通讯应用

[![React Router](https://img.shields.io/badge/React_Router-8.3-CA4245.svg)](https://reactrouter.com/)
[![React](https://img.shields.io/badge/React-19.2-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vite.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.3-000000.svg)](https://bun.sh/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](https://tailwindcss.com/)

## 🌟 特性

- ✅ **统一聊天界面** - 三栏布局设计（移动端自适应单栏）
- ✅ **好友系统** - 添加好友、好友列表、在线状态、输入状态
- ✅ **群聊系统** - 创建群聊、群管理、群公告、加群申请
- ✅ **实时通信** - WebSocket 自动连接、断线重连
- ✅ **视频通话** - WebRTC 房间创建和加入
- ✅ **文件管理** - 文件上传下载、预签名 URL
- ✅ **消息功能** - 分页加载、撤回、删除
- ✅ **动画效果** - Framer Motion 流畅过渡
- ✅ **类型安全** - 100% TypeScript 覆盖
- ✅ **移动端适配** - 响应式设计，底部 Tab 导航

## 🚀 快速开始

### 安装依赖

```bash
bun install
```

### 启动开发服务器

```bash
bun run dev
```

> 使用 Vite 8 构建，启动速度极快 ⚡

### 访问应用

打开浏览器访问: http://localhost:3000

### 构建生产版本

```bash
bun run build
```

### 启动生产服务器

```bash
bun run start
```

> 生产环境用 Docker Compose 部署，见 [部署指南](./docs/DEPLOY.md)。

## 📦 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React Router 8（Framework Mode） |
| 构建 | Vite 8 |
| 运行时 / 包管理 | Bun |
| 核心 | React 19 + TypeScript 5.9 |
| 状态管理 | Zustand（auth/chat/friends/groups/ws） |
| UI 组件 | shadcn/ui + Radix UI |
| 样式 | Tailwind CSS v4 |
| 动画 | Framer Motion |
| 图标 | Lucide React |
| 实时通信 | WebSocket + WebRTC |
| Lint / 单测 | Biome + Vitest |
| PWA | vite-plugin-pwa |

## 📁 项目结构

```
├── src/
│   ├── app/                  # React Router 8（config-based routing）
│   │   ├── routes.ts        # 路由配置表
│   │   ├── routes/          # 路由模块（login/register/chat/profile/settings/...）
│   │   ├── root.tsx         # 根布局 + ErrorBoundary
│   │   ├── entry.client.tsx # 客户端 hydration 入口
│   │   ├── entry.server.tsx # SSR 入口
│   │   └── sw.ts            # Service Worker 源码（vite-plugin-pwa injectManifest）
│   ├── api/                 # API 接口层
│   │   ├── auth.ts          # 认证 API
│   │   ├── messages.ts      # 私聊消息 API
│   │   ├── groupMessages.ts # 群消息 API
│   │   ├── friends.ts       # 好友 API
│   │   ├── groups.ts        # 群聊 API
│   │   ├── storage.ts       # 文件存储 API
│   │   └── webrtc.ts        # WebRTC API
│   ├── components/          # 组件
│   │   ├── chat/            # 聊天相关组件
│   │   ├── layout/          # 布局组件
│   │   └── ui/              # UI 基础组件
│   ├── views/               # 页面视图组件
│   │   ├── ChatPage.tsx     # 统一聊天主界面
│   │   ├── LoginView.tsx    # 登录视图
│   │   └── ...
│   ├── store/               # 状态管理
│   │   ├── authStore.ts     # 认证状态
│   │   ├── chatStore.ts     # 聊天状态
│   │   ├── friendsStore.ts  # 好友状态
│   │   ├── groupStore.ts    # 群聊状态
│   │   └── wsStore.ts       # WebSocket 状态
│   ├── hooks/               # 自定义 Hooks
│   ├── lib/                 # 工具库
│   ├── styles/              # 全局样式
│   └── types/               # TypeScript 类型
├── public/                  # 静态资源
├── server/                  # 生产服务（Bun.serve，安全响应头/尾斜杠重定向/静态资源缓存）
├── vite.config.ts           # Vite 配置（含 Tailwind v4 插件、PWA）
├── react-router.config.ts   # React Router 配置
└── tsconfig.json            # TypeScript 配置
```

## 💡 核心功能

### 统一聊天界面（ChatPage）

**桌面端**：三栏布局设计
- **左栏**: 功能切换（好友/群聊/文件/视频）
- **中栏**: 会话列表/好友列表/群聊列表
- **右栏**: 聊天窗口/WebRTC 面板

**移动端**：单栏布局 + 底部导航
- 会话列表视图 ↔ 聊天视图 切换
- 底部 Tab 导航栏

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
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  return 'https://api.huanvae.cn'
}
```

### 环境变量

```bash
# .env
VITE_API_URL=https://api.huanvae.cn
VITE_WS_URL=wss://api.huanvae.cn
```

> `VITE_*` 在构建时被内联进产物：改这些值必须 `bun run build` 重新构建（生产环境即重建 Docker 镜像），重启容器不会生效。

## 🚀 部署

### Docker Compose（VPS，推荐）

生产环境跑在自建 VPS 上：`app`（Bun 生产服务）+ `cloudflared`（Cloudflare Tunnel）两个容器，不对公网开放 80/443，全部流量经隧道进出。

```bash
docker compose up -d --build
```

详见 [部署指南](./docs/DEPLOY.md)。

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

**更新时间**: 2026-09-05  
**版本**: v1.0.1
