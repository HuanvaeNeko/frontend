/**
 * 会话结束时清掉「属于这个账号」的一切，只留下「属于这台设备」的东西。
 *
 * ## 为什么是**反向名单**（默认清掉），而不是一串 `clearX()`
 *
 * 本次 bug 的形状是：`profileStore.clearProfile` 早就写好了，**零调用点**——
 * 没人记得去接。任何"每加一个持久化切片就去登出路径上补一行"的设计都会
 * 复发同一个 bug，因为它把正确性押在"下一个人记得"上。
 *
 * 所以这里反过来：{@link purgeAccountScopedStorage} 遍历 `localStorage` /
 * `sessionStorage` 的**全部**键，凡是不在 {@link DEVICE_SCOPED_KEYS} 里的一律删除。
 * 明天有人加一个 `zustand/persist` 切片、或者随手 `localStorage.setItem` 一个新键，
 * 它的落盘副本在登出时**自动**就没了，作者什么都不用做；他唯一需要动这个文件的
 * 场合是**反过来**——想让某个键跨账号活下来，那时必须在下面这张表里写清楚理由。
 * 名单写反了的代价也是对称的：漏登记 = 少一点便利，误登记 = 泄露，
 * 而后者需要一次显式的、review 看得见的编辑。
 *
 * `app-settings` 那一条把这个默认清掉的规则推进到**字段级**：只有列出来的字段
 * 留下，往那个 store 里新增的字段默认跟着账号走。
 *
 * ## 内存副本
 *
 * 落盘副本是本模块的承重件；内存副本由 {@link registerSessionReset} /
 * {@link registerPristineStoreReset} 登记，{@link endSession} 在清盘**之前**跑它们
 * （顺序见 {@link endSession}）。内存这一半做不到"默认覆盖"——没有一个枚举得到
 * 所有 zustand store 的入口——所以它仍然是一张需要维护的名单。它没那么致命的理由是
 * 失效窗口只到下一次整页加载为止：多数登出路径以 `window.location.replace/href`
 * 结束（`silentRedirectToLogin` 的三份副本、各 API 模块 `fetchWithAuth` 的 401 分支、
 * `SettingsPage` 切换/重置服务器），整页加载本身就丢掉了全部内存状态。**不**整页加载的
 * 才需要内存这一半：`authStore.logout`（登出按钮，自身不跳转）、`DevicesPage` 撤销
 * 当前设备（`router.push`）、`wsStore` 刷新失败（完全不跳转），以及调用方自己不跳转的
 * `refreshAccessToken` 失败分支。
 */

/**
 * 设备级键的保留方式。
 *
 * - `whole`：整个键原样留下。
 * - `zustandFields`：只当它是 `zustand/persist` 的落盘信封 `{state, version}`，
 *   `state` 里只保留 `fields` 列出的字段，其余（含将来新增的）删掉。
 */
type DeviceScopedRule =
  | { readonly keep: 'whole' }
  | { readonly keep: 'zustandFields'; readonly fields: readonly string[] }

/**
 * `app-settings`（`useSettingsStore`）里**属于这台设备**的字段。
 *
 * 判据是"换一个人用这台电脑，这个值继续生效是不是对的"：
 * 主题、语言、12/24 小时制、动效、通知、音量、粒子背景——都是这台机器上
 * 这块屏幕的偏好，跟谁登录无关，清掉只会让下一个人重新配一遍。`theme` 还有一层：
 * 它被 `root.tsx` 的预水合内联脚本在 React 挂载前读，清掉会让每次登出后的
 * 首屏闪一次浅色。
 *
 * **没有**列进来的四个字段是有意的：
 * - `showOnlineStatus` / `messageEncryption`：隐私姿态。今天它们是**纯 UI 开关**
 *   （除 `settingsStore` 自身外，全仓只有 `SettingsPage` 的两个 `<Switch>` 读写它们，
 *   没有任何请求或渲染读），所以留着也不会真的泄露什么；但正因为将来接上消费点
 *   是一句话的事，默认让它们跟账号走，比"等接上了记得回来改这张表"可靠。
 * - `aiEnabled` / `aiModel`：与 `api-config-storage`（存着用户自备的第三方
 *   `aiApiKey`）是同一套 AI 配置，那个键整体跟账号走，这两个字段留下会变成
 *   "上一个人的 AI 偏好 + 没有钥匙"的半截状态。
 */
