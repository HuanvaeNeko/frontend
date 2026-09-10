/** 未读角标文案：0 不显示，99 以上截成 99+（APP 同规则）。 */
export function formatUnreadCount(n: number): string {
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
}
