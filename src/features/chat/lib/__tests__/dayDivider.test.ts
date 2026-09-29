import { describe, expect, it } from 'vitest'
import { formatDayDivider, isSameLocalDay } from '../dayDivider'

/**
 * 消息区的日期分隔条：气泡里只有 HH:mm，没有它就分不清一条「10:44」是今天的还是去年的。
 * 规则与会话列表的 formatMessageTime 同一套「按日期零点比较」：今天 / 昨天 / 一周内周几 /
 * 今年 M月D日 / 往年 YYYY年M月D日。
 */
const NOW = new Date(2026, 8, 29, 14, 0) // 2026-09-29 周二 14:00（本地时间）

describe('formatDayDivider（zh-CN）', () => {
  it.each([
    ['今天早些时候', new Date(2026, 8, 29, 0, 5), '今天'],
    ['昨天深夜（按零点算，不按 24 小时）', new Date(2026, 8, 28, 23, 59), '昨天'],
    ['三天前 → 周几', new Date(2026, 8, 26, 9, 0), '周六'],
    ['六天前仍是周几', new Date(2026, 8, 23, 9, 0), '周三'],
    ['七天前 → 月日', new Date(2026, 8, 22, 9, 0), '9月22日'],
    ['今年更早', new Date(2026, 0, 3, 9, 0), '1月3日'],
    ['往年', new Date(2025, 11, 31, 23, 0), '2025年12月31日'],
  ])('%s', (_name, date, want) => {
    expect(formatDayDivider(date.toISOString(), NOW, 'zh-CN')).toBe(want)
  })

  it('无法解析的时间返回空串（不渲染分隔条，也不抛）', () => {
    expect(formatDayDivider('not-a-date', NOW, 'zh-CN')).toBe('')
  })
})

describe('formatDayDivider（en-US）', () => {
  it.each([
    ['today', new Date(2026, 8, 29, 8, 0), 'Today'],
    ['yesterday', new Date(2026, 8, 28, 8, 0), 'Yesterday'],
    ['within a week → weekday', new Date(2026, 8, 26, 8, 0), 'Saturday'],
    ['this year', new Date(2026, 0, 3, 8, 0), 'Jan 3'],
    ['earlier year', new Date(2025, 11, 31, 8, 0), 'Dec 31, 2025'],
  ])('%s', (_name, date, want) => {
    expect(formatDayDivider(date.toISOString(), NOW, 'en-US')).toBe(want)
  })
})

describe('isSameLocalDay', () => {
  it('同一天不同时刻 → true；跨零点 → false', () => {
    expect(isSameLocalDay(new Date(2026, 8, 29, 0, 1).toISOString(), new Date(2026, 8, 29, 23, 59).toISOString())).toBe(true)
    expect(isSameLocalDay(new Date(2026, 8, 28, 23, 59).toISOString(), new Date(2026, 8, 29, 0, 1).toISOString())).toBe(false)
  })
})
