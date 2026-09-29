/**
 * 消息区日期分隔条的文案。气泡里只有 HH:mm，没有分隔条就分不清一条「10:44」是今天的还是
 * 去年的。与 formatMessageTime 同一套「按日期零点比较」：今天 / 昨天 / 一周内周几 /
 * 今年月日 / 往年年月日。第二个参数只给测试固定"现在"。
 */
const ZH_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function isSameLocalDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return dayStart(da) === dayStart(db)
}

export function formatDayDivider(iso: string, now: Date = new Date(), locale: string = 'zh-CN'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const zh = locale.startsWith('zh')
  const daysDiff = Math.round((dayStart(now) - dayStart(date)) / 86_400_000)
  if (daysDiff <= 0) return zh ? '今天' : 'Today'
  if (daysDiff === 1) return zh ? '昨天' : 'Yesterday'
  if (daysDiff < 7) return zh ? ZH_WEEKDAYS[date.getDay()] : date.toLocaleDateString('en-US', { weekday: 'long' })
  if (date.getFullYear() === now.getFullYear()) {
    return zh ? `${date.getMonth() + 1}月${date.getDate()}日` : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return zh
    ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
