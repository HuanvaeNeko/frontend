import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthStore, LoginRequest, RegisterRequest, User } from '../types/auth'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { assertEnvelopeOk, readEnvelope } from '@/lib/apiEnvelope'
import { beginSession, endSession, sessionScopedLocalStorage } from '@/lib/sessionScope'

/**
 * 落盘格式版本。`1` = `user.avatar_url` 是**绝对地址**；`2` = 落盘里**没有 token**。
 *
 * - `0 → 1`：`main` 上写的是 `avatar_url: data.avatar_url`，也就是后端原样给的
 *   **相对路径**（`backend-docs/profile/个人资料管理.md:98`：
 *   「`user_avatar_url` | string\|null | 头像相对路径（需拼接 `STORAGE_BASE_URL`）」，
 *   样例见 :74 `"user_avatar_url": "avatars/testuser001.jpg?t=1706000000"`），
 *   本分支才改成 `toAbsoluteApiUrl(...)`。`auth-storage` 此前没有 version 也没有
 *   migrate，旧的 `refreshAccessToken` 又从不重写 `user`，所以**每一个已部署用户**
 *   的落盘值都会一直是相对路径。
 * - `1 → 2`：BFF 会话层落地，客户端不再持有 `accessToken` / `refreshToken` /
 *   `tokenExpiry`。已部署用户的盘上此刻还躺着一对**真实可用**的 JWT——这不是
 *   "以后不再写"，是"现在就要把已经写下去的删掉"，所以必须真的走一次 migrate，
 *   不能只改 `partialize` 不管存量数据。
 */
const AUTH_PERSIST_VERSION = 2

/**
 * 把落盘的旧值搬到当前格式：只做一件事——`user.avatar_url` 补基址。
 *
 * ## 为什么值得迁移（以及一条曾经写在这里的**错误**理由）
 *
 * 本仓的约定是「头像路径在 api 出口一次性补成绝对地址」：`friends.ts` 的三个
 * `absoluteAvatar`、`groups.ts` / `discovery.ts` / `profile.ts` 的出口都这么做，
 * 于是所有 store 里的 `*_avatar_url` 都是绝对地址，渲染点直接用。`user.avatar_url`
 * 走的是同一条约定，迁移让**已经落盘的旧值**也回到这个不变量上，
 * 免得"store 里的头像字段都是绝对的"这句话有一个例外。
 *
 * ⚠️ 此处**曾经**写着另一条理由：「`VideoMeeting` 把 `user?.avatar_url` 直接发给
 * 后端当会议头像，所以必须在源头改成绝对地址」。那条理由是反的——
 * `POST /api/webrtc/rooms/{room_id}/join` 的请求体字段
 * (`backend-docs/webrtc/WebRTC房间.md:154`) 逐字写着
 * `"avatar_url": "avatars/guest.png?t=1706000000"  // 可选，头像相对路径`，
 * 创建房间同样（:72）。发绝对地址才是违约，而且基址被指向本地反代时发出去的会是
 * `http://127.0.0.1:8787/...`，后端原样转给房间里每一个人（:181 / :265 / :302）。
 * 那个发送点现在自己把值转回相对路径（见 `VideoMeeting` 的 `toApiRelativePath`），
 * 两边各按各的契约来，谁都不依赖对方的形状。
 *
 * ## 只搬 `avatar_url`
 *
 * `nickname` / `email` 的形状同样漂移过（`main` 写 `data.nickname || ''`，
 * 曾经的登录响应归一化把 `''` 也当成"没有值"归一成 `undefined`），但那是
 * **观测不到**的漂移：
 * 全部消费点都是 `||` 兜底（`MessageItem` 的 `user?.nickname?.[0] || 'U'`、
 * `VideoMeeting` 的 `user?.nickname || '访客'`、`Navigation` 的首字母块），
 * `''` 和 `undefined` 一样落到兜底分支。给它写迁移，只能断言迁移函数自己的输出，
 * 那是一句同义反复，钉不住任何行为。
 *
 * `toAbsoluteApiUrl` 幂等（已带协议的原样返回），对已经绝对的值是 no-op；
 * `''` → `undefined`，也就是"没有头像"，正是 `User.avatar_url` 可选的含义。
 * 形状不认识时（没有可识别的 `user`）不编造一个 —— 但下面这一步的 token 剔除
 * 不受这条限制，见下。
 *
 * ## token 字段是**无条件**剔除的，不是"不再读它们"
 *
 * 已部署用户的盘上此刻躺着一对真实可用的 `accessToken` / `refreshToken`
 * / `tokenExpiry`——JWT 留在 localStorage 里正是 BFF 会话层要消灭的东西，
 * 迁移必须真的把它删掉，而不是等它们自然过期。这一步不看 `user` 长什么样：
 * 哪怕落盘数据里根本没有 `user`（还没登录过就升级了客户端），三个 token 字段
 * 只要存在也照删。
 *
 * ⚠️ **`persisted` 的实参形状：这里收到的是裸 `state`，不是 `{state, version}`。**
 * zustand 5.0.15 的 `persistImpl`（`node_modules/zustand/middleware.js`）在调
 * `migrate` 之前已经把 `{state, version}` 信封拆开，调用点是
 * `options.migrate(deserializedStorageValue.state, deserializedStorageValue.version)`
 * ——传的是 `.state`，`version` 是**第二个参数**，不是同一个对象上的兄弟字段。
 * 包一层 `{state, version}` 再传进来"看起来"更像落盘格式，实际会让这个函数在
 * 真实 rehydrate 路径上读到 `wrapper.state === undefined`、整个函数退化成
 * no-op——已部署用户那对真实可用的 token 一个都不会被删掉，而且不会有任何报错，
 * 是最难查的那类故障。`authStore.test.ts`「rehydrate 时真的被 persist 调用」
 * 那条用例走的是真实 `persist.rehydrate()`，就是为了把这一类"实参形状假设错误"
 * 挡在测试里，而不是留到生产环境的存量用户身上。
 */
