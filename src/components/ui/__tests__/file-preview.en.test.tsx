import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MotionGlobalConfig } from 'framer-motion'
import { FilePreview } from '../file-preview'

/**
 * 英文界面下文件预览是英文：工具栏提示、「不支持预览」、下载按钮、页码、加载失败。
 *
 * t 直接查 en-US 字典、不回落中文：缺 key 原样吐 key，下面的断言会红。
 * 预览层 portal 到 document.body，所以查的是整个 body 的 innerHTML（含 title 属性）。
 */
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((node, k) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined), messages['en-US'])
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`)) : key
  }
  return { useI18n: () => ({ locale: 'en-US', t }) }
})

// 卸载时 WAAPI 动画的 cancel() 在 happy-dom 里抛异步 AbortError（同 VideoMeeting.test.tsx）
MotionGlobalConfig.skipAnimations = true

const CJK = /[一-鿿]/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FilePreview 英文界面', () => {
  it('不支持预览的文件：说明、下载按钮、工具栏提示都是英文', () => {
    render(<FilePreview file={{ url: 'blob:zip', name: 'archive.zip', type: 'application/zip', size: 2048 }} onClose={vi.fn()} />)

    expect(screen.getByText('Preview is not available for this file type')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download file' })).toBeInTheDocument()
    for (const title of ['Open in new tab', 'Download', 'Close (Esc)']) {
      expect(screen.getByTitle(title)).toBeInTheDocument()
    }
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('图片：缩放 / 旋转 / 重置的提示是英文', () => {
    render(<FilePreview file={{ url: 'blob:png', name: 'photo.png', type: 'image/png' }} onClose={vi.fn()} />)

    for (const title of ['Zoom out', 'Zoom in', 'Rotate', 'Reset']) {
      expect(screen.getByTitle(title)).toBeInTheDocument()
    }
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it.each([
    ['HTTP 404', () => Promise.resolve(new Response('', { status: 404 }))],
    // 原来断网时直接显示浏览器自带的 err.message（"Failed to fetch"），中文界面里也是这句英文
    ['断网', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('文本文件加载失败（%s）：显示界面语言的「加载失败」', async (_label, fetchImpl) => {
    vi.stubGlobal('fetch', vi.fn(fetchImpl))
    render(<FilePreview file={{ url: '/notes.txt', name: 'notes.txt', type: 'text/plain' }} onClose={vi.fn()} />)

    expect(await screen.findByText('Failed to load')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download file' })).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })
})
