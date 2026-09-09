/**
 * 同一组契约跑 bun:sqlite 驱动。生产运行时是 Bun，只测 node:sqlite 的话，
 * 两个驱动的行为分叉（`changes` 的类型、`get()` 未命中时返回 null 还是 undefined）
 * 会直接进生产。
 *
 * 由 `bun test` 跑，不由 vitest 跑（vitest 在 Node 下，import bun:sqlite 必然失败）；
 * vitest.config.ts 的 exclude 已排除 *.bun.test.ts。
 */
import { beforeEach, describe, expect, it } from 'bun:test'
import { openDatabase } from '../db'
import { createSessionStore, type SessionStore } from '../store'
import { SESSION_STORE_CONTRACT } from './storeContract'

describe('SessionStore（bun:sqlite 驱动）', () => {
  let store: SessionStore

  beforeEach(async () => {
    store = createSessionStore(await openDatabase(':memory:'))
  })

  for (const c of SESSION_STORE_CONTRACT) {
    it(c.name, () => {
      c.run(store, expect as never)
    })
  }
})
