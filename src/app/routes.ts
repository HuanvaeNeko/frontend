import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  // ── BFF 资源路由（只有 loader/action，没有组件） ──
  // 具体路径排在 `api/*` 之前。RR 的路由排序本身也让静态段优先于 splat，
  // 但显式排序让下一个读这个文件的人不必去查 RR 的排序规则。
  route('api/auth/login', 'routes/api.auth.login.ts'),
  // 注册必须独立一条：它是**未登录**用户发起的，落进 `api/*` 会被要求会话 cookie
  route('api/auth/register', 'routes/api.auth.register.ts'),
  route('api/auth/logout', 'routes/api.auth.logout.ts'),
  route('api/session', 'routes/api.session.ts'),
  route('api/*', 'routes/api.$.ts'),
  // 四条透传前缀指向同一个模块，必须各给一个 id：RR 用 (file, id) 唯一标识路由，
  // 同一文件注册多次不给 id 会报重复定义。
  route('avatars/*', 'routes/passthrough.$.ts', { id: 'passthrough-avatars' }),
  route('user-file/*', 'routes/passthrough.$.ts', { id: 'passthrough-user-file' }),
  route('friends-file/*', 'routes/passthrough.$.ts', { id: 'passthrough-friends-file' }),
  route('apps/*', 'routes/passthrough.$.ts', { id: 'passthrough-apps' }),

  index('routes/home.tsx'),
  route('downloads', 'routes/downloads.tsx'),
  route('~offline', 'routes/offline.tsx'),

  route('app', 'routes/app-index.tsx'),

  layout('routes/auth-layout.tsx', [
    route('app/login', 'routes/login.tsx'),
    route('app/register', 'routes/register.tsx'),
  ]),

  layout('routes/protected-layout.tsx', [
    // 壳：spec §3 的三栏。本任务只挂 /app/chat*，后续任务逐条搬入
    layout('routes/app-shell.tsx', [
      route('app/chat', 'routes/shell/chat.tsx', [
        route(':conversationId', 'routes/shell/chat.$conversationId.tsx'),
      ]),
      route('app/contacts', 'routes/shell/contacts.tsx', [
        route('friends/:userId', 'routes/shell/contacts.friends.$userId.tsx'),
        route('groups/:groupId', 'routes/shell/contacts.groups.$groupId.tsx'),
      ]),
      route('app/settings', 'routes/shell/settings.tsx', [
        route(':section', 'routes/shell/settings.$section.tsx'),
      ]),
      // 带 URL 的模态框 + AI 助手整栏页（spec §3/§9）：列表栏保持最近的 chat/contacts tab
      route('app/profile', 'routes/shell/profile.tsx'),
      route('app/files', 'routes/shell/files.tsx'),
      route('app/meeting', 'routes/shell/meeting.tsx'),
      route('app/bots', 'routes/shell/bots.tsx'),
      route('app/miniapps', 'routes/shell/miniapps.tsx'),
      route('app/ai-chat', 'routes/shell/ai-chat.tsx'),
    ]),
    // 过渡期：还没搬进壳的旧页面（第 11 步整段删除）
    layout('routes/legacy-layout.tsx', [
      route('app/friends', 'routes/friends.tsx'),
      route('app/groups', 'routes/groups.tsx'),
      route('app/webrtc', 'routes/webrtc.tsx'),
    ]),
    route('app/video-meeting', 'routes/video-meeting.tsx'),
  ]),
] satisfies RouteConfig
