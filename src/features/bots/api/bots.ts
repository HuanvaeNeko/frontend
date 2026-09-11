import { fetchWithAuth } from '@/api/authedFetch'
import { readEnvelope } from '@/lib/apiEnvelope'
import { arrayOf, asRecord, str } from '@/lib/apiParse'

/** `GET /api/bots` 一条（APP src/api/bots.ts 的 BotInfo；本期只取六个字段） */
export interface BotSummary {
  bot_user_id: string
  username: string
  nickname: string
  description: string
  is_active: boolean
  created_at: string
}

export function parseBotSummary(input: unknown): BotSummary {
  const r = asRecord(input, 'GET /api/bots 的一项')
  return {
    bot_user_id: str(r, 'bot_user_id'),
    username: str(r, 'username'),
    nickname: str(r, 'nickname'),
    description: typeof r.description === 'string' ? r.description : '',
    is_active: r.is_active === true,
    created_at: str(r, 'created_at'),
  }
}

export const botsApi = {
  listMyBots: async (): Promise<BotSummary[]> => {
    const response = await fetchWithAuth('/api/bots')
    return readEnvelope<BotSummary[]>(response, {
      endpoint: 'GET /api/bots',
      fallbackMessage: '加载机器人失败',
      parse: arrayOf(parseBotSummary),
    })
  },
}
