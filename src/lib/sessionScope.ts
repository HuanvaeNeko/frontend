/**
 * 会话结束时清掉「属于这个账号」的一切，只留下「属于这台设备」的东西。
 *
 * ## 什么算「会话结束」，什么不算
 *
 * 这条定义此前没写在任何地方，于是 `refreshAccessToken` 的 catch 把**网络抖一下**
 * 也算成了会话结束——代价是 {@link DEVICE_SCOPED_KEYS} 之外的一切被销毁，包括
 * `api-config-storage` 里那个用户自己敲进去的第三方 `aiApiKey`：只有他知道、
 * 应用无从恢复。两侧的错误代价**不对称**：清少了会泄露给下一个人，清多了会毁掉
 * 一份不可恢复的数据。所以两件事必须分开：
 *
 * - **会话结束**（`authStore.clearAuth` → {@link endSession}）：用户意图明确的三条
 *   ——登出按钮、`DevicesPage` 撤销当前设备、`SettingsPage` 切换/重置服务器——
 *   加上后端**真的**判定凭证无效的那一类（`api/authedFetch.ts` 的 401 分支、
 *   `POST /api/auth/refresh` 回 401）。这一档跑内存重置 + 清盘。
 * - **只是拿不到票据**（`authStore.clearCredentials`）：传输层失败——断网、超时、
 *   502、响应体不是约定的形状。它证明不了"这个账号在这台设备上的会话结束了"，
 *   只证明"这一次请求没成"。这一档只把 token 三件套清空，其余一个字节都不动。
 *
 * 只清凭证之所以**不会**变成泄露口子，是因为下一场会话必须经过
 * {@link beginSession}，而它跑的是和 {@link endSession} 同一套清理——内存重置 +
 * 清盘（见 {@link crossSessionBoundary}）。**代价要说清楚**：第三档保住的那份
 * `aiApiKey` 只活到「下一场会话开始」为止，哪怕下一场会话还是同一个人。
 * 它买到的不是"这个人重新登录后配置还在原处"，而是"网络抖一下**本身**不销毁
 * 任何东西"——销毁被推迟到一个用户看得见、且明确表达了意图的时点（登录）。
 * 这个边界不认人：`beginSession` 拿 `credentials.user_id` 去比对"还是不是同一个人"
 * 是可以做的，但那会把默认清掉换成默认保留，而两侧代价不对称（少清 = 泄露给
 * 下一个人，多清 = 毁一份数据），所以这里选不认。
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
 * ## 不变量：一次写入必须属于**当前活着的那一场会话**
 *
 * 清盘只证明"这一刻盘上没有账号级数据"。会话换人那一刻若有一个请求还在飞
 * （`profileStore.loadProfile`、`friendsStore` / `groupStore` / `chatStore`
 * 的任何一个异步 action、`restoreSession` 里还没回来的那次 `GET /api/session`），
 * 它会在清盘**之后**落地：`set()` 一写，persist 立刻把上一个人的数据重新落盘。
 *
 * BFF 会话层落地后，token 那一半已经不是问题了——客户端手里从此只有一个
 * httpOnly cookie，JS 读不到、也改不了，落盘副本里根本没有"一对刚轮换出来的
 * token 明文躺着"这种东西可泄漏。但**内存里的跨账号状态仍是真问题**：上一个人的
 * profile（`Navigation` 直接拿 `profile.user_avatar_url` 渲染头像）、好友申请
 * 列表、群成员名单、聊天草稿，以及 `apiConfig` 里用户自己敲进去的第三方
 * `aiApiKey`——这些字段不清，下一个人第一屏就可能看见上一个人的头像昵称，
 * AI 请求甚至会替下一个人把上一个人的密钥发出去。这才是这条不变量今天要挡的东西。
 *
 * 要点是这条不变量**不以「会话结束」为轴**。会话结束是一个时点，会话开始是另一个
 * 时点，两者都是**会话边界**，而"这次写入属于哪一场"这个问题在两个边界上是同一个
 * 问题。所以 {@link endSession} 与 {@link beginSession} 共用
 * {@link crossSessionBoundary}：都跑内存重置、都清盘、都换世代号，唯一的差别是
 * 过完之后闸门关着还是开着。曾经只有 `endSession` 换号，于是
 * `clearCredentials`（第三档，不结束会话）之后换一个人登录，上一个人在飞的刷新
 * 落地时 `isSameSession()` 仍然为真，而 `beginSession` 又把闸门重新开了，
 * 那对 token 连盘都落得进去。
 *
 * 三道防线，从自动到需要作者配合：
 *
 * 1. {@link crossSessionBoundary} 的清盘 —— **完全自动，覆盖任何持久化切片**。
 *    每一个会话边界（结束和开始）都要经过它，所以死窗口里漏进盘的东西活不过
 *    下一次登录，作者什么都不用做。同一处还会跑登记过的内存重置，见下。
 * 2. {@link sessionScopedLocalStorage} 的写入闸门 —— 会话结束后、下一场会话开始前，
 *    对账号级键的落盘写入直接丢弃。把它当 persist 的 `storage` 用就自动生效
 *    （本仓四个持久化 store 都已接上），这是把第 1 条的窗口从"到下一次登录为止"
 *    收到"立刻"。
 * 3. {@link currentSessionGeneration} / {@link isSameSession} / {@link pinSession}
 *    —— **内存**那一半只能显式做：异步 action 在发起时钉住当时那一场会话，落地前
 *    对照，不一致就丢弃。闸门拦不住内存（`useAuthStore.getState().accessToken`
 *    照样被写脏，而 API 层读的是内存），世代号也拦不住"写入之外的副作用"：
 *    上一场会话的 401 回来时去调当前这个人的 `clearAuth()`，破坏力比写脏内存更大，
 *    那条同样要用 {@link pinSession} 钉住。
 *
 *    ⚠️ **第 3 道和第 1 道不一样：它没有任何自动性，漏接一个 action 就是一个洞。**
 *    第 1 道遍历 `localStorage` 的全部键，作者什么都不做也覆盖得到；这一道要
 *    一个 action 一个 action 地接。今天接了的全部在这里（改的时候一起改）：
 *
 *    - **异步 action 的写入**：`authStore.refreshAccessToken`（`performRefresh`
 *      两处对照）、`profileStore` 三个（`sessionBound()` / `stillMine()`）、
 *      `friendsStore` 七个、`groupStore` 五个、`chatStore.syncMessages`。
 *      后三个 store 是 2026-09-08 才接的。**它们的暴露程度不一样，别一概而论**：
 *      `friendsStore` 的 `friends` / `pendingRequests` / `sentRequests` 与
 *      `groupStore` 的 `myGroups` / `selectionError` 今天就被 `FriendList.tsx` /
 *      `GroupList.tsx` 渲染，是**活的**（A 的申请人 ID、昵称、申请留言，
 *      A 的群名与群里最后一条消息的正文，会出现在 B 的侧栏上）；
 *      `groupStore.currentGroupMembers` / `currentGroupNotices` 今天零渲染点，
 *      `chatStore.syncMessages` 因为 `conversations` 恒为 `[]` 连请求都发不出去
 *      ——这两处是**潜在的**，守卫为接线补上的那天准备。
 *    - **写入之外的副作用**：`api/authedFetch.ts` 的 401 分支
 *      （`refreshAccessToken()` + `clearAuth()` + 跳登录页）。十份副本已合并成
 *      这一份，闸也补到了三处；用例见该文件 `fetchWithAuth` 的注释；
 *      `friendsStore.handleApiError` 走的是同一条（它会 `silentRedirectToLogin()`），
 *      所以那七个 catch 在调它**之前**先对照世代号。
 *
 *    ⚠️ **上面那张单子是"接了哪些"，不是"全覆盖"。** 截至 2026-09-08 已知还没接的
 *    三处，写在这里免得下一个人把它读成后者：
 *
 *    - `store/wsStore.ts` 的 `scheduleReconnect`：`await refreshAccessToken()`
 *      之后成功分支 `set({reconnectAttempts:0, reconnecting:false})` + `get().connect()`，
 *      失败分支 `set({reconnecting:false})`。退避重连的那个 `setTimeout` 被边界
 *      回调里的 `disconnect()` 挡住了（清定时器 + 递增 `activeWsId`），
 *      但**这个 await 的续体挡不住**：A 的重连在 B 的会话里落地，会写 B 的重连状态
 *      并替 B 建一条他没要求的连接。
 *    - `features/chat/components/ChatWindow.tsx`：`setMessages` / `prependMessages` /
 *      `addMessage` / `updateLastMessage` 全是 `chatStore` 的 action，而四个异步
 *      回调（首屏加载、`loadMoreMessages`、`handleSendMessage`、`handleSendFile`，
 *      以及删除/撤回后那两次 `setMessages`）都在 `await` **之后**调它们。
 *      组件会因为跳登录页而卸载，但卸载**不取消 promise**，写的又是 store 而不是
 *      组件局部状态——A 的消息正文会落进 B 的 `chatStore.messages`。
 *      这一处比本文件覆盖的三个 store 更靠外：守卫要么下沉进 store 的那几个
 *      同步 action（它们今天没有异步边界可钉），要么在组件里各钉一次。
 *
 *    两处**看起来**危险但今天不是的，一并记下来免得重复排查：
 *    `ProfilePage` / `ProfileModal` 在 `await profileApi.uploadAvatar(...)` 之后
 *    调 `setAvatarUrl(file_url)`，而那个 action 开头就是 `if (!currentProfile) return`
 *    ——跨过边界后 `profile` 已经是 `null`，写不进去；
 *    `FriendList.handleDeleteFriend` 的 `setSelectedConversation(null)` 外面套着
 *    `if (selectedConversation?.id === friendUserId)`，边界之后同样恒假。
 *    两者都是**结构上恰好**安全，不是钉过世代号，改动它们时这个性质会悄悄消失。
 *
 * ## 内存副本
 *
 * 落盘副本是本模块的承重件；内存副本由 {@link registerSessionReset} /
 * {@link registerPristineStoreReset} 登记，{@link crossSessionBoundary} 在清盘
 * **之前**跑它们（顺序见那里）。内存这一半做不到"默认覆盖"——没有一个枚举得到
 * 所有 zustand store 的入口——所以它仍然是一张需要维护的名单，**漏登记一个 store
 * 就是一次泄露**：`beginSession` 的清盘覆盖不了它，那是落盘那一半的自动性，
 * 内存这一半没有。
 *
 * 名单漏登记的后果曾被"反正会整页加载"打了折扣，那个理由已经不成立：
 * `wsStore.scheduleReconnect` 的失败分支现在完全不跳转，`ProtectedRoute` 用的是
 * `router.replace`（`lib/navigation.ts`，react-router 客户端跳转），两条路都不
 * 丢内存。仍然整页加载的是两个 store 各自的 `silentRedirectToLogin`
 * 与 `api/authedFetch.ts` 401 分支里的 `window.location.href`、
 * 以及 `SettingsPage` 切换/重置服务器。
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
   * ⚠️ 已退役（Task 12）：`apiConfig.getApiBaseUrl()` 现在是硬编码的空串，
   * 没有任何代码再往这个键写东西了——「切换服务器」连同 `setApiBaseUrl` /
   * `clearApiBaseUrl` 已经整个删除。留着这一条不是因为它还有效，是因为它是
   * `sessionScope.test.ts` / `sessionHandoff.test.tsx` 里"设备级键"的示例键，
   * 删掉这一条要连着把那些用例改成认另一个键，得不偿失。
   *
   * 原始理由存档：这台设备连哪个后端。本项目曾经**故意**改基址（`api.huanvae.cn`
   * 被备案拦截时走本地无 SNI 反代），清掉等于每次登出都把开发通道退回默认域名。
   */
  ['huanvae.api-base-url', { keep: 'whole' }],

  /**
   * GitHub release 资产列表的本地缓存，自带 `expiresAt`，内容是**公开**数据，
   * 不与任何用户关联（`lib/appInstall.ts`）。
   */
  ['huanvae.install-targets.latest', { keep: 'whole' }],

  /**
   * 「记住我」勾选后落下的登录名（`LoginForm`）。
   *
   * ⚠️ **这一条是本表里唯一一条明知会泄露、仍然留下的**：共用设备上，上一个人的
   * 账号 ID 会在下一个人打开登录页时**已经填在用户名框里、勾选框已经打勾**，
   * 他还没来得及做任何事就看到了。只读扫描把它判成 `privacy_leak` 是对的，
   * 这里不假装它没有代价。
   *
   * 仍然留下的理由只有一条，而且是结构性的：它唯一的读取点就在**下一次登录的
   * 表单里**（`LoginForm` 顶部那段 `localStorage.getItem(REMEMBER_USER_KEY)`），
   * 登出时清掉它，等于这个功能永远不可能生效——写进去的值从来活不到被读的那一刻，
   * 那段读取分支成为死代码。也就是说这里没有"既保留功能又不泄露"的第三种写法：
   * 要么承认这个泄露，要么**删掉这个功能连同勾选框**。
   *
   * 判断落在"用户显式勾选过"这一点上：泄露的是他自己按下的按钮的直接后果，
   * 范围也仅限一个账号 ID（不是凭证，登不进任何东西）。要改这个取舍，改的是
   * `LoginForm`（删功能），不是这张表——把键留在写入端却在登出时清掉，
   * 得到的是"功能坏了"而不是"泄露没了"。
   */
  ['huanvae-remember-user_id', { keep: 'whole' }],

  /**
   * 这台设备的音量与静音。读取点是 `hooks/useSound.ts` 的 `SoundManager`
   * **构造函数**，而那个单例由 `getSoundManager()` 在第一次播放/读设置时**懒建**
   * ——不是模块初始化时读，所以登出后不重新加载页面的话，已经建好的单例不会
   * 重新读盘，这两个键的值只影响**下一个**被建出来的单例。
   * 与 `app-settings` 的 `soundEnabled` / `soundVolume` 是同一件事的第二份拷贝，
   * 两边的设备级判断必须一致，否则登出后音量会跟着哪一份先被读到而抖动。
   */
  ['sound_enabled', { keep: 'whole' }],
  ['sound_volume', { keep: 'whole' }],

  /**
   * 侧栏工具的钉住布局（`components/shell/sidebarLayout.ts`）。这是**这台机器**上
   * 的排版偏好，不含任何账号数据——和 APP 一样按设备保存（spec §5）；登出清掉它
   * 等于每次换号都把用户拖好的侧栏打回默认。
   */
  ['huanvae.sidebar-layout', { keep: 'whole' }],

  ['app-settings', { keep: 'zustandFields', fields: DEVICE_SCOPED_SETTING_FIELDS }],
])

