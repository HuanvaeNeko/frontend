import { describe, expect, it } from 'vitest'
import { backTargetOf, isDetailPath } from '../shellFold'

describe('isDetailPath：折叠时该显示内容区的 URL', () => {
  it.each([
    ['/app/chat/f-alice', true], ['/app/chat/g-g1', true],
    ['/app/contacts/friends/alice', true], ['/app/contacts/groups/g1', true],
    ['/app/settings/appearance', true], ['/app/ai-chat', true],
    ['/app/chat', false], ['/app/contacts', false], ['/app/settings', false],
    ['/app/files', false], ['/app/meeting', false], ['/app/bots', false], ['/app/miniapps', false], ['/app/profile', false],
  ])('%s → %s', (path, expected) => {
    expect(isDetailPath(path)).toBe(expected)
  })
})

describe('backTargetOf：「返回列表」去哪', () => {
  it('chat / contacts / settings 子路径回各自的根', () => {
    expect(backTargetOf('/app/chat/f-alice', 'contacts')).toBe('/app/chat')
    expect(backTargetOf('/app/contacts/friends/alice', 'chat')).toBe('/app/contacts')
    expect(backTargetOf('/app/settings/account', 'chat')).toBe('/app/settings')
  })
  it('AI 助手回记住的 tab 根（两种都试，证明确实读了参数）', () => {
    expect(backTargetOf('/app/ai-chat', 'chat')).toBe('/app/chat')
    expect(backTargetOf('/app/ai-chat', 'contacts')).toBe('/app/contacts')
  })
})
