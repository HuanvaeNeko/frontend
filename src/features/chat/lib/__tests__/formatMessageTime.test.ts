import { describe, expect, it } from 'vitest'
import { formatMessageTime } from '../formatMessageTime'

// 固定"现在"= 2026-09-10 15:30 本地时间（周四）
const NOW = new Date(2026, 8, 10, 15, 30)
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

describe('formatMessageTime（APP utils/time.ts 规则）', () => {
  it('今天只显示 HH:mm', () => {
    expect(formatMessageTime(at(2026, 9, 10, 9, 5), NOW)).toBe('09:05')
  })
  it('昨天显示「昨天 HH:mm」（按日期零点算，不按 24 小时）', () => {
    expect(formatMessageTime(at(2026, 9, 9, 23, 59), NOW)).toBe('昨天 23:59')
  })
  it('一周内显示「周X HH:mm」', () => {
    expect(formatMessageTime(at(2026, 9, 7, 8, 0), NOW)).toBe('周一 08:00')
  })
  it('更早显示「M/D HH:mm」', () => {
    expect(formatMessageTime(at(2026, 9, 1, 8, 0), NOW)).toBe('9/1 08:00')
  })
  it('无效时间返回空串（调用方据此隐藏）', () => {
    expect(formatMessageTime('not-a-date', NOW)).toBe('')
  })
})
