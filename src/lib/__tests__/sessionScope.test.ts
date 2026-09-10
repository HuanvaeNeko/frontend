import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  beginSession,
  currentSessionGeneration,
  DEVICE_SCOPED_SETTING_FIELDS,
  endSession,
  isSameSession,
  purgeAccountScopedStorage,
  registerPristineStoreReset,
  registerSessionReset,
  sessionScopedLocalStorage,
} from '../sessionScope'

/**
 * 这个模块的价值全在**默认方向**上：不在设备级白名单里的键，谁都不用记得，
 * 登出时自动没了。所以第一条用例故意用一个本模块**根本不认识**的键
 * （"明天某人新加的持久化切片"）来断言，而不是用今天已知的那几个——用已知键
 * 断言的话，把实现改成一串写死的 `removeItem('profile-storage')` 也会绿，
 * 而那正是本次修的 bug 的形状。
 *
 * 每一条"被清掉"的断言都配了**同一次清盘里**活下来的正对照（多数是
 * `huanvae.api-base-url`），因为 `localStorage.clear()` 也能让所有"被清掉"的
 * 断言变绿。这不是形式主义：本文件此前有两条用例（多键下标前移、单键顺序）
 * 就只断言了"没了"，把实现换成 `localStorage.clear()` 照样全绿。
 */

const seedZustand = (key: string, state: Record<string, unknown>, version = 0) => {
  localStorage.setItem(key, JSON.stringify({ state, version }))
}

const readZustandState = (key: string): Record<string, unknown> | null => {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  return (JSON.parse(raw) as { state: Record<string, unknown> }).state
}

