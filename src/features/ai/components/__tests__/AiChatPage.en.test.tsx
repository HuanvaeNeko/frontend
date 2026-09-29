import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActiveLocale } from '@/i18n/translate'
import { useApiConfigStore } from '@/store/apiConfig'
import AiChat from '../AiChatPage'

/**
 * 英文界面下 AI 助手页整页是英文。原来整页写死中文（假后端 e2e 里记为前端缺陷），
 * 英文界面照样冒中文。
 *
 * 组件里的 t 直接查 `i18n.locale`（默认 en-US）那份字典、**不回落中文**：缺 key 时原样吐出 key，
 * 下面按英文找元素的断言会红，而不是悄悄显示一句中文。API 层（aiChat.ts）的兜底报错走 translate()，
 * 跟随 setActiveLocale。
 */
const i18n = vi.hoisted(() => ({ locale: 'en-US' as 'zh-CN' | 'en-US' }))
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((node, k) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[k] : undefined), messages[i18n.locale])
    return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`)) : key
  }
  return { useI18n: () => ({ locale: i18n.locale, t }) }
})
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
// 同 AiChatPage.test.tsx：进场动画在卸载时被 happy-dom 取消会抛未处理的 AbortError
vi.mock('framer-motion', async () => {
  const react = await import('react')
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, layout: _l, ...rest }: Record<string, unknown>) => rest
  const passthrough = (tag: string) =>
    react.forwardRef(function MockMotion(props: Record<string, unknown>, ref: React.Ref<unknown>) {
      const { children, ...rest } = strip(props)
      return react.createElement(tag, { ...rest, ref }, children as React.ReactNode)
    })
  return {
    motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  }
})

/** 汉字（与 cjk-scan 同一个区间）；查 innerHTML，title / aria-label / placeholder 里的也算 */
const CJK = /[一-鿿]/

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useApiConfigStore.getState().resetToDefault()
  i18n.locale = 'en-US'
  setActiveLocale('en-US')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  setActiveLocale('zh-CN')
  vi.unstubAllGlobals()
})

describe('AiChatPage 英文界面', () => {
  it('页头、开场白、输入框、快捷提问、设置弹窗都是英文，页面上没有一个汉字', () => {
    render(<AiChat />)

    expect(screen.getByText("Hi! I'm your AI assistant. How can I help you?")).toBeInTheDocument()
    // 副标题同 APP 的「GLM-5 模型」
    expect(screen.getByText('GLM-5 model')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask a question...')).toBeInTheDocument()
    for (const name of ['Export', 'Clear', 'Settings', 'Send', 'Introduce yourself', 'What can you do', 'Topic ideas', 'Write code']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(document.body.innerHTML).not.toMatch(CJK)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'API settings' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter API key (optional)')).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('打开自定义 API 后副标题不再声称是 GLM-5（第三方地址的模型未知）', () => {
    useApiConfigStore.getState().setApiConfig({ useCustomApi: true })
    render(<AiChat />)

    expect(screen.getByText('Custom API')).toBeInTheDocument()
    expect(screen.queryByText('GLM-5 model')).toBeNull()
  })

  it('开场白跟着语言切换走：I18nProvider 首帧是默认中文、effect 里才切成英文，开场白不能停在首帧的中文', () => {
    i18n.locale = 'zh-CN'
    const { rerender } = render(<AiChat />)
    expect(screen.getByText('您好！我是 AI 助手。有什么可以帮助您的吗？')).toBeInTheDocument()

    i18n.locale = 'en-US'
    rerender(<AiChat />)
    expect(screen.getByText("Hi! I'm your AI assistant. How can I help you?")).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })

  it('快捷提问填进输入框的是英文句子', () => {
    render(<AiChat />)

    fireEvent.click(screen.getByRole('button', { name: 'Write code' }))
    expect(screen.getByPlaceholderText('Ask a question...')).toHaveValue('Help me write some code')
  })

  it('后端失败：报错条与错误气泡是英文，API 层的兜底文案（aiChat.ts）也是英文', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }))
    render(<AiChat />)

    const input = screen.getByPlaceholderText('Ask a question...')
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    // 报错条：aiChat.ts 的 fallbackMessage + apiEnvelope 补的状态码
    expect(await screen.findByText('The AI failed to reply (HTTP 500)')).toBeInTheDocument()
    expect(screen.getByText(/^Sorry, something went wrong: The AI failed to reply \(HTTP 500\) You can try:/)).toBeInTheDocument()
    expect(document.body.innerHTML).not.toMatch(CJK)
  })
})
