import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/apiEnvelope'
import { AuthenticationError, isAuthError } from '../apiClient'

/**
 * `isAuthError` 的五个消费点全部是**静默**路径：
 * `friendsStore` / `profileStore` 走 `silentRedirectToLogin()`
 * （`clearAuth()` + `location.replace('/login')`，不弹任何提示），
 * `chatStore` 直接 `return []` 只留一句 `console.warn`。
 *
 * 所以这个函数判真 = 用户看不到任何解释。它必须只对**真正的认证失败**为真。
 */
describe('isAuthError —— 401 与 403 的分界', () => {
  it('403 不再被判成认证错误：普通权限不足不该触发无提示登出', () => {
    // 后端文档：文件访问 403 的 error 恒为「权限不足」（好友关系已解除 /
    // 不是会话参与者 / 不是该群活跃成员，故意同形）。
    // 这条文案不含 AUTH_ERROR_MESSAGES 里任何一个关键词，
    // 所以状态码档放行之后，关键词兜底档也放行 —— 错误会作为可见错误上抛。
    const denied = new ApiError('权限不足', {
      status: 403,
      code: 403,
      endpoint: 'POST /api/storage/file/{uuid}/presigned_url',
    })
    expect(isAuthError(denied)).toBe(false)
  })

  it('401 仍然被判成认证错误 —— 收窄不能误伤静默刷新/重定向路径', () => {
    // 解包层抛出的是后端原文，很可能一个关键词都不含；
    // 若这条挂了，说明状态码档被收得太狠，401 会退回到猜词，静默重定向失效。
    const expired = new ApiError('您的会话已结束，请重新开始', {
      status: 401,
      code: 401,
      endpoint: 'GET /api/auth/devices',
    })
    expect(isAuthError(expired)).toBe(true)
  })

  it('AuthenticationError 与关键词兜底档不受影响', () => {
    expect(isAuthError(new AuthenticationError('Token 刷新失败'))).toBe(true)
    expect(isAuthError('token 已过期')).toBe(true)
    expect(isAuthError(new Error('网络连接失败'))).toBe(false)
  })

  it('403 的其它常见文案同样不含认证关键词，不会被兜底档误捞', () => {
    for (const message of ['权限不足', '文件不存在', '群存在但你不是本群活跃成员']) {
      expect(isAuthError(new ApiError(message, { status: 403, endpoint: 'GET /x' }))).toBe(false)
    }
  })
})