/** 登记在案的内存重置回调。 */
const sessionResets = new Set<() => void>()

/**
 * 登记一个"跨过会话边界时把内存状态清干净"的回调。返回注销函数（测试用）。
 *
 * ⚠️ **两个边界都跑**：{@link endSession}（会话结束）和 {@link beginSession}
 * （下一场会话开始）。只挂在结束那一侧是不够的——`clearCredentials` 这一档
 * 按定义就不结束会话，它留在内存里的东西（`useApiConfigStore` 的明文
 * `aiApiKey`、`useProfileStore` 的资料）没有任何东西会去清，直到下一个人登录。
 * 所以回调必须是**幂等**的：同一场登出→登录里它会被跑两次。
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

/**
 * 会话世代号：每跨过一个会话边界 +1——**结束一场**和**开始一场**都算。
 *
 * 只增不减、不落盘：它要回答的问题是"我发起这次请求时的那场会话，还是现在这一场吗"，
 * 跨页面加载没有意义（整页加载本身就把内存状态全丢了）。
 *
 * 「开始也换号」不是对称性洁癖：`clearCredentials`（第三档）结束的是凭证而不是
 * 会话，它不经过 {@link endSession}，于是**只在结束时换号**的话，A 的会话号会一路
 * 活到 B 登录之后——A 在飞的刷新落地时 `isSameSession()` 判真，`set()` 把一对
 * 当前有效的 token 写进 B 的 store，`beginSession` 又刚好把闸门开着，连盘都落得进去。
 */