export const DEVICE_SCOPED_SETTING_FIELDS = [
  'theme',
  'language',
  'use24HourFormat',
  'animationsEnabled',
  'notificationsEnabled',
  'soundEnabled',
  'soundVolume',
  'particleBackground',
] as const

/**
 * 跨账号活下来的键。**每加一条都必须写清楚"为什么它属于设备而不属于账号"。**
 */
const DEVICE_SCOPED_KEYS: ReadonlyMap<string, DeviceScopedRule> = new Map<string, DeviceScopedRule>([
  /**
   * 这台设备连哪个后端。本项目会**故意**改基址（`api.huanvae.cn` 被备案拦截时
   * 走本地无 SNI 反代），清掉等于每次登出都把开发通道退回默认域名。
   * 而且 `SettingsPage.handleApplyServer` 正是「`setApiBaseUrl(新地址)` →
   * `clearAuth()` → 跳登录页」这个顺序——清掉它会让"切换服务器"这个功能自己
   * 把刚写进去的地址擦掉。
   */
  ['huanvae.api-base-url', { keep: 'whole' }],

  /**
   * GitHub release 资产列表的本地缓存，自带 `expiresAt`，内容是**公开**数据，
   * 不与任何用户关联（`lib/appInstall.ts`）。
   */
  ['huanvae.install-targets.latest', { keep: 'whole' }],

  /**
   * 「记住我」勾选后落下的登录名（`LoginForm`）。它是本表里唯一一条**用户显式
   * 勾选**要求跨会话保留的数据，而它唯一的读取点就在下一次登录的表单里——
   * 也就是说清掉它，这个功能就永远不可能生效，`LoginForm` 里那段读取分支会变成
   * 死代码。所以这里保留，代价是承认：共用设备上，下一个人会在用户名框里看见
   * 上一个人勾选保留的账号名。要改变这个取舍，正确的做法是**删掉这个功能**
   * （连同勾选框），而不是让它写进去却在登出时清掉。
   */
  ['huanvae-remember-user_id', { keep: 'whole' }],

  /**
   * 这台设备的音量与静音（`hooks/useSound.ts` 在模块初始化时读）。
   * 与 `app-settings` 的 `soundEnabled` / `soundVolume` 是同一件事的第二份拷贝，
   * 两边的设备级判断必须一致，否则登出后音量会跟着哪一份先被读到而抖动。
   */
  ['sound_enabled', { keep: 'whole' }],
  ['sound_volume', { keep: 'whole' }],

  ['app-settings', { keep: 'zustandFields', fields: DEVICE_SCOPED_SETTING_FIELDS }],
])

/** 登记在案的内存重置回调。 */
const sessionResets = new Set<() => void>()

/**
 * 登记一个"会话结束时把内存状态清干净"的回调。返回注销函数（测试用）。
 *
 * 回调在**清盘之前**执行，所以回调里对 `zustand/persist` store 的写入会先落盘、
 * 再被 {@link purgeAccountScopedStorage} 按上面那张表处理——顺序反过来的话，
 * 重置动作会把刚清干净的键重新写回去。
 */
export function registerSessionReset(reset: () => void): () => void {
  sessionResets.add(reset)
  return () => {
    sessionResets.delete(reset)
  }
}

/**
 * 把一个**未持久化**的 zustand store 登记成"会话结束时恢复到初始状态"。
 *
 * 免去逐个 store 手写字段名单：初始快照就是 `create()` 刚返回时的 `getState()`，
 * 里面连 action 闭包一起带着，所以 `setState(snapshot, true)` 是一次完整替换。
 *
 * 快照是**浅**的：store 若在自己的状态对象上就地改（`arr.push` / `map.set`），
 * 快照里那个对象也会被改脏，恢复出来就还是上一个人的数据。接进来的三个
 * store 都不这么写（`friendsStore.setOnlineStatus` 建新 `Map`，`chatStore` 只往
 * 新建的数组里 push），将来接第四个时要先确认这一点。
 *
 * ⚠️ **不能用于 `persist` 包过的 store**：zustand 5.0.15 的 `persistImpl` 在
 * `create()` 内部就同步调了一次 `hydrate()`（同步 storage 经 `toThenable`
 * 立即 resolve），所以那时的 `getState()` 已经是**上一个用户 rehydrate 出来的
 * 状态**，拿它当"初始快照"等于把上一个人的数据登记成了重置目标。
 * 这不是靠注释拦住的：`persist` 会往 store 上挂一个 `persist` 属性，
 * 下面直接在运行时认它并抛错。
 */
