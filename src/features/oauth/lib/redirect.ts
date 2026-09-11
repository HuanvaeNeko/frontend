/** 把 code / state / error 拼到回调地址上；相对路径按当前 origin 解析（spec §6.4 第 4 条）。 */
export function appendQuery(target: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(target, location.origin)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value)
  }
  return url.toString()
}

/** 整页跳转的唯一出口；对象形式是为了测试能 vi.spyOn(browserNav, 'assign') */
export const browserNav = {
  assign(href: string): void {
    window.location.assign(href)
  },
}
