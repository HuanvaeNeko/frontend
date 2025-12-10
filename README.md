# HuanVae Chat - 即时通讯前端应用

> 基于 React + TypeScript + Vite 开发的现代化即时通讯应用

[![React](https://img.shields.io/badge/React-18.3-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC.svg)](https://tailwindcss.com/)

## 🌟 特性

- ✅ **统一聊天界面** - 三栏布局，类似线上版 https://web.huanvae.cn
- ✅ **好友系统** - 添加好友、好友列表、好友请求管理
- ✅ **群聊系统** - 创建群聊、群消息、群成员管理
- ✅ **实时通信** - WebSocket 自动连接、断线重连
- ✅ **视频通话** - WebRTC 房间创建和加入
- ✅ **文件管理** - 文件上传下载（开发中）
- ✅ **消息分页** - 时间戳分页加载历史消息
- ✅ **动画效果** - Framer Motion 流畅过渡
- ✅ **类型安全** - 100% TypeScript 覆盖

## 🚀 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev --port 5173
```

### 访问应用

打开浏览器访问: http://localhost:5173

### 构建生产版本

```bash
pnpm build
```

## 📦 技术栈

### 核心框架
- **React 18.3** - 用户界面库
- **TypeScript 5.7** - 类型安全
- **Vite 7.2** - 极速构建工具

### 状态管理
- **Zustand** - 轻量级状态管理
- 分离式 Store 设计（auth/chat/friends/groups/ws）

### UI 组件
- **shadcn/ui** - 可定制组件库
- **Tailwind CSS v4** - 原子化 CSS
- **Lucide React** - 图标库
- **Framer Motion** - 动画库

### 路由和工具
- **React Router 6** - 客户端路由
- **Fetch API** - HTTP 请求
- **WebSocket** - 实时通信
- **WebRTC** - 音视频通话

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
│   │   ├── ChatWindow.tsx      # 聊天窗口
│   │   ├── FriendList.tsx      # 好友列表
│   │   ├── GroupList.tsx       # 群聊列表
│   │   ├── FileManager.tsx     # 文件管理
│   │   └── WebRTCPanel.tsx     # WebRTC 面板
│   └── ui/               # UI 基础组件
├── pages/                # 页面
│   ├── ChatPage.tsx      # 统一聊天主界面 ⭐
│   ├── Login.tsx         # 登录页
│   ├── Register.tsx      # 注册页
│   └── Home.tsx          # 首页（卡片式）
├── store/                # 状态管理
│   ├── authStore.ts      # 认证状态
│   ├── chatStore.ts      # 聊天状态
│   ├── friendsStore.ts   # 好友状态
│   ├── groupStore.ts     # 群聊状态
│   └── wsStore.ts        # WebSocket 状态
├── hooks/                # 自定义 Hooks
│   └── use-toast.ts      # Toast 通知
├── utils/                # 工具函数
│   └── apiConfig.ts      # API 配置
└── types/                # 类型定义
    └── index.ts          # 全局类型
```

## 💡 核心功能

### 1. 统一聊天界面（ChatPage）

三栏布局设计：

- **左栏**: 功能切换（好友 💬 / 群聊 👥 / 文件 📁 / 视频 🎥）
- **中栏**: 会话列表 / 好友列表 / 群聊列表 / 文件列表
- **右栏**: 聊天窗口 / WebRTC 面板

### 2. 好友系统

- 好友列表展示（头像、昵称、签名）
- 添加好友（输入用户ID、验证消息）
- 新朋友（待处理的好友请求）
- 已发送（我发送的好友请求状态）
- 同意/拒绝好友请求
- 搜索好友

### 3. 群聊系统

- 我的群聊列表
- 创建群聊（群名称、群描述、加群方式）
- 群消息发送和接收
- 未读消息徽章
- 最后消息预览
- 搜索群聊

### 4. 聊天功能

- 私聊和群聊消息
- 消息分页加载（时间戳）
- 消息气泡样式
- 发送文本消息
- Enter 发送，Shift+Enter 换行
- 自动滚动到最新消息
- 加载状态显示

### 5. WebSocket 实时通信

- 登录后自动连接
- 断线自动重连（5秒后）
- 消息处理器注册机制
- 实时接收新消息
- 好友请求通知
- 群邀请通知
- 连接状态显示

### 6. WebRTC 视频通话

- 创建房间（房间名称、密码、最大人数、有效期）
- 加入房间（房间号、密码、昵称）
- 房间信息展示
- 分享链接生成
- 一键复制功能

## 📖 使用指南

### 登录注册

1. 访问应用首页
2. 点击"注册"创建新账号
3. 或使用现有账号登录

### 添加好友

1. 点击左侧"好友"图标
2. 点击"添加好友"按钮
3. 输入对方用户ID和验证消息
4. 等待对方同意

### 开始聊天

1. 在好友列表中点击好友
2. 在右侧聊天窗口输入消息
3. 按 Enter 或点击发送按钮

### 创建群聊

1. 点击左侧"群聊"图标
2. 点击"创建群聊"按钮
3. 填写群名称和群描述
4. 选择加群方式
5. 创建成功

### 视频通话

1. 点击左侧"视频"图标
2. 点击"创建房间"
3. 填写房间信息（可选）
4. 分享房间号和密码给朋友
5. 朋友使用"加入房间"功能

## 🔧 配置

### API 地址配置

编辑 `src/utils/apiConfig.ts`:

```typescript
export const getApiBaseUrl = (): string => {
  // 开发环境
  if (import.meta.env.DEV) {
    return 'http://localhost:8080'  // 修改为你的后端地址
  }
  // 生产环境
  return 'https://api.huanvae.cn'
}
```

### 环境变量

创建 `.env` 文件：

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_URL=ws://localhost:8080/ws
```

## 📚 文档

- [快速启动指南](./QUICKSTART.md) - 详细的使用说明
- [开发路线图](./DEVELOPMENT_ROADMAP.md) - 功能规划和优先级
- [实现完成文档](./CHAT_IMPLEMENTATION_COMPLETE.md) - 技术实现细节
- [项目总结](./IMPLEMENTATION_SUMMARY.md) - 开发总结和统计

## 🎯 开发状态

### ✅ 已完成（v1.0）
- [x] 统一聊天界面三栏布局
- [x] 好友系统完整功能
- [x] 群聊系统基础功能
- [x] 私聊和群聊消息
- [x] WebSocket 实时通信
- [x] WebRTC 房间管理
- [x] Toast 通知系统

### 🚧 开发中
- [ ] 文件上传和下载（分片上传）
- [ ] WebRTC 视频通话界面
- [ ] 图片/视频消息预览
- [ ] 群成员管理
- [ ] 群公告功能

### 📅 计划中
- [ ] 消息撤回和删除
- [ ] @成员功能
- [ ] 表情选择器
- [ ] 桌面通知
- [ ] 消息搜索
- [ ] 虚拟滚动优化

## 📊 代码统计

- **新增代码**: 2,684 行
- **核心文件**: 10 个组件和 Store
- **文档**: 4 个 Markdown 文档
- **完成度**: 约 60% 功能对标线上版

## 🔗 相关链接

- **线上测试版**: https://web.huanvae.cn
- **后端仓库**: (待添加)
- **API 文档**: (待添加)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**开发时间**: 2024-12-11  
**版本**: v1.0.0  
**状态**: ✅ 核心功能完成，持续开发中

**参考**: https://web.huanvae.cn