export function migrateAuthPersist(persisted: unknown): unknown {
  if (typeof persisted !== 'object' || persisted === null) return persisted
  // 显式剔除，不是「不再读它们」：JWT 留在 localStorage 里正是这一批要消灭的东西。
  // 已部署用户的盘上有一对真实可用的 token，迁移必须真的删掉它——这一步无条件
  // 执行，不依赖下面 `user` 是否存在或长什么样。
  const { accessToken: _a, refreshToken: _r, tokenExpiry: _t, ...rest } = persisted as Record<string, unknown>

  const user = rest.user as { avatar_url?: unknown } | null | undefined
  if (!user || typeof user !== 'object') return rest

  return { ...rest, user: { ...user, avatar_url: toAbsoluteApiUrl(user.avatar_url as string | null | undefined) } }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isRestoring: false,
      error: null,

      login: async (credentials: LoginRequest) => {
        // 打的是**同源** BFF，不是后端。BFF 会 Set-Cookie，浏览器手里从此
        // 只有一个 httpOnly cookie —— 它读不到、JS 拿不到、也塞不进 URL。
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: credentials.user_id, password: credentials.password }),
        })

        // device_info 由 BFF 用请求的 User-Agent 填 —— 浏览器侧唯一有意义的
        // 设备标识就是它，客户端不必再传。
        const data = await readEnvelope<{ user: User }>(response, {
          endpoint: 'POST /api/auth/login',
          fallbackMessage: '登录失败',
          parse: { parse: (input) => {
            const record = input as { user?: unknown } | null
            const user = record && typeof record === 'object' ? record.user : null
            if (!user || typeof user !== 'object' || typeof (user as User).user_id !== 'string') {
              throw new Error('user 缺失或不是对象')
            }
            return { user: user as User }
          } },
        })

        // 新会话从这一行开始，必须在 set() 之前：beginSession 开场就清盘
        beginSession()

        set({
          // avatar_url 在这里补基址，与 friends / groups / discovery / profile
          // 四个 api 出口的 `absoluteAvatar` 是同一条约定：**store 里的头像字段
          // 一律是绝对地址**，渲染点直接用。见 `toAbsoluteApiUrl` 的 JSDoc。
          user: { ...data.user, avatar_url: toAbsoluteApiUrl(data.user.avatar_url) },
          isAuthenticated: true,
          error: null,
        })
      },

      register: async (data: RegisterRequest) => {
        // 同源。注册**不建会话** —— 后端注册接口不返回 token，成功后仍要走一次登录，
        // 现有 RegisterForm 的「注册成功 → 跳登录页」流程不变。
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: data.user_id, nickname: data.nickname, email: data.email, password: data.password,
          }),
        })
        await assertEnvelopeOk(response, { endpoint: 'POST /api/auth/register', fallbackMessage: '注册失败' })
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
        } catch {
          // BFF 不可达不能阻止本地登出：用户点了登出就该登出
        }
        get().clearAuth()
      },

      /**
       * 启动时问 BFF「我登录了吗」。这是**唯一真值** —— 落盘的那份 `user` 只用于
       * 首帧把头像昵称画出来，永远不当授权依据。
       *
       * 401 = 未登录。**502 / 网络失败 ≠ 未登录** —— 后端挂了不等于用户退出了，
       * 那时保持上一次状态、记一个可重试的错误，不清盘不跳登录。这是 P4b 那条
       * 「传输失败 ≠ 会话结束」在客户端侧的镜像。
       */
      restoreSession: async () => {
        set({ isRestoring: true, error: null })
        try {
          const response = await fetch('/api/session', { credentials: 'same-origin' })

          if (response.status === 401) {
            get().clearAuth()
            set({ isRestoring: false })
            return
          }

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null
            set({ isRestoring: false, error: body?.error ?? '无法确认登录状态，请稍后重试' })
            return
          }

          const body = (await response.json()) as { data?: { user?: User } }
          const user = body.data?.user
          if (!user || typeof user.user_id !== 'string') {
            set({ isRestoring: false, error: '会话响应形状不符合预期' })
            return
          }

          set({
            user: { ...user, avatar_url: toAbsoluteApiUrl(user.avatar_url) },
            isAuthenticated: true,
            isRestoring: false,
            error: null,
          })
        } catch {
          // 网络失败：同 502，保持状态
          set({ isRestoring: false, error: '无法确认登录状态，请稍后重试' })
        }
      },

      /**
       * 结束会话。全仓**唯一**的清理原语：登出按钮、`api/authedFetch.ts` 那份
       * `fetchWithAuth` 的 401 跳转（非业务 401）、`restoreSession` 的 401 分支、
       * `wsStore.scheduleReconnect` 给上重连后 `restoreSession` 判定确实掉线、
       * 撤销当前设备、切换服务器——每一条路径最后都走到这里
       * （`grep -rn 'clearAuth()' src`）。
       *
       * 会话制下它只做两件事：
       * 1. `set()` 清 `user` / `isAuthenticated` / `error`——没有 token 三件套
       *    可清了，这就是内存这一半的全部；
       * 2. `endSession()`：跨过会话边界，清掉这个账号名下其余的落盘/内存副本
       *    （profile / AI 密钥 / 上次访问路径……，反向名单见 `lib/sessionScope.ts`），
       *    并把写入闸门关上、世代号 +1。
       *
       * 顺序是有意的：先 `set()` 让 persist 把 `auth-storage` 写成只剩
       * `user: null`（`partialize` 不落盘 `isAuthenticated`，见下方 persist 配置），
       * 再 `endSession()` 把这个键连同其它账号级键一起删掉。反过来的话，
       * persist 的这次写入会在清盘之后重新落一个键。
       *
       * ⚠️ 「挂在这一行 = 挂在全部路径上」这句话只对**入口**成立。落盘副本在这一刻
       * 还没有定局：登出时还在飞的请求会在清盘之后落地，`set()` 一写 persist 就把
       * 上一个人的数据重新写回盘上。补上那一半的是 `sessionScope` 的写入闸门与世代号
       * （`sessionScopedLocalStorage`），不是这一行。
       *
       * ⚠️ 反过来也成立：**这一行本身可能是上一场会话的请求触发的**——
       * `fetchWithAuth` 在请求发起时快照了 `useAuthStore.getState()`，但手里的
       * action 闭包是活的，于是 A 登出前发出的请求若在 B 的会话里才收到 401，
       * 调到的会是 B 的 `clearAuth()`。Task 11 之后这条路径**不再被挡**（同源裸
       * fetch 见到非业务 401 就清，不再按会话世代号分诊）——窗口只有一次请求的
       * 飞行时间，是接受的代价，不是这里要挡的，见 `api/authedFetch.ts` 顶部说明。
       *
       * 它清的是**这个账号的其余落盘副本**（profile / AI 密钥 / 上次访问路径 /
       * 以及将来任何新增的切片），名单是反向的：不在设备级白名单里的键一律删。
       */
      clearAuth: () => {
        set({ user: null, isAuthenticated: false, error: null })
        endSession()
      },
    }),
    {
      name: 'auth-storage',
      // 带会话闸门的 localStorage（`lib/sessionScope.ts`）：SSR / Safari 隐私模式的
      // try-catch 与原来那份 `safeStorage` 逐字相同，多的是「会话结束后、下一场开始前，
      // 对 auth-storage 的写入一律丢弃」——登出那一刻还在飞的请求回来时，persist
      // 会把上一个人的数据重新落盘，闸门拦的就是它。
      storage: createJSONStorage(() => sessionScopedLocalStorage),
      // 只落 `user`：它只用于首帧渲染头像昵称，不当授权依据。`isAuthenticated`
      // **不**落盘——它由 `restoreSession` 决定，落盘会让「盘上说已登录、实际
      // cookie 已过期」这种半状态复活（下一次整页加载会短暂显示已登录内容，
      // 直到 `restoreSession` 的 401 分支追上来才纠正）。
      partialize: (state) => ({ user: state.user }),
      version: AUTH_PERSIST_VERSION,
      migrate: migrateAuthPersist,
    }
  )
)
