import type { SessionStore } from '../store'

export interface ContractCase {
  name: string
  run(store: SessionStore, expect: (actual: unknown) => { toBe(v: unknown): void; toEqual(v: unknown): void }): void
}

const USER = { user_id: 'alice', nickname: '爱丽丝' }

function seed(store: SessionStore, id: string, expiresAt: number) {
  return store.create({
    id,
    userId: 'alice',
    accessToken: `AT-${id}`,
    refreshToken: `RT-${id}`,
    accessExpiresAt: expiresAt,
    user: USER,
    now: 1_000,
    userAgent: 'probe',
  })
}

/**
 * 同一组用例跑两个驱动：vitest（node:sqlite）与 bun test（bun:sqlite）。
 * 生产跑在 Bun 上，只测 Node 驱动的话，两者的行为分叉会直接进生产。
 */
export const SESSION_STORE_CONTRACT: ContractCase[] = [
  {
    name: 'create 之后 get 拿回同一行，user 是反序列化后的对象',
    run(store, expect) {
      seed(store, 's1', 9_000)
      const got = store.get('s1')
      expect(got?.accessToken).toBe('AT-s1')
      expect(got?.accessExpiresAt).toBe(9_000)
      expect(got?.user).toEqual(USER)
    },
  },
  {
    name: 'get 不存在的 id 返回 null，不抛错',
    run(store, expect) {
      expect(store.get('nope')).toBe(null)
    },
  },
  {
    name: 'updateTokens：期望值匹配时写入并返回 true',
    run(store, expect) {
      seed(store, 's2', 9_000)
      const ok = store.updateTokens('s2', 9_000, { accessToken: 'AT2', refreshToken: 'RT2', accessExpiresAt: 20_000, now: 2_000 })
      expect(ok).toBe(true)
      expect(store.get('s2')?.accessToken).toBe('AT2')
      expect(store.get('s2')?.accessExpiresAt).toBe(20_000)
    },
  },
  {
    name: 'updateTokens：期望值不匹配时返回 false 且一个字节都不改（CAS 输的那一方）',
    run(store, expect) {
      seed(store, 's3', 9_000)
      const ok = store.updateTokens('s3', 8_999, { accessToken: 'LOSER', refreshToken: 'LOSER', accessExpiresAt: 30_000, now: 2_000 })
      expect(ok).toBe(false)
      // 正对照在上一条：期望值对时确实写得进去。这里断言的是「没写进去」
      expect(store.get('s3')?.accessToken).toBe('AT-s3')
      expect(store.get('s3')?.accessExpiresAt).toBe(9_000)
    },
  },
  {
    name: 'delete 之后 get 返回 null',
    run(store, expect) {
      seed(store, 's4', 9_000)
      store.delete('s4')
      expect(store.get('s4')).toBe(null)
    },
  },
  {
    name: 'deleteExpired 只删 last_seen_at 早于阈值的行，返回删除条数',
    run(store, expect) {
      seed(store, 'old', 9_000)
      seed(store, 'fresh', 9_000)
      store.touch('fresh', 5_000)
      const removed = store.deleteExpired(3_000)
      expect(removed).toBe(1)
      expect(store.get('old')).toBe(null)
      expect(store.get('fresh')?.id).toBe('fresh')
    },
  },
]
