import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as appInstall from '@/lib/appInstall'
import DownloadsPage from '../DownloadsPage'

/**
 * 下载页：版本号只有一个 v；中文界面里没有写死的英文。
 *
 * GitHub 的 tag 本身就叫 `v1.1.52`，页面又拼了一个 `v`，显示成「vv1.1.52」；
 * 「Recommended / Download / Latest Release / Released on」四处写死英文。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})
vi.mock('@/lib/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }))

const asset = (name: string) => ({
  name,
  size: 17_900_000,
  created_at: '2026-09-23T08:00:00Z',
  download_count: 5,
  browser_download_url: `https://github.com/x/y/releases/download/v1.1.52/${name}`,
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderWithRelease(tag: string) {
  vi.spyOn(appInstall, 'fetchReleaseInfo').mockResolvedValue({
    tag_name: tag,
    published_at: '2026-09-23T08:00:00Z',
    assets: [asset('Huanvae-Chat-App_1.1.52_x64-setup.exe'), asset('Huanvae-Chat-App_1.1.52_x64_en-US.msi')],
  })
  render(<DownloadsPage />)
}

describe('DownloadsPage', () => {
  it('tag 自带 v 时只显示一个 v', async () => {
    renderWithRelease('v1.1.52')
    expect(await screen.findByText('v1.1.52')).toBeInTheDocument()
    expect(screen.queryByText(/vv1\.1\.52/)).toBeNull()
  })

  it('tag 不带 v 时补一个 v', async () => {
    renderWithRelease('1.1.52')
    expect(await screen.findByText('v1.1.52')).toBeInTheDocument()
  })

  it('中文界面里没有写死的英文按钮 / 标签', async () => {
    renderWithRelease('v1.1.52')
    // 前置：发布信息确实渲染出来了（否则「没有英文」只是因为什么都没渲染）
    await screen.findByText('v1.1.52')
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/Recommended|Latest Release|Released on/)
    expect(screen.queryByText(/^Download$/)).toBeNull()
  })
})