/** 每条用例里"活下来"的那一个键，专门用来把 `localStorage.clear()` 排除掉。 */
const DEVICE_KEY = 'huanvae.api-base-url'
const DEVICE_VALUE = 'https://api.example.test'
const seedDeviceControl = () => localStorage.setItem(DEVICE_KEY, DEVICE_VALUE)
const expectDeviceControlSurvived = () => expect(localStorage.getItem(DEVICE_KEY)).toBe(DEVICE_VALUE)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // 上一条用例可能以 endSession() 收尾（闸门关着），会污染下一条里对
  // sessionScopedLocalStorage 的写入。beginSession() 把模块恢复到"会话进行中"。
  beginSession()
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
    seedDeviceControl()
    localStorage.setItem('huanvae.install-targets.latest', '{"expiresAt":1,"data":{}}')
    localStorage.setItem('huanvae-remember-user_id', 'alice')
    localStorage.setItem('sound_enabled', 'false')
    localStorage.setItem('sound_volume', '0.2')
    localStorage.setItem('huanvae.sidebar-layout', '{"pinned":["files"],"more":[]}')

    purgeAccountScopedStorage()

    expect(localStorage.getItem('some-future-store')).toBeNull()
    expect(localStorage.getItem('another-future-key')).toBeNull()
    expect(localStorage.getItem('profile-storage')).toBeNull()
    expect(localStorage.getItem('api-config-storage')).toBeNull()
    expect(localStorage.getItem('last_visited_path')).toBeNull()

    expectDeviceControlSurvived()
    expect(localStorage.getItem('huanvae.install-targets.latest')).toBe('{"expiresAt":1,"data":{}}')
    // 「记住我」是本表里唯一一条**明知会泄露仍然留下**的：共用设备上下一个人会在
    // 用户名框里看见上一个人的账号 ID。它变了 = 有人改了这个取舍，
    // 应该在 review 里被看见（要改的话正确做法是删掉 LoginForm 的这个功能）。
    expect(localStorage.getItem('huanvae-remember-user_id')).toBe('alice')
    expect(localStorage.getItem('sound_enabled')).toBe('false')
    expect(localStorage.getItem('sound_volume')).toBe('0.2')
    expect(localStorage.getItem('huanvae.sidebar-layout')).toBe('{"pinned":["files"],"more":[]}')
  })

  it('一次清盘里删掉多个键，不会因为下标前移而漏掉后面的', () => {
    // 边遍历边 removeItem 会让后续下标整体前移；实现先取键快照。
    // 6 个连续的账号级键足以让天真实现（for i<length + key(i) + removeItem）漏掉后半截。
    for (let i = 0; i < 6; i += 1) localStorage.setItem(`account-key-${i}`, String(i))
    // 正对照：同一次清盘里活下来的设备级键。只断言 length===0 的话，
    // 把实现换成 localStorage.clear() 这条照样绿。
    seedDeviceControl()

    purgeAccountScopedStorage()

    for (let i = 0; i < 6; i += 1) {
      expect(localStorage.getItem(`account-key-${i}`)).toBeNull()
    }
    expectDeviceControlSurvived()
    // 盘上只剩那一个正对照：证明"六个都删了"，而不是"删了前三个"。
    expect(localStorage.length).toBe(1)
  })

  it('sessionStorage 用同一张表清', () => {
    sessionStorage.setItem('anything', 'A 的东西')
    sessionStorage.setItem(DEVICE_KEY, DEVICE_VALUE)

    purgeAccountScopedStorage()

    expect(sessionStorage.getItem('anything')).toBeNull()
    expect(sessionStorage.getItem(DEVICE_KEY)).toBe(DEVICE_VALUE)
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
    seedDeviceControl()

    purgeAccountScopedStorage()

    expect(localStorage.getItem('app-settings')).toBeNull()
    // 正对照：同一次调用里设备级键仍在，说明上面那条不是"整个 storage 被清了"。
    expectDeviceControlSurvived()
  })

  it('没有 state 字段的信封同样整键删除', () => {
    localStorage.setItem('app-settings', JSON.stringify({ theme: 'dark' }))
    seedDeviceControl()

    purgeAccountScopedStorage()

    expect(localStorage.getItem('app-settings')).toBeNull()
    expectDeviceControlSurvived()
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
      // 正对照：同一个回调里写一个**设备级**键。清盘之后它必须还在，
      // 否则"回调写的东西没了"可能只是因为清盘把所有东西都删了。
      localStorage.setItem(DEVICE_KEY, DEVICE_VALUE)
    })

    endSession()
    unregister()

    expect(localStorage.getItem('written-by-reset')).toBeNull()
    expectDeviceControlSurvived()
  })

  it('某个回调抛错不影响其它回调，也不影响清盘', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('account-key', 'A 的东西')
    seedDeviceControl()
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
    expectDeviceControlSurvived()
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
  it('恢复的是**登记那一刻**的快照，不是重置时重新取的 getState()', () => {
    // 关键在于 getState 返回的对象在登记之后被**换掉**（而不是就地改）：
    // 实现若把 store.getState() 推迟到重置时才调，拿到的就是 dirty 那一个，
    // 这条红。原来那版用的是同一个对象就地改字段，两种实现都会绿。
    const pristine = { items: [] as string[], cursor: null as string | null }
    const dirty = { items: ['A 的会话'], cursor: 'A 的游标' }
    let current: typeof pristine = pristine
    const store = {
      getState: () => current,
      setState: vi.fn(),
    }

    const unregister = registerPristineStoreReset(store)
    current = dirty
    endSession()
    unregister()

    expect(store.setState).toHaveBeenCalledWith(pristine, true)
    expect(store.setState).not.toHaveBeenCalledWith(dirty, true)
    // 替换语义：第二个参数是 true，否则 merge 会把 dirty 的字段留下
    expect(store.setState.mock.calls[0]?.[1]).toBe(true)
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

/**
 * 清盘只证明"这一刻盘上没有账号级数据"。登出那一刻还在飞的请求会在清盘**之后**
 * 落地，`set()` 一写 persist 就把上一个人的数据重新落盘。世代号与写入闸门补的是
 * 这一半，两者的分工见 `sessionScope.ts` 顶部「清盘是一个时点，而写入不是」。
 */
describe('会话世代号', () => {
  it('endSession 之后，登出前取到的世代号不再是当前会话', () => {
    const before = currentSessionGeneration()
    // 正对照：同一场会话里取两次，判定为同一场。
    expect(isSameSession(before)).toBe(true)

    endSession()

    expect(isSameSession(before)).toBe(false)
    // 正对照：登出后重新取的那个仍然是"当前"，说明变红的是**旧**票据而不是全部
    expect(isSameSession(currentSessionGeneration())).toBe(true)
  })

  it('beginSession 也换号：开场之前取到的世代号，在新会话里不再算数', () => {
    // 这条钉的是「换人」而不是「登出」：`clearCredentials` 那一档按定义不结束会话，
    // 所以 A 那边在飞的请求落地时，唯一能证明"已经不是你那一场了"的事件就是
    // B 的 beginSession()。只在 endSession 里 +1 的实现，这条红。
    const before = currentSessionGeneration()
    // 正对照：还没跨边界时判真，说明下面判假的是**跨边界**而不是 pinned 值本身。
    expect(isSameSession(before)).toBe(true)

    beginSession()

    expect(isSameSession(before)).toBe(false)
    // 正对照：新会话里重新取的那个是"当前"，变红的只是**旧**票据。
    expect(isSameSession(currentSessionGeneration())).toBe(true)
  })

  it('每跨一个边界都换一个新号，不是在两个值之间来回翻', () => {
    // 四个时点取四个号：登出、登录、再登出、再登录。全不相同才排除得掉
    // 「在两个值之间翻」和「只有 endSession 换号」两种实现。
    const first = currentSessionGeneration()
    endSession()
    const second = currentSessionGeneration()
    beginSession()
    const third = currentSessionGeneration()
    endSession()
    const fourth = currentSessionGeneration()

    expect(new Set([first, second, third, fourth]).size).toBe(4)
  })

  it('重置回调里嵌套跨边界时，世代号只跳一格', () => {
    // 防重入的 return 若放在递增之后，一次登出换出的号会随回调里嵌套了几层而变——
    // 世代号本身还是"新的"，但"跨了几个边界"不再等于"换了几场会话"，
    // 而 `pinSession` 的语义正建立在后者上。
    const unregister = registerSessionReset(() => {
      endSession()
    })
    const before = currentSessionGeneration()

    endSession()
    unregister()

    expect(currentSessionGeneration()).toBe(before + 1)
  })
})

/**
 * 内存副本那一半：{@link registerSessionReset} 登记的回调必须在**两个**边界上都跑。
 * 只挂在 `endSession` 上时，`clearCredentials`（不结束会话）留在内存里的东西
 * 没有任何东西会去动它——落盘那一半有 `beginSession` 的清盘兜底，内存那一半没有。
 */
describe('会话边界 —— 内存重置在两侧都跑', () => {
  it('beginSession 也跑登记过的内存重置', () => {
    const reset = vi.fn()
    const unregister = registerSessionReset(reset)

    beginSession()
    expect(reset).toHaveBeenCalledTimes(1)

    // 正对照：注销之后同一个边界不再调用，说明上面那次是登记生效而不是别处调的。
    unregister()
    beginSession()
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('beginSession 同样是「先跑回调、再清盘」', () => {
    // 顺序反过来的话，回调里那次落盘写入会活过这场清盘，跟着新会话一起走。
    const unregister = registerSessionReset(() => {
      localStorage.setItem('written-by-reset', '重置时落的盘')
      // 正对照：同一个回调里的设备级键必须活下来，否则"没了"可能只是清盘把
      // 所有东西都删了。
      localStorage.setItem(DEVICE_KEY, DEVICE_VALUE)
    })

    beginSession()
    unregister()

    expect(localStorage.getItem('written-by-reset')).toBeNull()
    expectDeviceControlSurvived()
  })
})

describe('sessionScopedLocalStorage —— 死窗口里的写入闸门', () => {
  beforeEach(() => {
    // 闸门每丢弃一次写入都会 console.warn（欠账要能被看见），这里只是让输出干净
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('会话结束后，账号级键的落盘写入被丢弃；同一刻设备级键照写', () => {
    endSession()

    sessionScopedLocalStorage.setItem('profile-storage', '{"state":{"profile":{"x":1}}}')
    sessionScopedLocalStorage.setItem('some-future-store', 'A 的东西')
    // 正对照：同一个死窗口里，设备级键必须写得进去——登出后停在登录页的用户
    // 照样会切服务器、调音量。没有这一条，把 setItem 实现成"永远 no-op"也全绿。
    sessionScopedLocalStorage.setItem(DEVICE_KEY, DEVICE_VALUE)

    expect(localStorage.getItem('profile-storage')).toBeNull()
    expect(localStorage.getItem('some-future-store')).toBeNull()
    expectDeviceControlSurvived()
  })

  it('丢弃时顺手把该键从盘上抹掉（写入前它可能还在）', () => {
    localStorage.setItem('profile-storage', '上一场会话漏下的')
    endSession()
    // 清盘已经删过一次；这里模拟"清盘之后又有人写进来"再被闸门拦下
    localStorage.setItem('profile-storage', '绕过闸门直接写的')

    sessionScopedLocalStorage.setItem('profile-storage', '{"state":{}}')

    expect(localStorage.getItem('profile-storage')).toBeNull()
  })

  it('死窗口里的 app-settings 写入按字段裁剪：设备级留下，账号级夹带被剪掉', () => {
    endSession()

    sessionScopedLocalStorage.setItem(
      'app-settings',
      JSON.stringify({ state: { theme: 'dark', showOnlineStatus: false }, version: 0 }),
    )

    expect(readZustandState('app-settings')).toEqual({ theme: 'dark' })
  })

  it('会话进行中一切照旧：账号级键写得进去', () => {
    // 这是闸门的"关"状态之外的另一半——没有这条，把闸门实现成"一律丢弃"也会绿。
    sessionScopedLocalStorage.setItem('profile-storage', '{"state":{"profile":{"x":1}}}')

    expect(localStorage.getItem('profile-storage')).toBe('{"state":{"profile":{"x":1}}}')
  })

  it('beginSession 重新开闸，并且开闸之前先清一遍盘', () => {
    endSession()
    // 模拟"没走闸门的切片在死窗口里漏下的东西"：直接写裸 localStorage。
    // 这是三道防线里最后一道要接住的那一类——作者什么都没做也得被清掉。
    localStorage.setItem('leaked-during-dead-window', 'A 的东西')
    seedDeviceControl()

    beginSession()

    expect(localStorage.getItem('leaked-during-dead-window')).toBeNull()
    expectDeviceControlSurvived()

    // 闸门开了：新会话的写入正常落盘
    sessionScopedLocalStorage.setItem('profile-storage', '{"state":{"profile":{"x":2}}}')
    expect(localStorage.getItem('profile-storage')).toBe('{"state":{"profile":{"x":2}}}')
  })
})
