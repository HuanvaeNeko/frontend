import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageImage } from '../MessageImage'
import { MessageVideo } from '../MessageVideo'

/**
 * 英文界面下消息里的图片 / 视频：加载失败的提示与图片的默认 alt 是英文。
 *
 * t 直接查 en-US 字典、不回落中文：缺 key 原样吐 key，下面的断言会红。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((node, k) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined), messages['en-US'])
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`)) : key
  }
  return { useI18n: () => ({ locale: 'en-US', t }) }
})

const CJK = /[一-鿿]/

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('消息里的图片 / 视频（英文界面）', () => {
  it('拿不到图片地址：英文的「图片加载失败」', async () => {
    render(<MessageImage fileUrl={null} fileUuid={null} />)

    expect(await screen.findByText('Failed to load image')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('拿不到视频地址：英文的「视频加载失败」', async () => {
    render(<MessageVideo fileUrl={null} fileUuid={null} />)

    expect(await screen.findByText('Failed to load video')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('图片的默认 alt 是英文（预签名地址直接用，不打存储接口）', async () => {
    render(<MessageImage fileUrl="https://oss.example.com/a.png?X-Amz-Signature=abc" fileUuid={null} />)

    expect(await screen.findByRole('img', { name: 'Image' })).toBeInTheDocument()
  })
})
