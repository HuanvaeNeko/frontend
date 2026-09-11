import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '../../api/oauth'
import { browserNav } from '../../lib/redirect'
import AuthorizePage from '../AuthorizePage'

/**
 * 终审 I1：`deny()` 里那层二次核验（`AuthorizePage.tsx:102-113`）没有任何用例钉住。
 *
 * 那段代码上方的注释明确写着它是"真正独立兜底、不能删的那一层"——`isValidRedirectUri`
 * 内部的 `hasControlChars` 与 origin 比对对控制字符走私是互相冗余的，但 `deny()`
 * 里的二次核验不是：如果 `isValidRedirectUri` 本身失守（未来被"顺手简化"、或它自己
 * 出现新的绕过），只有这段独立解析、独立比对的二次核验能拦住实际跳转。
 *
 * 验证方式：把第一层 `isValidRedirectUri` 整个打穿（恒真），看第二层能不能自己站住。
 * `vi.mock` 调用会被 vitest 提升到本文件所有 import 之前执行（不管写在文件的哪个
 * 位置），`AuthorizePage` 内部对 `../lib/redirectUri` 的 import 拿到的也是这个恒真版本。
 * 这个 mock 是文件级的，会影响本文件里 import 的一切——所以单独开一个文件，不和
 * `AuthorizePage.test.tsx` 共享，那边的用例依赖真实的 `isValidRedirectUri`，混在一起
 * 会被这个 mock 污染。
 */
vi.mock('../../lib/redirectUri', () => ({ isValidRedirectUri: () => true }))

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const mount = (query: string) => {
  cleanup()
  return render(<RouterProvider router={createMemoryRouter([{ path: '/app/oauth/authorize', element: <AuthorizePage /> }, { path: '/app/chat', element: <div>聊天</div> }], { initialEntries: [`/app/oauth/authorize${query}`] })} />)
}

// 类型从这个带显式参数类型的初始化器推出，理由与 AuthorizePage.test.tsx 相同：裸
// `vi.fn()` 落到 `Mock<Procedure | Constructable>`，跟 `browserNav.assign` 的
// `(href: string) => void` 对不上，`mockImplementation(assign)` 会被 tsc 拒绝。
let assign = vi.fn((_href: string) => {})
beforeEach(() => { assign = vi.fn((_href: string) => {}); vi.spyOn(browserNav, 'assign').mockImplementation(assign) })
afterEach(() => vi.restoreAllMocks())

describe('/app/oauth/authorize 「拒绝」二次核验（纵深防御，第一层被打穿时）', () => {
  it('isValidRedirectUri 恒真（第一层失守）时，deny() 自己的二次核验仍能拦住协议相对地址跳转', async () => {
    vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'consent', app_name: 'Ext App', app_logo_url: null, scopes: ['profile'] })
    mount('?client_id=c1&redirect_uri=%2F%2Fevil.example%2Fcb')
    fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByText('已拒绝授权')).toBeInTheDocument()
    expect(screen.getByText('回调地址不合法，未跳转')).toBeInTheDocument()
  })
})
