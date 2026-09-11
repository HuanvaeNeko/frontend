import { fetchWithAuth } from '@/api/authedFetch'
import { type Parser, readEnvelope } from '@/lib/apiEnvelope'
import { asRecord, describe, str } from '@/lib/apiParse'

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

/** `data` 本身就是数组：校验它是数组，再逐行喂给 `row`——挂在 `readEnvelope` 的 `parse`
 * 档上，行级校验（`row` 内部的 `str()` 等）抛出的错误因此也会被 `validatePayload` 接住、
 * 转成可上报的 `ApiShapeError`，不再是绕开 `[api-shape]` 上报的裸 `Error`（终审 finding #7）。 */
function arrayOf<T>(row: (input: unknown) => T): Parser<T[]> {
  return {
    parse(input: unknown) {
      if (!Array.isArray(input)) throw new Error(`data 应为数组，实际是 ${describe(input)}`)
      return input.map(row)
    },
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
