import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTHENTICATED_ROUTE, LEGACY_REDIRECTS, ROUTES, SETTINGS_SECTIONS,
  chatPath, contactFriendPath, contactGroupPath, isSettingsSection, legacyRedirectTarget, settingsPath,
} from '../routes'

describe('壳的路由表（spec §3）', () => {
  it('路径助手拼出的是字面量 URL', () => {
    expect(chatPath('f-alice')).toBe('/app/chat/f-alice')
    expect(contactFriendPath('alice')).toBe('/app/contacts/friends/alice')
    expect(contactGroupPath('g1')).toBe('/app/contacts/groups/g1')
    expect(settingsPath('account')).toBe('/app/settings/account')
    expect(DEFAULT_AUTHENTICATED_ROUTE).toBe('/app/chat')
    expect(ROUTES.app.meeting).toBe('/app/meeting')
  })

  it('设置分区只有六个，且能做类型守卫', () => {
    expect([...SETTINGS_SECTIONS]).toEqual(['appearance', 'notifications', 'account', 'apps', 'ai', 'about'])
    expect(isSettingsSection('account')).toBe(true)
    expect(isSettingsSection('apps')).toBe(true)
    expect(isSettingsSection('devices')).toBe(false)
  })

  it('旧 URL 逐条映射到新 URL；不在表里的返回 null', () => {
    expect(legacyRedirectTarget('/app/friends')).toBe('/app/contacts')
    expect(legacyRedirectTarget('/app/groups')).toBe('/app/contacts')
    expect(legacyRedirectTarget('/app/webrtc')).toBe('/app/meeting')
    expect(legacyRedirectTarget('/app/devices')).toBe('/app/settings/account')
    expect(legacyRedirectTarget('/app/group-chat')).toBe('/app/chat')
    expect(legacyRedirectTarget('/app/chat')).toBe(null)
    expect(LEGACY_REDIRECTS.length).toBe(5)
  })

  it('旧键已删：ROUTES.app 只剩壳的十一个键（字面量，不从 ROUTES 自己拼）', () => {
    expect(Object.keys(ROUTES.app).sort()).toEqual(['aiChat', 'bots', 'chat', 'contacts', 'files', 'meeting', 'miniapps', 'oauthAuthorize', 'profile', 'settings', 'videoMeeting'])
    expect('legacy' in ROUTES).toBe(false)
  })
})
