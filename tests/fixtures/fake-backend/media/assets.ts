import { makePdf } from './pdf'
import { appIcon, barChart, identicon, landscape } from './png'
import { SAMPLE_MP4_BASE64 } from './sampleVideo'

/**
 * 假后端所有"真字节"的出处：头像、聊天图片、PDF、视频、文本文件。
 *
 * 全部惰性生成并缓存（同一个名字永远是同一份字节），`/__test/reset` 不需要清它——
 * 重置的是世界状态，不是这些确定性的素材。
 */
export interface Asset {
  bytes: Uint8Array
  contentType: string
  width: number | null
  height: number | null
}

const cache = new Map<string, Asset>()

function memo(key: string, make: () => Asset): Asset {
  const hit = cache.get(key)
  if (hit) return hit
  const made = make()
  cache.set(key, made)
  return made
}

const png = (bytes: Uint8Array, width: number, height: number): Asset => ({ bytes, contentType: 'image/png', width, height })

const PDFS = {
  'q3-review': {
    title: '2026 Q3 Project Review',
    lines: [
      'Team: Huanvae Web',
      '',
      '1. Shipped the BFF session layer (httpOnly cookie + server-side tokens).',
      '2. Migrated the app shell to React Router 8 resource routes.',
      '3. Strict envelope parsers for every API module.',
      '4. Service worker: silent takeover on same-build deploys.',
      '',
      'Risks',
      '- Group file passthrough still needs an audit.',
      '- Unread counters depend on the WebSocket "connected" frame.',
      '',
      'Next quarter: end-to-end UX audit with a stateful fake backend.',
    ],
  },
  kyoto: {
    title: 'Kyoto Travel Plan (5 days)',
    lines: [
      'Day 1  Arrive at KIX, Haruka express to Kyoto Station, Nishiki Market.',
      'Day 2  Fushimi Inari at sunrise, Tofuku-ji, Gion in the evening.',
      'Day 3  Arashiyama bamboo grove, Tenryu-ji, Sagano scenic railway.',
      'Day 4  Kinkaku-ji, Ryoan-ji, Philosopher\'s Path, Ginkaku-ji.',
      'Day 5  Nara day trip, deer park, Todai-ji. Back to Osaka.',
      '',
      'Budget: about 8,000 CNY per person including hotels.',
    ],
  },
  'reading-list': {
    title: 'Book Club Season 7 - Reading List',
    lines: [
      'Week 1-2   The Three-Body Problem (Liu Cixin)',
      'Week 3-4   To Live (Yu Hua)',
      'Week 5-6   Norwegian Wood (Haruki Murakami)',
      'Week 7-8   One Hundred Years of Solitude (G. G. Marquez)',
      '',
      'Meetups every other Sunday, 15:00, at the usual cafe.',
    ],
  },
} as const

export type PdfName = keyof typeof PDFS

export const assets = {
  userAvatar: (userId: string): Asset => memo(`avatar:${userId}`, () => png(identicon(userId), 128, 128)),
  groupAvatar: (groupId: string): Asset => memo(`group-avatar:${groupId}`, () => png(identicon(groupId, 'group'), 128, 128)),
  photo: (kind: 'sunset' | 'lake' | 'trail'): Asset => memo(`photo:${kind}`, () => png(landscape(kind), 640, 400)),
  chart: (): Asset => memo('chart', () => png(barChart(), 560, 320)),
  appIcon: (kind: 'weather' | 'ledger' | 'film'): Asset => memo(`icon:${kind}`, () => png(appIcon(kind), 96, 96)),
  pdf: (name: PdfName): Asset =>
    memo(`pdf:${name}`, () => ({ bytes: makePdf(PDFS[name].title, PDFS[name].lines), contentType: 'application/pdf', width: null, height: null })),
  video: (): Asset =>
    memo('video', () => ({ bytes: Uint8Array.from(atob(SAMPLE_MP4_BASE64), (c) => c.charCodeAt(0)), contentType: 'video/mp4', width: 240, height: 136 })),
  text: (key: string, content: string, contentType = 'text/plain; charset=utf-8'): Asset =>
    memo(`text:${key}`, () => ({ bytes: new TextEncoder().encode(content), contentType, width: null, height: null })),
}

/**
 * 与前端 `src/api/storage.ts` 的 `calculateFileHash` 同一算法（小文件：`|size:N|` + 全部字节
 * 做 SHA-256）。种子文件用它算 `file_hash`，于是把种子文件下载下来原样再传一次，
 * 会像真后端一样命中秒传分支。
 */
export function clientFileHash(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(`|size:${bytes.length}|`).update(bytes).digest('hex')
}
