import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEVICE_SCOPED_SETTING_FIELDS,
  endSession,
  purgeAccountScopedStorage,
  registerPristineStoreReset,
  registerSessionReset,
} from '../sessionScope'

/**
 * 这个模块的价值全在**默认方向**上：不在设备级白名单里的键，谁都不用记得，
 * 登出时自动没了。所以第一条用例故意用一个本模块**根本不认识**的键
 * （"明天某人新加的持久化切片"）来断言，而不是用今天已知的那几个——用已知键
 * 断言的话，把实现改成一串写死的 `removeItem('profile-storage')` 也会绿，
 * 而那正是本次修的 bug 的形状。
 *
 * 每条"被清掉"的断言都配了同一次清盘里"活下来"的正对照，因为
 * `localStorage.clear()` 也能让所有"被清掉"的断言变绿。
 */

const seedZustand = (key: string, state: Record<string, unknown>, version = 0) => {
  localStorage.setItem(key, JSON.stringify({ state, version }))
}

const readZustandState = (key: string): Record<string, unknown> | null => {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('purgeAccountScopedStorage —— 默认清掉', () => {
  it('清掉本模块从没听说过的键，同时留下设备级键', () => {
    // 「将来某人新加的切片」——本模块没有一处提到这两个名字。
    seedZustand('some-future-store', { secret: 'A 的东西' })
    localStorage.setItem('another-future-key', 'A 的东西')
    // 今天已知的账号级键，一并验证。
    seedZustand('profile-storage', { profile: { user_nickname: 'A' } })
    seedZustand('api-config-storage', { aiApiKey: 'sk-A', useCustomApi: true })
    localStorage.setItem('last_visited_path', '/app/devices')
    // 正对照：设备级键。没有它们，把实现写成 localStorage.clear() 一样全绿。
    localStorage.setItem('huanvae.api-base-url', 'https://api.example.test')
    localStorage.setItem('huanvae.install-targets.latest', '{"expiresAt":1,"data":{}}')
    localStorage.setItem('huanvae-remember-user_id', 'alice')
    localStorage.setItem('sound_enabled', 'false')
    localStorage.setItem('sound_volume', '0.2')

    purgeAccountScopedStorage()

    expect(localStorage.getItem('some-future-store')).toBeNull()
    expect(localStorage.getItem('another-future-key')).toBeNull()
    expect(localStorage.getItem('profile-storage')).toBeNull()
    expect(localStorage.getItem('api-config-storage')).toBeNull()
    expect(localStorage.getItem('last_visited_path')).toBeNull()

    expect(localStorage.getItem('huanvae.api-base-url')).toBe('https://api.example.test')
    expect(localStorage.getItem('huanvae.install-targets.latest')).toBe('{"expiresAt":1,"data":{}}')
    // 「记住我」是本表里唯一一条用户显式勾选要求跨会话保留的数据，见 sessionScope.ts
    // 里那条说明。它变了 = 有人改了这个取舍，应该在 review 里被看见。
    expect(localStorage.getItem('huanvae-remember-user_id')).toBe('alice')
    expect(localStorage.getItem('sound_enabled')).toBe('false')
    expect(localStorage.getItem('sound_volume')).toBe('0.2')
  })

  it('一次清盘里删掉多个键，不会因为下标前移而漏掉后面的', () => {
    // 边遍历边 removeItem 会让后续下标整体前移；实现先取键快照。
    // 6 个连续的账号级键足以让天真实现（for i<length + key(i) + removeItem）漏掉后半截。
    for (let i = 0; i < 6; i += 1) localStorage.setItem(`account-key-${i}`, String(i))

    purgeAccountScopedStorage()

    expect(localStorage.length).toBe(0)
  })

  it('sessionStorage 用同一张表清', () => {
    sessionStorage.setItem('anything', 'A 的东西')
    sessionStorage.setItem('huanvae.api-base-url', 'https://api.example.test')

    purgeAccountScopedStorage()

    expect(sessionStorage.getItem('anything')).toBeNull()
    expect(sessionStorage.getItem('huanvae.api-base-url')).toBe('https://api.example.test')
  })
})

describe('purgeAccountScopedStorage —— app-settings 的字段级裁剪', () => {
  it('设备级字段留下，账号级字段和将来新增的字段一并清掉', () => {
    seedZustand('app-settings', {
      theme: 'dark',
      language: 'en',
      soundVolume: 0.2,
      // 账号级：隐私姿态 + AI 偏好
      showOnlineStatus: false,
      messageEncryption: false,
      aiEnabled: false,
      aiModel: 'gpt-5',
      // 「明天某人往这个 store 里加的设置」——默认跟着账号走
      someFutureSetting: 'A 的东西',
    })

    purgeAccountScopedStorage()

    const state = readZustandState('app-settings')
    expect(state).toEqual({ theme: 'dark', language: 'en', soundVolume: 0.2 })
  })

  it('信封裁剪保留 version（否则下一次 rehydrate 会误以为要跑迁移）', () => {
    seedZustand('app-settings', { theme: 'dark', showOnlineStatus: false }, 3)

    purgeAccountScopedStorage()

    expect(JSON.parse(localStorage.getItem('app-settings') as string)).toEqual({
      state: { theme: 'dark' },
      version: 3,
    })
  })

  it('形状不认识时整键删除（证明不了就不留）', () => {
    localStorage.setItem('app-settings', '不是 JSON')
    localStorage.setItem('huanvae.api-base-url', 'https://api.example.test')

    purgeAccountScopedStorage()

    expect(localStorage.getItem('app-settings')).toBeNull()
    // 正对照：同一次调用里设备级键仍在，说明上面那条不是"整个 storage 被清了"。
    expect(localStorage.getItem('huanvae.api-base-url')).toBe('https://api.example.test')
  })

  it('没有 state 字段的信封同样整键删除', () => {
    localStorage.setItem('app-settings', JSON.stringify({ theme: 'dark' }))

    purgeAccountScopedStorage()

    expect(localStorage.getItem('app-settings')).toBeNull()
  })

  it('设备级字段名单与 settingsStore 的默认值同源（拼错一个字段名这条就红）', async () => {
    // DEVICE_SCOPED_SETTING_FIELDS 里出现一个 settingsStore 里不存在的字段名，
    // 落盘裁剪会静默地把它当"没有这个字段"，而 settingsStore 那边算出来的
    // 账号级名单会因此**多**一个字段——两边看起来都在工作，实际各说各话。
    const { useSettingsStore } = await import('@/features/settings/store/settingsStore')
    const stateKeys = Object.keys(useSettingsStore.getState())

    for (const field of DEVICE_SCOPED_SETTING_FIELDS) {
      expect(stateKeys).toContain(field)
    }
  })
})

describe('endSession —— 内存重置与清盘的顺序', () => {
  it('先跑重置回调再清盘：回调写进去的账号级键最终不会留下', () => {
    // zustand 的 persist 就是这个形状：重置回调里的 set() 会同步落一次盘。
    // 顺序反过来（先清盘后回调）的话，这个键会活下来。
    const unregister = registerSessionReset(() => {
      localStorage.setItem('written-by-reset', '重置时落的盘')
    })

    endSession()
    unregister()

    expect(localStorage.getItem('written-by-reset')).toBeNull()
  })

  it('某个回调抛错不影响其它回调，也不影响清盘', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('account-key', 'A 的东西')
    const survivor = vi.fn()
    const unregisterBad = registerSessionReset(() => {
      throw new Error('boom')
    })
    const unregisterGood = registerSessionReset(survivor)

    endSession()
    unregisterBad()
    unregisterGood()

    expect(survivor).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('account-key')).toBeNull()
  })

  it('注销之后回调不再被调用（正对照：注销前调过一次）', () => {
    const reset = vi.fn()
    const unregister = registerSessionReset(reset)

    endSession()
    expect(reset).toHaveBeenCalledTimes(1)

    unregister()
    endSession()
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('重置回调里再次触发登出不会让回调链重入', () => {
    let depth = 0
    let maxDepth = 0
    const unregister = registerSessionReset(() => {
      depth += 1
      maxDepth = Math.max(maxDepth, depth)
      if (depth < 3) endSession()
      depth -= 1
    })

    endSession()
    unregister()

    expect(maxDepth).toBe(1)
  })
})

describe('registerPristineStoreReset', () => {
  it('把 store 恢复成登记那一刻的完整状态（含后来新增的字段）', () => {
    const state: Record<string, unknown> = { items: [], cursor: null }
    const store = {
      getState: () => state,
      setState: vi.fn(),
    }

    const unregister = registerPristineStoreReset(store)
    // 登记之后 store 被写脏
    state.items = ['A 的会话']
    endSession()
    unregister()

    // 快照是登记那一刻的对象引用，替换语义（replace=true）
    expect(store.setState).toHaveBeenCalledWith(state, true)
  })

  it('拒绝 persist 化的 store —— 它的初始快照已经是上一个用户的数据', () => {
    // zustand 5.0.15 的 persistImpl 在 create() 内部就同步跑过一次 hydrate()，
    // 所以对 persist store 取"初始快照"拿到的是 rehydrate 后的状态。
    // 这不是靠注释拦的，是运行时认 `persist` 属性直接抛错。
    const persisted = { getState: () => ({}), setState: vi.fn(), persist: {} }

    expect(() => registerPristineStoreReset(persisted)).toThrow(/persist/)
  })

  it('正对照：没有 persist 属性的同形对象可以正常登记', () => {
    const plain = { getState: () => ({}), setState: vi.fn() }

    expect(() => registerPristineStoreReset(plain)()).not.toThrow()
  })
})