let sessionGeneration = 0

/**
 * 死窗口标记：{@link endSession} 之后、{@link beginSession} 之前为 `true`。
 *
 * 初值 `false` 是有意的：整页加载时本模块重新初始化，此时并没有"刚结束的会话"——
 * 用户可能正带着 rehydrate 出来的有效 token 回来。把初值写成 `true` 会让
 * 每次刷新页面后的第一次落盘写入被闸门吃掉。
 */
let inDeadWindow = false

/**
 * 当前会话的世代号。异步 action 在**发起时**取一次，落地前用 {@link isSameSession} 对照。
 *
 * 用法（`authStore.refreshAccessToken` / `profileStore.loadProfile` 都是这个形状）：
 *
 *     const session = currentSessionGeneration()
 *     const data = await fetch(...)
 *     if (!isSameSession(session)) return   // 会话结束了，这份数据属于上一个人
 *     set({ ... })
 */
export function currentSessionGeneration(): number {
  return sessionGeneration
}

/** `generation` 是否仍是当前这一场会话（即中途没有跨过会话边界）。 */
export function isSameSession(generation: number): boolean {
  return generation === sessionGeneration
}

/**
 * 钉住"现在这一场会话"，返回的谓词回答"它还活着吗"。
 *
 * {@link currentSessionGeneration} + {@link isSameSession} 的两行版，给**同步发起、
 * 异步落地**的调用点用——尤其是各份 `fetchWithAuth` 的 401 分支：它们在请求发起时
 * 快照了 `useAuthStore.getState()`，但手里攥着的 action 闭包是**活的**，响应回来时
 * 调到的是当前那个人的 `refreshAccessToken()` / `clearAuth()`。接入方式是一行：
 *
 *     const isLiveSession = pinSession()          // 请求发起时
 *     ...
 *     if (response.status === 401 && isLiveSession()) { ...刷新重试... }
 *
 * 判假时正确的做法是**什么都不做**（把 401 原样交给调用方），而不是降级成别的
 * 清理动作：这条响应属于一场已经不存在的会话，它对当前这场会话不构成任何证据。
 */
