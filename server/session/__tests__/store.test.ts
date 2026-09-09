import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { createSessionStore, type SessionStore } from '../store'
import { SESSION_STORE_CONTRACT } from './storeContract'

describe('SessionStore（node:sqlite 驱动）', () => {
  let store: SessionStore

  beforeEach(async () => {
    // :memory: 每个用例一份，用例间零共享
    store = createSessionStore(await openDatabase(':memory:'))
  })

  for (const c of SESSION_STORE_CONTRACT) {
    it(c.name, () => {
      c.run(store, expect as never)
    })
  }
})
