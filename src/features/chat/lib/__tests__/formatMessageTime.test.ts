import { describe, expect, it } from 'vitest'
import { messages } from '@/i18n/messages'
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
  it('零点边界：现在 00:01，昨天 23:59 是「昨天」，今天 00:00 是「00:00」', () => {
    const now = new Date(2026, 8, 10, 0, 1)
    expect(formatMessageTime(at(2026, 9, 9, 23, 59), now)).toBe('昨天 23:59')
    expect(formatMessageTime(at(2026, 9, 10, 0, 0), now)).toBe('00:00')
  })
  it('七天边界：6 天前是「周X」，整 7 天前是「M/D」', () => {
    expect(formatMessageTime(at(2026, 9, 4, 8, 0), NOW)).toBe('周五 08:00')
    expect(formatMessageTime(at(2026, 9, 3, 8, 0), NOW)).toBe('9/3 08:00')
  })
  it('未来时间（客户端时钟落后）按今天显示 HH:mm，不显示负天数', () => {
    expect(formatMessageTime(at(2026, 9, 11, 9, 0), NOW)).toBe('09:00')
  })
})

/**
 * 英文路径是第三个参数 labels，唯一调用点 ConversationCard 用
 * `{ yesterday: t('shell.list.yesterday'), weekdays: t('shell.list.weekdays').split(',') }` 从字典拼。
 * 上面那条用例的 labels 是手写字面量，钉不住字典本身：谁把字典里的 weekdays 改成全角逗号、
 * 少一项，或者英文里还是中文，那条照样绿。这里按调用点的原样从两份字典拼一遍。
 */
describe('formatMessageTime × 字典里的 shell.list（按 ConversationCard 的拼法）', () => {
  const labelsOf = (locale: keyof typeof messages) => ({
    yesterday: messages[locale].shell.list.yesterday,
    weekdays: messages[locale].shell.list.weekdays.split(','),
  })

  it('en-US：Yesterday / 英文星期缩写，没有一个汉字', () => {
    const labels = labelsOf('en-US')
    expect(labels.weekdays).toHaveLength(7)
    expect(formatMessageTime(at(2026, 9, 9, 9, 30), NOW, labels)).toBe('Yesterday 09:30')
    expect(formatMessageTime(at(2026, 9, 7, 8, 0), NOW, labels)).toBe('Mon 08:00')
    expect(formatMessageTime(at(2026, 9, 6, 8, 0), NOW, labels)).toBe('Sun 08:00')
    expect(formatMessageTime(at(2026, 9, 1, 8, 0), NOW, labels)).toBe('9/1 08:00')
  })

  it('zh-CN：与不传 labels 时的默认中文逐字一致', () => {
    const labels = labelsOf('zh-CN')
    expect(labels.weekdays).toHaveLength(7)
    for (const iso of [at(2026, 9, 9, 23, 59), at(2026, 9, 7, 8, 0), at(2026, 9, 4, 8, 0), at(2026, 9, 3, 8, 0)]) {
      expect(formatMessageTime(iso, NOW, labels)).toBe(formatMessageTime(iso, NOW))
    }
  })
})
