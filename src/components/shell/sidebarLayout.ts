import { SIDEBAR_TOOLS, type SidebarToolKey } from './sidebarTools'

/**
 * 侧栏双区布局（APP sidebarLayout.ts 移植）：pinned = 钉在侧栏上的工具，more = 收在「更多」面板里的工具。
 * 两区合计恒等于 SIDEBAR_TOOL_KEYS 全集（normalizeLayout 保证：去重 + 补缺）。
 * 持久化在 localStorage `huanvae.sidebar-layout`，**设备级**（sessionScope 名单里，登出不清）。
 */
export const SIDEBAR_LAYOUT_STORAGE_KEY = 'huanvae.sidebar-layout'
export const SIDEBAR_TOOL_KEYS: readonly SidebarToolKey[] = SIDEBAR_TOOLS.map((tool) => tool.key)

export type SidebarZone = 'pinned' | 'more'
export interface SidebarLayout {
  pinned: SidebarToolKey[]
  more: SidebarToolKey[]
}

export function defaultLayout(): SidebarLayout {
  return { pinned: [], more: [...SIDEBAR_TOOL_KEYS] }
}

function isToolKey(value: unknown): value is SidebarToolKey {
  return typeof value === 'string' && (SIDEBAR_TOOL_KEYS as readonly string[]).includes(value)
}

function isZone(value: string): value is SidebarZone {
  return value === 'pinned' || value === 'more'
}

/** 清洗任意来源的布局：结构不对 → 默认；非法 key 丢弃；跨区重复 pinned 优先；同区重复留首个；缺失补到 more 末尾 */
export function normalizeLayout(saved: unknown): SidebarLayout {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return defaultLayout()
  const candidate = saved as { pinned?: unknown; more?: unknown }
  if (!Array.isArray(candidate.pinned) || !Array.isArray(candidate.more)) return defaultLayout()
  const seen = new Set<SidebarToolKey>()
  const pinned: SidebarToolKey[] = []
  for (const key of candidate.pinned) {
    if (isToolKey(key) && !seen.has(key)) { seen.add(key); pinned.push(key) }
  }
  const more: SidebarToolKey[] = []
  for (const key of candidate.more) {
    if (isToolKey(key) && !seen.has(key)) { seen.add(key); more.push(key) }
  }
  for (const key of SIDEBAR_TOOL_KEYS) {
    if (!seen.has(key)) more.push(key)
  }
  return { pinned, more }
}

export function loadLayout(storage: Pick<Storage, 'getItem'> = localStorage): SidebarLayout {
  const raw = storage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY)
  if (raw === null) return defaultLayout()
  try {
    return normalizeLayout(JSON.parse(raw))
  } catch {
    return defaultLayout()
  }
}

export function saveLayout(layout: SidebarLayout, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

export function zoneOf(key: SidebarToolKey, layout: SidebarLayout): SidebarZone | null {
  if (layout.pinned.includes(key)) return 'pinned'
  if (layout.more.includes(key)) return 'more'
  return null
}

/** onDragOver：跨区移动。over 是容器 id → 追加到该区末尾；over 是另一区的项 → 插到它前面。同区 / 无效目标返回同一引用。 */
export function moveAcrossZones(layout: SidebarLayout, activeId: SidebarToolKey, overId: string): SidebarLayout {
  const activeZone = zoneOf(activeId, layout)
  const overZone: SidebarZone | null = isZone(overId) ? overId : isToolKey(overId) ? zoneOf(overId, layout) : null
  if (!activeZone || !overZone || activeZone === overZone) return layout
  const next: SidebarLayout = { pinned: [...layout.pinned], more: [...layout.more] }
  next[activeZone] = next[activeZone].filter((k) => k !== activeId)
  const overIndex = isZone(overId) ? -1 : next[overZone].indexOf(overId as SidebarToolKey)
  if (overIndex === -1) next[overZone].push(activeId)
  else next[overZone].splice(overIndex, 0, activeId)
  return next
}

function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** onDragEnd：同区排序。跨区、容器 id、拖到自己身上都返回同一引用。 */
export function reorderWithinZone(layout: SidebarLayout, activeId: SidebarToolKey, overId: string): SidebarLayout {
  if (!isToolKey(overId) || overId === activeId) return layout
  const activeZone = zoneOf(activeId, layout)
  if (!activeZone || activeZone !== zoneOf(overId, layout)) return layout
  const from = layout[activeZone].indexOf(activeId)
  const to = layout[activeZone].indexOf(overId)
  if (from === -1 || to === -1 || from === to) return layout
  return { ...layout, [activeZone]: arrayMove(layout[activeZone], from, to) }
}