export function pinSession(): () => boolean {
  const pinned = sessionGeneration
  return () => pinned === sessionGeneration
}

/**
 * 现在是不是一场**进行中**的会话（即不在 {@link endSession} 与 {@link beginSession}
 * 之间的死窗口里）。
 *
 * 给"必须在会话内才有意义"的写入点自检用（`authStore.setTokens`）：死窗口里写内存
 * 会成功、写盘会被闸门丢掉，得到的是"内存说已登录、盘上说已登出"的半截状态，
 * 下一次整页加载把人登出，而中间没有任何一处报错。
 */
export function isSessionLive(): boolean {
  return !inDeadWindow
}

/**
 * 账号级键在**死窗口**里的落盘写入是否放行。
 *
 * 设备级键任何时候都放行——它们本来就该跨会话活着，而且登出后的登录页上用户
 * 照样会切主题、调音量。
 */
function isWriteAllowed(key: string): boolean {
  return !inDeadWindow || DEVICE_SCOPED_KEYS.has(key)
}

/**
 * `zustand/persist` 的 `storage`：带会话闸门的 `localStorage`。
 *
 * 与裸 `localStorage` 的唯一差别在 `setItem`：会话已经结束、下一场还没开始时，
 * 账号级键的写入被**丢弃**（并把该键从盘上抹掉，防止写入前它还在）。这拦的是
 * 「登出那一刻还在飞的请求回来了，persist 把上一个人的数据重新落盘」——刷新那条
 * 落回去的是一对当前有效的 token。
 *
 * `app-settings` 这类字段级设备键放行后立刻按 {@link DEVICE_SCOPED_SETTING_FIELDS}
 * 重新裁一遍：登录页上改主题必须能存下来，但同一次写入里夹带的账号级字段不能。
 *
 * ⚠️ 闸门只管**落盘**。内存里的 `getState()` 照样会被写脏，而 API 层读的是内存——
 * 内存那一半必须由 action 自己用 {@link currentSessionGeneration} 挡，见本文件顶部。
 */
