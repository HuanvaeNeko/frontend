import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '@/features/oauth/api/oauth'
import { AppsSection } from '../AppsSection'

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

const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
const GRANT = { id: 'g1', client_id: 'c1', app_name: 'My App', app_logo_url: null, scope: 'profile email wallet', created_at: twoDaysAgo }

beforeEach(() => { vi.spyOn(oauthApi, 'listGrants').mockResolvedValue([GRANT]); vi.spyOn(oauthApi, 'revokeGrant').mockResolvedValue(undefined) })
afterEach(() => vi.restoreAllMocks())

describe('AppsSection（已授权应用）', () => {
  it('挂载拉列表：应用名、首字 logo、scope 标签（未知 scope 原样）、相对时间', async () => {
    render(<AppsSection />)
    expect(await screen.findByText('My App')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('基本资料、邮箱、wallet')).toBeInTheDocument()
    expect(screen.getByText('2 天前授权')).toBeInTheDocument()
  })
  it('两步取消授权：第一次点不调 API，确认才调，成功后本地移除并显示空态', async () => {
    render(<AppsSection />)
    await screen.findByText('My App')
    fireEvent.click(screen.getByRole('button', { name: '取消授权' }))
    expect(oauthApi.revokeGrant).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(oauthApi.revokeGrant).toHaveBeenCalledWith('g1'))
    expect(await screen.findByText('还没有授权任何应用')).toBeInTheDocument()
    expect(oauthApi.listGrants).toHaveBeenCalledTimes(1)
  })
  it('取消授权失败：错误行，卡片还在', async () => {
    vi.spyOn(oauthApi, 'revokeGrant').mockRejectedValue(new Error('boom'))
    render(<AppsSection />)
    await screen.findByText('My App')
    fireEvent.click(screen.getByRole('button', { name: '取消授权' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('取消授权失败')
    expect(screen.getByText('My App')).toBeInTheDocument()
  })
  it('加载失败可重试', async () => {
    vi.spyOn(oauthApi, 'listGrants').mockRejectedValueOnce(new Error('网络断了')).mockResolvedValueOnce([GRANT])
    render(<AppsSection />)
    expect(await screen.findByRole('alert')).toHaveTextContent('网络断了')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('My App')).toBeInTheDocument()
  })
  it('同源 logo 渲染 <img>，站外 logo 已在解析器变 null → 首字', async () => {
    vi.spyOn(oauthApi, 'listGrants').mockResolvedValue([{ ...GRANT, app_logo_url: `${location.origin}/apps/c1/logo.png` }])
    render(<AppsSection />)
    await screen.findByText('My App')
    expect(document.querySelector('img')?.getAttribute('src')).toBe(`${location.origin}/apps/c1/logo.png`)
  })
})
