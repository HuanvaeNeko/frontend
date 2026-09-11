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
  it('第三个参数覆盖文案（英文 labels），不传时仍用默认中文（正对照，终审 finding #5）', () => {
    const labels = { yesterday: 'Yesterday', weekdays: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat'.split(',') }
    expect(formatMessageTime(at(2026, 9, 9, 9, 30), NOW, labels)).toBe('Yesterday 09:30')
    expect(formatMessageTime(at(2026, 9, 7, 8, 0), NOW, labels)).toBe('Mon 08:00')
    // 正对照：同样的输入，不传第三个参数时仍是默认中文——证明上面两行确实是
    // labels 参数生效，不是函数本身换了语言。
    expect(formatMessageTime(at(2026, 9, 9, 9, 30), NOW)).toBe('昨天 09:30')
    expect(formatMessageTime(at(2026, 9, 7, 8, 0), NOW)).toBe('周一 08:00')
  })
})
