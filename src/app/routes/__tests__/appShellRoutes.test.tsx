import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import routes from '../../routes'
import SettingsSectionRoute from '../shell/settings.$section'

interface RouteEntry { file: string; path?: string; index?: boolean; children?: RouteEntry[] }

/** 把 @react-router/dev/routes 的 RouteConfig 拍平成 "file@fullPath" */
function flatten(entries: RouteEntry[], prefix = ''): string[] {
  const out: string[] = []
  for (const e of entries) {
    const full = e.index ? `${prefix}/` : e.path ? `${prefix}/${e.path}` : prefix
    out.push(`${e.file}@${full || '/'}`)
    if (e.children) out.push(...flatten(e.children, e.path ? `${prefix}/${e.path}` : prefix))
  }
  return out
}

describe('路由表：壳布局承载 /app/chat', () => {
  it('app-shell.tsx 之下有 /app/chat 与 /app/chat/:conversationId，旧的 routes/chat.tsx 不再注册', () => {
    const flat = flatten(routes as unknown as RouteEntry[])
    expect(flat).toContain('routes/app-shell.tsx@/')
    expect(flat).toContain('routes/shell/chat.tsx@/app/chat')
    expect(flat).toContain('routes/shell/chat.$conversationId.tsx@/app/chat/:conversationId')
    expect(flat).toContain('routes/shell/contacts.tsx@/app/contacts')
    expect(flat).toContain('routes/shell/contacts.friends.$userId.tsx@/app/contacts/friends/:userId')
    expect(flat).toContain('routes/shell/contacts.groups.$groupId.tsx@/app/contacts/groups/:groupId')
    expect(flat).toContain('routes/shell/settings.tsx@/app/settings')
    expect(flat).toContain('routes/shell/settings.$section.tsx@/app/settings/:section')
    expect(flat.some((x) => x.startsWith('routes/chat.tsx@'))).toBe(false)
    expect(flat.some((x) => x.startsWith('routes/settings.tsx@'))).toBe(false)
    // 正对照：video-meeting.tsx 这一步还在（app-shell 之外、protected-layout 之下的同级路由），证明 flatten 读到了整张表
    expect(flat).toContain('routes/video-meeting.tsx@/app/video-meeting')
  })

  it('带 URL 的模态框 + AI 助手挂在 app-shell 之下，旧的 routes/files.tsx、routes/ai-chat.tsx、routes/profile.tsx 不再注册', () => {
    const flat = flatten(routes as unknown as RouteEntry[])
    expect(flat).toContain('routes/shell/profile.tsx@/app/profile')
    expect(flat).toContain('routes/shell/files.tsx@/app/files')
    expect(flat).toContain('routes/shell/meeting.tsx@/app/meeting')
    expect(flat).toContain('routes/shell/bots.tsx@/app/bots')
    expect(flat).toContain('routes/shell/miniapps.tsx@/app/miniapps')
    expect(flat).toContain('routes/shell/ai-chat.tsx@/app/ai-chat')
    expect(flat.some((x) => x.startsWith('routes/files.tsx@'))).toBe(false)
    expect(flat.some((x) => x.startsWith('routes/ai-chat.tsx@'))).toBe(false)
    expect(flat.some((x) => x.startsWith('routes/profile.tsx@'))).toBe(false)
    // 正对照：同上，证明 flatten 读到了整张表
    expect(flat).toContain('routes/video-meeting.tsx@/app/video-meeting')
  })

  it('legacy-layout 与九个旧路由模块都不再注册；五条旧 URL 指向 legacy-redirect', () => {
    const flat = flatten(routes as unknown as RouteEntry[])
    for (const old of ['routes/legacy-layout.tsx', 'routes/chat.tsx', 'routes/friends.tsx', 'routes/groups.tsx', 'routes/files.tsx', 'routes/webrtc.tsx', 'routes/devices.tsx', 'routes/settings.tsx', 'routes/profile.tsx', 'routes/ai-chat.tsx']) {
      expect(flat.some((x) => x.startsWith(`${old}@`))).toBe(false)
    }
    for (const path of ['/app/friends', '/app/groups', '/app/webrtc', '/app/devices', '/app/group-chat']) {
      expect(flat).toContain(`routes/shell/legacy-redirect.tsx@${path}`)
    }
  })

  it('settings.$section.tsx 拒绝非法分区，回退到 appearance', () => {
    // 变异实测：把 settings.$section.tsx 里 `isSettingsSection(section)` 那道校验去掉，
    // 本条红——非法 section（这里是 'nope'）不会被拦下，组件会直接拿 'nope' 去查
    // SECTION_COMPONENTS，undefined 当组件用，React 抛错/白屏，location 也不会变成
    // /app/settings/appearance。
    const router = createMemoryRouter(
      [{ path: '/app/settings/:section', element: <SettingsSectionRoute /> }],
      { initialEntries: ['/app/settings/nope'] },
    )
    render(<RouterProvider router={router} />)
    expect(router.state.location.pathname).toBe('/app/settings/appearance')
  })
})
