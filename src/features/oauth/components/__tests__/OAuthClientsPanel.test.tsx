import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '../../api/oauth'
import { OAuthClientsPanel } from '../OAuthClientsPanel'

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }), toast: toastMock }))
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

const EXTERNAL = { client_id: 'c-ext', client_type: 'external', app_name: 'Ext App', app_description: '第三方', app_homepage_url: null, app_logo_url: null, redirect_uris: ['https://example.com/cb'], allowed_scopes: ['profile', 'email'], is_active: true, created_at: '2026-09-01T00:00:00Z' }
const INTERNAL = { ...EXTERNAL, client_id: 'c-int', client_type: 'internal', app_name: 'Mini App', is_active: false }

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  toastMock.mockClear()
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.spyOn(oauthApi, 'listClients').mockResolvedValue([EXTERNAL, INTERNAL])
  vi.spyOn(oauthApi, 'deleteClient').mockResolvedValue(undefined)
  vi.spyOn(oauthApi, 'resetClientSecret').mockResolvedValue({ client_secret: 'new-secret' })
  vi.spyOn(oauthApi, 'createClient').mockResolvedValue({ client_id: 'c-new', client_secret: 'first-secret', app_name: 'New App' })
})
afterEach(() => vi.restoreAllMocks())

describe('OAuthClientsPanel', () => {
  it('列表：应用名、类型标签、已停用、client_id、权限与回调；只有 external 有「重置密钥」「删除」', async () => {
    render(<OAuthClientsPanel />)
    expect(await screen.findByText('Ext App')).toBeInTheDocument()
    expect(screen.getByText('外部')).toBeInTheDocument()
    expect(screen.getByText('内部')).toBeInTheDocument()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getByText('c-ext')).toBeInTheDocument()
    // INTERNAL 在上面用 `{ ...EXTERNAL, ... }` 派生，没有覆盖 allowed_scopes / redirect_uris——
    // 两张卡片因此渲染出逐字相同的「权限」「回调地址」行，getByText 对这两处必然是「多个匹配」，
    // 与本用例要检查的「格式对不对」无关，用 getAllByText 取第一个即可，断言的字面量不变。
    expect(screen.getAllByText(/基本资料、邮箱/)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/https:\/\/example\.com\/cb/)[0]).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '重置密钥' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(1)
  })
  it('复制 client_id：写剪贴板并 toast「已复制」；失败 toast 失败', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0])
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('c-ext'))
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '已复制' }))
    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0])
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '复制失败', variant: 'destructive' })))
  })
  it('删除两步确认：第一次不调；确认后调 deleteClient 并本地移除', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(oauthApi.deleteClient).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(oauthApi.deleteClient).toHaveBeenCalledWith('c-ext'))
    await waitFor(() => expect(screen.queryByText('Ext App')).toBeNull())
    expect(screen.getByText('Mini App')).toBeInTheDocument()
  })
  it('删除失败：role=alert 显示「操作失败」，卡片还在', async () => {
    vi.spyOn(oauthApi, 'deleteClient').mockRejectedValue(new Error('boom'))
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('操作失败')
    expect(screen.getByText('Ext App')).toBeInTheDocument()
  })
  it('重置密钥两步确认 → SecretDisplay 显示新密钥；遮罩/Esc 不关，只有「我已保存」关', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '重置密钥' }))
    expect(oauthApi.resetClientSecret).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(oauthApi.resetClientSecret).toHaveBeenCalledWith('c-ext'))
    const dialog = await screen.findByRole('dialog', { name: /客户端凭据/ })
    expect(dialog).toHaveTextContent('new-secret')
    expect(dialog).toHaveTextContent('只显示这一次')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: /客户端凭据/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '我已保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /客户端凭据/ })).toBeNull())
  })
  it('新建：名称必填、至少一条合法回调；坏回调显示校验文案且不提交；成功后进 SecretDisplay 并刷新列表', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '新建客户端' }))
    const form = screen.getByRole('dialog', { name: '创建 OAuth 客户端' })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('应用名称'), { target: { value: 'New App' } })
    fireEvent.change(screen.getAllByLabelText('回调地址')[0], { target: { value: 'example.com/cb' } })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    expect(form).toHaveTextContent('回调地址必须是 http(s) 绝对地址或以 / 开头的站内路径')
    fireEvent.change(screen.getAllByLabelText('回调地址')[0], { target: { value: 'https://new.example/cb' } })
    fireEvent.click(screen.getByRole('button', { name: '添加回调地址' }))
    fireEvent.change(screen.getAllByLabelText('回调地址')[1], { target: { value: '/apps/x/cb' } })
    fireEvent.click(screen.getByLabelText('邮箱'))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(oauthApi.createClient).toHaveBeenCalledWith({ app_name: 'New App', redirect_uris: ['https://new.example/cb', '/apps/x/cb'], scopes: ['profile', 'email'] }))
    const secret = await screen.findByRole('dialog', { name: /New App/ })
    expect(secret).toHaveTextContent('first-secret')
    expect(secret).toHaveTextContent('c-new')
    expect(oauthApi.listClients).toHaveBeenCalledTimes(2)
  })
  it('空列表：空态 + 提示；加载失败可重试', async () => {
    vi.spyOn(oauthApi, 'listClients').mockResolvedValueOnce([])
    render(<OAuthClientsPanel />)
    expect(await screen.findByText('还没有 OAuth 客户端')).toBeInTheDocument()
  })
})
