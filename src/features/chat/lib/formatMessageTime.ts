/**
 * 消息时间文案，逐条移植 APP `utils/time.ts` 的 formatMessageTime：
 * 今天 `HH:mm`；昨天 `昨天 HH:mm`；一周内 `周X HH:mm`；更早 `M/D HH:mm`。
 * 「昨天」按**日期零点**比较（23:59 → 00:01 也是昨天），不按 24 小时差。
 * 第二个参数只给测试用来固定"现在"。
 */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const daysDiff = Math.floor((dayStart(now) - dayStart(date)) / 86_400_000)
  const time = hhmm(date)
  if (daysDiff <= 0) return time
  if (daysDiff === 1) return `昨天 ${time}`
  if (daysDiff < 7) return `${WEEKDAYS[date.getDay()]} ${time}`
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}
