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
    oauthAuthorize: '/app/oauth/authorize',
  },
} as const

export const SETTINGS_SECTIONS = ['appearance', 'notifications', 'account', 'apps', 'ai', 'about'] as const
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
  ['/app/group-chat', ROUTES.app.chat],
]

export function legacyRedirectTarget(pathname: string): string | null {
  const hit = LEGACY_REDIRECTS.find(([from]) => pathname === from || pathname.startsWith(`${from}/`))
  return hit ? hit[1] : null
}

export const DEFAULT_AUTHENTICATED_ROUTE = ROUTES.app.chat
export const DEFAULT_UNAUTHENTICATED_ROUTE = ROUTES.auth.login
