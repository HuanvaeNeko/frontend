import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useApiConfigStore } from '@/store/apiConfig'
import AiChat from '../AiChatPage'

/**
 * AI 助手默认走后端的 `POST /api/ai/chat`（backend-docs `ai/AI助手.md` §1）：
 * 请求体 `{ message, conversation_id? }`，响应信封 `data: { conversation_id, reply, tool_calls_used, usage }`。
 *
 * 原实现默认打的是不存在的 `/api/chat`，还在**信封顶层**找 `reply`——就算地址对了也只会显示
 * 「收到您的消息，但我暂时无法回复」；并且从不带 conversation_id，每句话都是新会话，
 * 页头「上下文对话模式」名不副实。
 */
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
// 消息气泡的进场动画在卸载时被 happy-dom 取消会抛未处理的 AbortError（同 Sidebar.test.tsx 的说明）
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

const envelope = (data: unknown) =>
  new Response(JSON.stringify({ success: true, code: 200, data }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  useApiConfigStore.getState().resetToDefault()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function send(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/输入你的问题/), { target: { value: text } })
  fireEvent.submit(screen.getByPlaceholderText(/输入你的问题/).closest('form') as HTMLFormElement)
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
  return { url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

describe('AiChatPage 默认后端', () => {
  it('发到 /api/ai/chat，显示信封 data 里的 reply', async () => {
    fetchMock.mockResolvedValueOnce(envelope({
      conversation_id: 'c-1', reply: '你好，我是助手', tool_calls_used: [], usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
    }))
    render(<AiChat />)

    send('你好')

    expect(await screen.findByText('你好，我是助手')).toBeInTheDocument()
    const { url, body } = lastCall()
    expect(url).toMatch(/\/api\/ai\/chat$/)
    expect(body).toEqual({ message: '你好' })
  })

  it('第二句话带上第一句返回的 conversation_id（上下文连续）', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope({ conversation_id: 'c-1', reply: '第一句的回复', tool_calls_used: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
      .mockResolvedValueOnce(envelope({ conversation_id: 'c-1', reply: '第二句的回复', tool_calls_used: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
    render(<AiChat />)

    send('第一句')
    await screen.findByText('第一句的回复')
    send('第二句')
    await screen.findByText('第二句的回复')

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(lastCall().body).toEqual({ message: '第二句', conversation_id: 'c-1' })
  })
})