export function registerPristineStoreReset<T>(store: {
  getState: () => T
  setState: (state: T, replace: true) => void
}): () => void {
  if ('persist' in store) {
    throw new Error(
      'registerPristineStoreReset 不能用于 persist 化的 store：create() 时已经同步 rehydrate 过，初始快照会是上一个用户的状态',
    )
  }
  const pristine = store.getState()
  return registerSessionReset(() => {
    store.setState(pristine, true)
  })
}

function collectKeys(storage: Storage): string[] {
  // 先取快照再删：`removeItem` 会让后面的下标整体前移，边遍历边删会跳过键。
  const keys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null) keys.push(key)
  }
  return keys
}

/**
 * 把 `zustand/persist` 信封里 `state` 的字段裁到只剩 `fields`。
 *
 * 形状不认识（不是 JSON、不是对象、没有对象形态的 `state`）时**整键删除**，
 * 而不是原样留下：这个函数的职责是"证明留下来的每个字段都是设备级的"，
 * 证明不了就不能留——留下一个读不懂的键正是默认清掉规则要避免的漏洞。
 */
function keepOnlyFields(storage: Storage, key: string, fields: readonly string[]): void {
  const raw = storage.getItem(key)
  if (raw === null) return

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    storage.removeItem(key)
    return
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    storage.removeItem(key)
    return
  }

  const envelope = parsed as { state?: unknown }
  const state = envelope.state
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    storage.removeItem(key)
    return
  }

  const source = state as Record<string, unknown>
  const kept: Record<string, unknown> = {}
  for (const field of fields) {
    if (field in source) kept[field] = source[field]
  }
  storage.setItem(key, JSON.stringify({ ...envelope, state: kept }))
}

function purgeStorage(storage: Storage): void {
  for (const key of collectKeys(storage)) {
    const rule = DEVICE_SCOPED_KEYS.get(key)
    if (rule === undefined) {
      storage.removeItem(key)
      continue
    }
    if (rule.keep === 'whole') continue
    keepOnlyFields(storage, key, rule.fields)
  }
}

/**
 * 清掉 `localStorage` / `sessionStorage` 里所有非设备级的键。
 *
 * `sessionStorage` 一并清：本仓源码没有一处写它，所以那里出现的任何东西都是
 * 依赖库放的，同样没有理由跨账号活着（标签页关掉它本来也就没了）。
 */
export function purgeAccountScopedStorage(): void {
  if (typeof window === 'undefined') return
  try {
    purgeStorage(window.localStorage)
  } catch {
    // Safari 隐私模式等场景下 storage 访问本身会抛；没得清就没得泄露
  }
  try {
    purgeStorage(window.sessionStorage)
  } catch {
    // 同上
  }
}

/** 防重入：某个重置回调若又触发了一次登出，不该把回调链再跑一遍。 */
let ending = false

/**
 * 结束会话：先跑内存重置，再清盘。
 *
 * 唯一调用点是 `authStore.clearAuth`——全仓所有登出路径（登出按钮、401 静默跳转的
 * 十份副本、刷新失败、撤销当前设备、切换服务器）都汇到那一个函数，所以挂在那里
 * 等于挂在每一条路径上，不需要谁去逐条接线。
 *
 * 单个回调抛错不阻断后面的回调，更不阻断清盘：落盘副本是承重的那一半。
 */
export function endSession(): void {
  if (ending) return
  ending = true
  try {
    for (const reset of sessionResets) {
      try {
        reset()
      } catch (error) {
        console.error('[sessionScope] 会话重置回调抛错:', error)
      }
    }
    purgeAccountScopedStorage()
  } finally {
    ending = false
  }
}
