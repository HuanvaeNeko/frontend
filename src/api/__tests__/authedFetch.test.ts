import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { fetchWithAuth } from '../authedFetch'
import { useAuthStore } from '@/features/auth/store/authStore'
import { ROUTES } from '@/lib/routes'

/**
 * ⚠️ sessionScopedFetchWithAuth.test.ts 已删除。它钉的是「十份 fetchWithAuth
 * 副本各自带 isLiveSession() 闸门」——那个问题的成因(客户端持有 token、会在
 * 会话边界上刷新与清盘)在 BFF 落地后不存在了：现在客户端不刷新、不持 token，
 * 401 只做「清本地态 + 跳登录」。代价不止「多跳一次登录页」：A 登出前发出、在
 * B 登录后才落地的那个 401，会照样跑 `clearAuth()` → `endSession()` → 反向
 * 名单清盘，连 B 自己刚敲进去的 `aiApiKey`（经 `apiConfig.ts` 的
 * `resetToDefault()`）都会被一起清掉——窗口只有一次请求的飞行时间（横跨
 * A 登出到 B 登录那一段），这是接受的代价，不是被挡住的。
 */

let fetchMock: ReturnType<typeof vi.fn>
let hrefSpy: Mock<(value: string) => void>

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  hrefSpy = vi.fn()
  vi.spyOn(window.location, 'href', 'set').mockImplementation(hrefSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('带 credentials: same-origin，不带 Authorization 头', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await fetchWithAuth('/api/friends', { headers: { 'X-Probe': '1' } })
  const init = fetchMock.mock.calls[0][1] as RequestInit
  const h = new Headers(init.headers)
  expect(init.credentials).toBe('same-origin')
  expect(h.get('x-probe')).toBe('1') // 正对照：调用方的头真的到达了 fetch，不是白测
  expect(h.has('authorization')).toBe(false)
})

it('JSON 写请求带 Content-Type: application/json，调用方的头可以覆盖它', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await fetchWithAuth('/api/friends/requests', { method: 'POST', body: '{}' })
  expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('content-type')).toBe(
    'application/json',
  )

  // 调用方显式指定时默认值必须让路——不是「不管调用方说什么都是 application/json」。
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
  await fetchWithAuth('/api/friends/requests', {
    method: 'POST',
    body: 'plain',
    headers: { 'Content-Type': 'text/plain' },
  })
  expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get('content-type')).toBe(
    'text/plain',
  )
})

it('普通端点 401：clearAuth 并跳登录页', async () => {
  useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
  fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
  await fetchWithAuth('/api/friends')
  expect(useAuthStore.getState().isAuthenticated).toBe(false)
  expect(hrefSpy).toHaveBeenCalledWith(ROUTES.auth.login)
})

it('业务 401 端点（改密）401：不 clearAuth、不跳转', async () => {
  useAuthStore.setState({ user: { user_id: 'alice' }, isAuthenticated: true })
  fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
  await fetchWithAuth('/api/profile/password', { method: 'PUT' })
  // 正对照在上一条：普通端点确实会跳。所以这里的「没跳」有意义
  expect(useAuthStore.getState().isAuthenticated).toBe(true)
  expect(hrefSpy).not.toHaveBeenCalled()
})

it('**只发一次请求**：没有刷新重试（重试 = 重放非幂等请求）', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"code":401}', { status: 401 }))
  await fetchWithAuth('/api/profile', { method: 'PUT', body: '{}' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

/**
 * 上面那几条守的是**行为**。这一条守的是**结构**：全仓只允许存在一处
 * `fetchWithAuth` 定义。搬自已删除的 `sessionScopedFetchWithAuth.test.ts`
 * （见该文件末尾同名 describe，`review-0fe437f..e64eb88.diff` 的 `-` 行）——
 * 那次删除的理由只对文件里 `describe.each(COPIES)` 那组成立，对这条不成立：
 * 它钉的是一条与 BFF 无关的结构不变量，删掉之后全仓没有任何测试再扫描源码。
 *
 * 漂移就是这么发生的：十份副本不是一次写出来的，是一个模块一个模块抄出来的，
 * 而抄的那一刻没有任何东西会红。
 */
describe('合并之后全仓只剩一份 fetchWithAuth', () => {
  // vitest 从仓库根运行（`vitest.config.ts` 就在根上）。
  const SRC = join(process.cwd(), 'src')

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        return entry === '__tests__' ? [] : sourceFiles(full)
      }
      return /\.tsx?$/.test(entry) ? [full] : []
    })

  it('`const fetchWithAuth =` 只出现在 api/authedFetch.ts 一个文件里', () => {
    const definers = sourceFiles(SRC)
      .filter((file) => /\bconst fetchWithAuth\s*=/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .sort()

    // 合并前这里是十个文件（apiClient / auth / profile / friends / messages /
    // groupMessages / groups / webrtc / storage / discovery）。
    expect(definers).toEqual(['api/authedFetch.ts'])
  })

  it('正对照：扫描确实看得见源码（否则上一条在扫了个空目录时也会绿）', () => {
    // 上一条断言的是一个"只有一项"的集合，而扫不到任何文件时它会退化成
    // `[] !== ['api/authedFetch.ts']` —— 那当然会红。真正危险的是反过来：
    // 正则永远匹配不上（比如改了写法），集合恒为空。所以这里正向证明扫描器
    // 在同一批文件上能认出一个已知存在的符号。探针符号用 `pinSession`——
    // Task 10 重写三个 store 之后它依然活着（`authStore.ts` / `chatStore.ts` /
    // `friendsStore.ts` / `groupStore.ts` / `lib/sessionScope.ts` 及其测试）。
    const withPinSession = sourceFiles(SRC).filter((file) =>
      readFileSync(file, 'utf8').includes('pinSession'),
    )
    expect(withPinSession.length).toBeGreaterThan(0)
    expect(sourceFiles(SRC).length).toBeGreaterThan(100)
  })
})