export const sessionScopedLocalStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return
    try {
      if (!isWriteAllowed(name)) {
        console.warn(`[sessionScope] 会话已结束，丢弃对 ${name} 的落盘写入`)
        window.localStorage.removeItem(name)
        return
      }
      window.localStorage.setItem(name, value)
      const rule = DEVICE_SCOPED_KEYS.get(name)
      if (inDeadWindow && rule !== undefined && rule.keep === 'zustandFields') {
        keepOnlyFields(window.localStorage, name, rule.fields)
      }
    } catch {
      // ignore：Safari 隐私模式等场景下 storage 访问本身会抛
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(name)
    } catch {
      // ignore
    }
  },
}

/** 防重入：某个重置回调若又跨了一次会话边界，不该把回调链再跑一遍。 */
let crossingBoundary = false

/**
 * 跨过一个会话边界：先跑内存重置，再清盘，最后设置闸门 + 递增世代号。
 *
 * {@link endSession} 与 {@link beginSession} 共用这一段，两者**唯一**的差别是
 * `nextIsDead`——过完之后闸门是关着（会话结束了，没有下一场）还是开着（新会话
 * 开始了）。写成一段而不是两段，是因为"这次写入属于哪一场会话"在两个边界上是
 * 同一个问题：只在结束那一侧清理，`clearCredentials` 留下的内存副本就没有任何
 * 东西会去动它，而世代号也会一路活到下一个人的会话里。
 *
 * 顺序不能改：
 * 1. 重置回调先跑，它们对 persist store 的写入照常落盘（`beginSession` 这一侧
 *    闸门可能还关着，那就直接被丢弃，效果一样）；
 * 2. 清盘把这些写入连同其余账号级键一起删掉；
 * 3. 最后才动闸门与世代号——放在第 1 步之前的话，`endSession` 这一侧重置回调
 *    自己的落盘写入会被闸门吃掉，行为虽然也对（第 2 步照样会删），但把"闸门"
 *    和"清盘"两件事的因果搅在一起，出问题时分不清是谁干的。
 *
 * 单个回调抛错不阻断后面的回调，更不阻断清盘：落盘副本是承重的那一半。
 * 防重入的 `return` 放在最前面，所以嵌套那一次**整体**是空操作——世代号也不会
 * 多跳一格，否则一次登出会按回调里嵌套了几层而换出不同的号。
 */
