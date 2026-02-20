export const ROUTES = {
  root: '/',
  auth: {
    login: '/login',
    register: '/register',
  },
  app: {
    home: '/home',
    chat: '/chat',
    chatFriends: '/chat/friends',
    chatGroups: '/chat/groups',
    chatFiles: '/chat/files',
    chatWebrtc: '/chat/webrtc',
    friends: '/friends',
    aiChat: '/ai-chat',
    videoMeeting: '/video-meeting',
    devices: '/devices',
    settings: '/settings',
    profile: '/profile',
  },
  legacy: {
    groupChat: '/group-chat',
  },
} as const

export type ChatTabRouteKey = 'friends' | 'groups' | 'files' | 'webrtc'

export const DEFAULT_AUTHENTICATED_ROUTE = ROUTES.app.chat
export const DEFAULT_UNAUTHENTICATED_ROUTE = ROUTES.auth.login

export const CHAT_TAB_ROUTE_MAP: Record<ChatTabRouteKey, string> = {
  friends: ROUTES.app.chatFriends,
  groups: ROUTES.app.chatGroups,
  files: ROUTES.app.chatFiles,
  webrtc: ROUTES.app.chatWebrtc,
}

export function getChatTabFromPath(pathname: string): ChatTabRouteKey {
  if (pathname.startsWith(ROUTES.app.chatGroups)) return 'groups'
  if (pathname.startsWith(ROUTES.app.chatFiles)) return 'files'
  if (pathname.startsWith(ROUTES.app.chatWebrtc)) return 'webrtc'
  return 'friends'
}

export function isRouteActive(pathname: string | null, targetPath: string): boolean {
  if (!pathname) return false
  if (targetPath === ROUTES.app.chat) {
    return pathname === ROUTES.app.chat || pathname.startsWith(`${ROUTES.app.chat}/`)
  }
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`)
}

const SEGMENT_LABELS: Record<string, string> = {
  chat: '消息',
  friends: '好友',
  'ai-chat': 'AI 助手',
  'video-meeting': '视频会议',
  devices: '设备管理',
  settings: '设置',
  profile: '个人资料',
  home: '首页',
  groups: '群聊',
  files: '文件',
  webrtc: '音视频',
}

export function getRouteBreadcrumbs(pathname: string | null): Array<{ label: string; path: string }> {
  const crumbs: Array<{ label: string; path: string }> = [
    { label: '首页', path: ROUTES.app.chat },
  ]

  if (!pathname || pathname === ROUTES.root || pathname === ROUTES.app.chat) {
    return crumbs
  }

  const segments = pathname.split('/').filter(Boolean)
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`
    const label = SEGMENT_LABELS[segment]
    if (!label) continue

    if (currentPath === ROUTES.app.chat) {
      crumbs.push({ label: '消息', path: currentPath })
      continue
    }

    crumbs.push({ label, path: currentPath })
  }

  // 避免 /chat 时首页和消息重复
  return crumbs.filter((crumb, index, arr) => {
    if (index === 0) return true
    const prev = arr[index - 1]
    return !(prev.path === crumb.path && prev.label === crumb.label)
  })
}
