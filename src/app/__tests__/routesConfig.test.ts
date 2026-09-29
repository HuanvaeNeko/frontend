import { describe, expect, it } from 'vitest'
import routes from '../routes'

type Entry = { path?: string; file: string; children?: Entry[] }

/** 返回 path 所在的整条祖先链（layout 的 file 名），找不到返回 null */
function ancestryOf(entries: Entry[], path: string, chain: string[] = []): string[] | null {
  for (const entry of entries) {
    if (entry.path === path) return chain
    if (entry.children) {
      const found = ancestryOf(entry.children, path, [...chain, entry.file])
      if (found) return found
    }
  }
  return null
}

describe('路由表', () => {
  it('视频会议页不在登录守卫后面：访客拿着会议链接也能进（后端加入房间无需登录）', () => {
    const chain = ancestryOf(routes as Entry[], 'app/video-meeting')
    expect(chain).not.toBeNull()
    expect(chain).not.toContain('routes/protected-layout.tsx')
    // 正对照：授权页仍在守卫后面，说明 ancestryOf 真的能看见守卫
    expect(ancestryOf(routes as Entry[], 'app/oauth/authorize')).toContain('routes/protected-layout.tsx')
  })

  it('加入房间的 BFF 路由排在 api/* 之前', () => {
    const paths = (routes as Entry[]).map((r) => r.path)
    const join = paths.indexOf('api/webrtc/rooms/:roomId/join')
    expect(join).toBeGreaterThanOrEqual(0)
    expect(join).toBeLessThan(paths.indexOf('api/*'))
  })
})
