/**
 * 种子数据的时间全部**相对于重置那一刻**生成：「今天」「昨天」「上周」「去年」在任何一天
 * 跑都成立，日期分隔、相对时间、「刚刚」这类 UI 才有东西可看。
 *
 * 按假后端进程的本地时区算日界线——它与跑 e2e 的浏览器在同一台机器上。
 */
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const iso = (ms: number): string => new Date(ms).toISOString()

export interface Clock {
  now: number
  /** `daysAgo` 天前那天的本地 `hh:mm`，秒数用 `sec` 细分（同一分钟内保持先后顺序）。 */
  dayAt(daysAgo: number, hh: number, mm: number, sec?: number): number
  /** 今天的 `count` 个时间点：落在「今天零点之后」与「`endMinutesAgo` 分钟前」之间，均匀铺开，最多跨 `spanMinutes`。 */
  todaySlots(count: number, spanMinutes?: number, endMinutesAgo?: number): number[]
  /** 去年的某月某日 `hh:mm`。 */
  lastYear(month: number, day: number, hh: number, mm: number): number
  minutesAgo(minutes: number): number
}

export function makeClock(now = Date.now()): Clock {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const startOfToday = today.getTime()
  return {
    now,
    dayAt(daysAgo, hh, mm, sec = 0) {
      const d = new Date(startOfToday)
      d.setDate(d.getDate() - daysAgo)
      d.setHours(hh, mm, sec, 0)
      return d.getTime()
    },
    todaySlots(count, spanMinutes = 180, endMinutesAgo = 2) {
      const end = now - endMinutesAgo * MINUTE
      const start = Math.max(startOfToday + MINUTE, end - spanMinutes * MINUTE)
      if (count <= 1) return [end]
      // 刚过零点的一两分钟里「今天」还装不下：退化成紧挨着 end 的逐秒序列，至少保证先后顺序
      if (end <= start) return Array.from({ length: count }, (_, i) => end - (count - 1 - i) * 1000)
      const step = Math.max(1000, (end - start) / (count - 1))
      return Array.from({ length: count }, (_, i) => Math.min(end, start + Math.round(i * step)))
    },
    lastYear(month, day, hh, mm) {
      const d = new Date(now)
      return new Date(d.getFullYear() - 1, month - 1, day, hh, mm, 0, 0).getTime()
    },
    minutesAgo(minutes) {
      return now - minutes * MINUTE
    },
  }
}

export { DAY, HOUR, MINUTE }