function crossSessionBoundary(nextIsDead: boolean): void {
  if (crossingBoundary) return
  crossingBoundary = true
  try {
    for (const reset of sessionResets) {
      try {
        reset()
      } catch (error) {
        console.error('[sessionScope] 会话重置回调抛错:', error)
      }
    }
    purgeAccountScopedStorage()
    inDeadWindow = nextIsDead
    sessionGeneration += 1
  } finally {
    crossingBoundary = false
  }
}

/**
 * 结束会话：跨过会话边界，过完之后闸门关着。
 *
 * 唯一调用点是 `authStore.clearAuth`。**注意这句话只覆盖"入口"这一半**：全仓所有
 * 登出路径（登出按钮、`authedFetch` 的 401 跳转、刷新的 401、撤销当前设备、切换服务器）
 * 确实都汇到那一个函数，所以不需要谁去逐条接线；但落盘副本在这一刻**还没有定局**
 * ——飞在半空的请求会在清盘之后落地。补上那一半的是闸门与世代号，见本文件顶部
 * 「不变量：一次写入必须属于当前活着的那一场会话」。
 */
export function endSession(): void {
  crossSessionBoundary(true)
}

/**
 * 开始一场新会话：跨过会话边界，过完之后闸门开着。
 *
 * 唯一调用点是 `authStore.login` 的成功分支，且在 `set()` **之前**——反过来的话
 * 这次清理会把刚落盘的新 token 一起删掉。
 *
 * **不**挂在 `setTokens` 上：那个函数今天零调用点，而它的名字是「设置 token」，
 * 将来最可能的调用形态是"会话中途换一对新 token"，在那里清盘会把同一个人的
 * profile / AI 配置一起毁掉。`login` 是全仓唯一能证明"这是一场新会话"的地方
 * （它手里有 `credentials.user_id`）。`setTokens` 在死窗口里的那半截状态由它
 * 自己用 {@link isSessionLive} 自检，不靠这里兜。
 *
 * ## 为什么这里也要清一次
 *
 * 落盘那一半是三道防线里**唯一完全自动**的一道：将来某个持久化切片没有走
 * {@link sessionScopedLocalStorage}（比如作者直接 `localStorage.setItem`），它在死窗口
 * 里漏下的东西闸门管不着，但下一场会话无论如何都要经过这一行。也就是说"上一个人的
 * **落盘**数据活到下一个人的会话里"这件事，作者什么都不做也不会发生。
 *
 * ⚠️ 内存那一半**没有**这个自动性：它只覆盖 {@link registerSessionReset} 登记过的
 * store，漏登记一个就是一次泄露。这里跑它们，补的是"`clearCredentials` 之后
 * 没有任何东西会去清内存"这个洞——`clearCredentials` 是靠这一行才敢存在的，
 * 而在这一行只清盘不清内存的时候，它那句"下一个人的会话必经 `beginSession`"
 * 对落盘副本成立、对内存副本不成立。
 */
export function beginSession(): void {
  crossSessionBoundary(false)
}
