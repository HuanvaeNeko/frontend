// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { getSessionStore, resetSessionStore } from '../index'

describe('getSessionStore', () => {
  afterEach(() => {
    resetSessionStore()
    delete process.env.SESSION_DB_PATH
  })

  it('打开失败后不永久缓存被拒绝的 Promise：环境修好后下一次调用能恢复', async () => {
    // 指向一个必然不存在的目录：openDatabase 内部构造 sqlite Database 实例时
    // 会因为目录不存在而抛，在这个 async 函数里表现为一个 rejected Promise。
    process.env.SESSION_DB_PATH = '/huanvae-test-nonexistent-dir/sub/sessions.sqlite'

    await expect(getSessionStore()).rejects.toBeDefined()

    // 故意**不**调用 resetSessionStore()——这正是本条要测的：被拒绝的 Promise
    // 必须由 getSessionStore 自己清掉，不能靠测试代劳。只改好环境变量，
    // 看第二次调用是否真的重新尝试打开。
    process.env.SESSION_DB_PATH = ':memory:'

    await expect(getSessionStore()).resolves.toBeDefined()
  })
})
