import { beforeEach, describe, expect, it } from 'vitest'
import { recallShellTab, rememberShellTab, shellTabOf } from '../shellTab'

describe('shellTabOf：列表栏该显示哪个 tab（spec §3：模态框下保持最近 tab）', () => {
  it('chat / contacts / settings 由路径决定，与记忆无关', () => {
    expect(shellTabOf('/app/chat/f-alice', 'contacts')).toBe('chat')
    expect(shellTabOf('/app/contacts', 'chat')).toBe('contacts')
    expect(shellTabOf('/app/settings/account', 'chat')).toBe('settings')
  })
  it('模态框路由与 AI 助手返回记住的 tab（两种都试，证明确实读了参数）', () => {
    for (const path of ['/app/files', '/app/meeting', '/app/bots', '/app/miniapps', '/app/profile', '/app/ai-chat']) {
      expect(shellTabOf(path, 'chat')).toBe('chat')
      expect(shellTabOf(path, 'contacts')).toBe('contacts')
    }
  })
})

describe('rememberShellTab / recallShellTab（sessionStorage huanvae.shell-tab）', () => {
  beforeEach(() => sessionStorage.clear())
  it('默认 chat；记过 contacts 就回 contacts；坏值回 chat', () => {
    expect(recallShellTab()).toBe('chat')
    rememberShellTab('contacts')
    expect(sessionStorage.getItem('huanvae.shell-tab')).toBe('contacts')
    expect(recallShellTab()).toBe('contacts')
    sessionStorage.setItem('huanvae.shell-tab', 'nope')
    expect(recallShellTab()).toBe('chat')
  })
})
