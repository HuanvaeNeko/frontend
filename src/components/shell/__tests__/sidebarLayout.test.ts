import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_LAYOUT_STORAGE_KEY, SIDEBAR_TOOL_KEYS,
  defaultLayout, loadLayout, moveAcrossZones, normalizeLayout, reorderWithinZone, saveLayout, zoneOf,
} from '../sidebarLayout'

describe('sidebarLayout：注册表与默认布局', () => {
  it('工具 key 集合与顺序钉死（spec §5：meeting/files/bots/miniapps/ai）', () => {
    expect([...SIDEBAR_TOOL_KEYS]).toEqual(['meeting', 'files', 'bots', 'miniapps', 'ai'])
    expect(defaultLayout()).toEqual({ pinned: [], more: ['meeting', 'files', 'bots', 'miniapps', 'ai'] })
    expect(SIDEBAR_LAYOUT_STORAGE_KEY).toBe('huanvae.sidebar-layout')
  })
})

describe('normalizeLayout（APP 同名函数的移植用例）', () => {
  it('不是对象 / 数组 / 缺任一区 → 默认布局', () => {
    for (const bad of [null, undefined, 'x', 7, [], { pinned: [] }, { more: [] }, { pinned: 'files', more: [] }]) {
      expect(normalizeLayout(bad)).toEqual(defaultLayout())
    }
  })
  it('非法 key 被丢弃；跨区重复 pinned 优先；同区重复留首个；缺的按注册表顺序补到 more 末尾', () => {
    expect(normalizeLayout({ pinned: ['files', 'lan', 'files'], more: ['files', 'ai', 'ai', 'stocks'] })).toEqual({
      pinned: ['files'],
      more: ['ai', 'meeting', 'bots', 'miniapps'],
    })
  })
  it('合法布局原样保留顺序（正对照：不是一律回默认）', () => {
    expect(normalizeLayout({ pinned: ['ai', 'meeting'], more: ['miniapps', 'bots', 'files'] })).toEqual({ pinned: ['ai', 'meeting'], more: ['miniapps', 'bots', 'files'] })
  })
})

describe('loadLayout / saveLayout', () => {
  it('没存过 → 默认；坏 JSON → 默认；存过 → 经 normalizeLayout', () => {
    expect(loadLayout({ getItem: () => null })).toEqual(defaultLayout())
    expect(loadLayout({ getItem: () => '{oops' })).toEqual(defaultLayout())
    expect(loadLayout({ getItem: () => '{"pinned":["bots"],"more":[]}' })).toEqual({ pinned: ['bots'], more: ['meeting', 'files', 'miniapps', 'ai'] })
  })
  it('saveLayout 往约定键写 JSON', () => {
    const writes: Array<[string, string]> = []
    saveLayout({ pinned: ['ai'], more: ['meeting', 'files', 'bots', 'miniapps'] }, { setItem: (k, v) => { writes.push([k, v]) } })
    expect(writes).toEqual([['huanvae.sidebar-layout', '{"pinned":["ai"],"more":["meeting","files","bots","miniapps"]}']])
  })
})

describe('拖拽归约：moveAcrossZones（onDragOver）与 reorderWithinZone（onDragEnd）', () => {
  const base = { pinned: ['ai'], more: ['meeting', 'files', 'bots', 'miniapps'] } as const
  const layout = () => ({ pinned: [...base.pinned], more: [...base.more] })

  it('zoneOf', () => {
    expect(zoneOf('ai', layout())).toBe('pinned')
    expect(zoneOf('files', layout())).toBe('more')
  })
  it('拖到容器 pinned：从 more 移除并追加到 pinned 末尾', () => {
    expect(moveAcrossZones(layout(), 'files', 'pinned')).toEqual({ pinned: ['ai', 'files'], more: ['meeting', 'bots', 'miniapps'] })
  })
  it('拖到另一区的某一项上：插到该项前面', () => {
    expect(moveAcrossZones(layout(), 'ai', 'bots')).toEqual({ pinned: [], more: ['meeting', 'files', 'ai', 'bots', 'miniapps'] })
  })
  it('同区 / 未知目标：返回同一引用（不触发多余渲染）', () => {
    const l = layout()
    expect(moveAcrossZones(l, 'files', 'bots')).toBe(l)
    expect(moveAcrossZones(l, 'files', 'nowhere')).toBe(l)
    expect(moveAcrossZones(l, 'files', 'more')).toBe(l)
  })
  it('同区排序：files 放到 miniapps 的位置', () => {
    expect(reorderWithinZone(layout(), 'files', 'miniapps')).toEqual({ pinned: ['ai'], more: ['meeting', 'bots', 'miniapps', 'files'] })
  })
  it('跨区 / 容器 id / 自己：reorderWithinZone 返回同一引用', () => {
    const l = layout()
    expect(reorderWithinZone(l, 'ai', 'files')).toBe(l)
    expect(reorderWithinZone(l, 'files', 'more')).toBe(l)
    expect(reorderWithinZone(l, 'files', 'files')).toBe(l)
  })
})
