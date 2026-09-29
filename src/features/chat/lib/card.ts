/**
 * 可交互卡片（message_type: 'card'）的结构。
 *
 * 后端只校验：根是含 `nodes` 数组的对象、每个节点的 `type` 在封闭白名单里、嵌套深度 ≤ 32、整体
 * ≤ 256 KiB（backend-docs messages/好友消息.md:92-112）；**节点内部字段由渲染端约定**（:111）。
 * 这里的字段约定与白名单跟 APP 的 src/types/card.ts / CardRenderer.tsx 保持一致（APP 比后端多认
 * action-buttons / log-tail / sandbox 三种）。
 */
export const CARD_MAX_DEPTH = 32

export const CARD_NODE_TYPES = [
  'container', 'row', 'column', 'divider',
  'text', 'markdown', 'heading', 'image', 'progress', 'stat', 'table', 'chart', 'log-tail',
  'button', 'action-buttons', 'select', 'input', 'sandbox',
] as const

export type CardNodeType = (typeof CARD_NODE_TYPES)[number]

export interface CardNode {
  type: string
  [key: string]: unknown
}

export interface CardDoc {
  version?: number
  nodes: CardNode[]
}

const KNOWN = new Set<string>(CARD_NODE_TYPES)

export function isKnownCardNode(node: unknown): node is CardNode & { type: CardNodeType } {
  return typeof node === 'object' && node !== null && KNOWN.has(String((node as CardNode).type))
}

/** 解析卡片内容；不是 `{ nodes: [...] }` 形状（包括坏 JSON）返回 null */
export function parseCard(content: string): CardDoc | null {
  try {
    const value: unknown = JSON.parse(content)
    if (value && typeof value === 'object' && Array.isArray((value as CardDoc).nodes)) return value as CardDoc
  } catch {
    // 落到下面的 null
  }
  return null
}

export const cardStr = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
export const cardNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
export const cardChildren = (node: CardNode): unknown[] => (Array.isArray(node.children) ? node.children : [])
