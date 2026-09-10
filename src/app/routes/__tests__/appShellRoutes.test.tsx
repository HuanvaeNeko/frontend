import { describe, expect, it } from 'vitest'
import routes from '../../routes'

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
    expect(flat.some((x) => x.startsWith('routes/chat.tsx@'))).toBe(false)
    // 正对照：旧页面这一步还在（legacy-layout 之下），证明 flatten 读到了整张表
    expect(flat).toContain('routes/friends.tsx@/app/friends')
  })
})
