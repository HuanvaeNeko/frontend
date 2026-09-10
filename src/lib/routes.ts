export const ROUTES = {
  root: '/',
  webAppRoot: '/app',
  downloads: '/downloads',
  auth: {
    login: '/app/login',
    register: '/app/register',
  },
  app: {
    chat: '/app/chat',
    contacts: '/app/contacts',
    settings: '/app/settings',
    profile: '/app/profile',
    files: '/app/files',
    meeting: '/app/meeting',
    bots: '/app/bots',
    miniapps: '/app/miniapps',
    aiChat: '/app/ai-chat',
    videoMeeting: '/app/video-meeting',
    /** @deprecated 壳迁移（第 11 步删除）：旧分页路由，只剩重定向在用 */
    chatFriends: '/app/friends',
    /** @deprecated 同上 */
    chatGroups: '/app/groups',
    /** @deprecated 同上 */
    chatFiles: '/app/files',
    /** @deprecated 同上 */
    chatWebrtc: '/app/webrtc',
    /** @deprecated 同上 */
    friends: '/app/friends',
    /** @deprecated 同上：设备管理并入 /app/settings/account */
    devices: '/app/devices',
  },
  legacy: {
    groupChat: '/app/group-chat',
  },
} as const

export type ChatTabRouteKey = 'friends' | 'groups' | 'files' | 'webrtc'

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
  app: '应用',
  chat: '消息',
  friends: '好友',
  'ai-chat': 'AI 助手',
  'video-meeting': '视频会议',
  devices: '设备管理',
  settings: '设置',
  profile: '个人资料',
  groups: '群聊',
  files: '文件',
  webrtc: '音视频',
}

type BreadcrumbLabelResolver = (segment: string, path: string) => string

export function getRouteBreadcrumbs(
  pathname: string | null,
  resolveLabel?: BreadcrumbLabelResolver
): Array<{ label: string; path: string }> {
  const getLabel: BreadcrumbLabelResolver = resolveLabel || ((segment) => SEGMENT_LABELS[segment] || segment)
  const crumbs: Array<{ label: string; path: string }> = [
    { label: getLabel('chat', ROUTES.app.chat), path: ROUTES.app.chat },
  ]

  if (!pathname || pathname === ROUTES.root || pathname === ROUTES.app.chat) {
    return crumbs
  }

  const segments = pathname.split('/').filter(Boolean)
  let currentPath = ''

  for (const segment of segments) {
    currentPath += `/${segment}`
    if (currentPath === ROUTES.webAppRoot) continue
    const label = getLabel(segment, currentPath)
    if (!label) continue

    if (currentPath === ROUTES.app.chat) {
      crumbs.push({ label: getLabel('chat', currentPath), path: currentPath })
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

export const SETTINGS_SECTIONS = ['appearance', 'notifications', 'account', 'ai', 'about'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

export const chatPath = (conversationId: string): string => `${ROUTES.app.chat}/${conversationId}`
export const contactFriendPath = (userId: string): string => `${ROUTES.app.contacts}/friends/${encodeURIComponent(userId)}`
export const contactGroupPath = (groupId: string): string => `${ROUTES.app.contacts}/groups/${encodeURIComponent(groupId)}`
export const settingsPath = (section: SettingsSection): string => `${ROUTES.app.settings}/${section}`

/**
 * 旧 URL → 新 URL（spec §3）。第 11 步的 `legacy-redirect.tsx` 路由模块按这张表 `redirect()`；
 * `/app/profile` 不在表里：URL 不变，只是语义从整页变成壳上的模态框。
 */
export const LEGACY_REDIRECTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['/app/friends', ROUTES.app.contacts],
  ['/app/groups', ROUTES.app.contacts],
  ['/app/webrtc', ROUTES.app.meeting],
  ['/app/devices', `${ROUTES.app.settings}/account`],
  [ROUTES.legacy.groupChat, ROUTES.app.chat],
]

export function legacyRedirectTarget(pathname: string): string | null {
  const hit = LEGACY_REDIRECTS.find(([from]) => pathname === from || pathname.startsWith(`${from}/`))
  return hit ? hit[1] : null
}

export const DEFAULT_AUTHENTICATED_ROUTE = ROUTES.app.chat
export const DEFAULT_UNAUTHENTICATED_ROUTE = ROUTES.auth.login
