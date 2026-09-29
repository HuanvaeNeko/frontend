import { fetchWithAuth } from '@/api/authedFetch'
import { readEnvelope } from '@/lib/apiEnvelope'
import { arr, asRecord, str } from '@/lib/apiParse'

/**
 * `POST /api/ai/chat`（backend-docs `ai/AI助手.md` §1，同步对话）。
 * 请求 `{ message, conversation_id? }`：不传 conversation_id 后端自动建新会话，
 * 上下文由后端按 conversation_id 保存——前端不必（也不该）回传整段历史。
 */
export interface AiChatReply {
  conversation_id: string
  reply: string
  tool_calls_used: string[]
}

export function parseAiChatReply(input: unknown): AiChatReply {
  const r = asRecord(input, 'POST /api/ai/chat 的 data')
  return {
    conversation_id: str(r, 'conversation_id'),
    reply: str(r, 'reply'),
    tool_calls_used: arr(r, 'tool_calls_used').filter((x): x is string => typeof x === 'string'),
  }
}

export const aiChatApi = {
  send: async (message: string, conversationId: string | null, signal?: AbortSignal): Promise<AiChatReply> => {
    const response = await fetchWithAuth('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify(conversationId ? { message, conversation_id: conversationId } : { message }),
      signal,
    })
    return readEnvelope<AiChatReply>(response, {
      endpoint: 'POST /api/ai/chat',
      fallbackMessage: 'AI 回复失败',
      parse: { parse: parseAiChatReply },
    })
  },
}
