import { fetchWithAuth } from '@/api/authedFetch'
import { readEnvelopeList } from '@/lib/apiEnvelope'

/** `GET /api/bots` 一条（APP src/api/bots.ts 的 BotInfo；本期只取六个字段） */
export interface BotSummary {
  bot_user_id: string
  username: string
  nickname: string
  description: string
  is_active: boolean
  created_at: string
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`GET /api/bots: ${field} 缺失或不是字符串`)
  return v
}

export function parseBotSummary(input: unknown): BotSummary {
  const r = (input ?? {}) as Record<string, unknown>
  return {
    bot_user_id: str(r.bot_user_id, 'bot_user_id'),
    username: str(r.username, 'username'),
    nickname: str(r.nickname, 'nickname'),
    description: typeof r.description === 'string' ? r.description : '',
    is_active: r.is_active === true,
    created_at: str(r.created_at, 'created_at'),
  }
}

export const botsApi = {
  listMyBots: async (): Promise<BotSummary[]> => {
    const response = await fetchWithAuth('/api/bots')
    const items = await readEnvelopeList<unknown>(response, { endpoint: 'GET /api/bots', fallbackMessage: '加载机器人失败' })
    return items.map(parseBotSummary)
  },
}
