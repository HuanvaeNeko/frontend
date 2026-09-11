/** 回调地址白名单形状：绝对 http(s)，或站内绝对路径（`/` 开头且不是 `//` 协议相对地址）。 */
export function isValidRedirectUri(raw: string): boolean {
  const value = raw.trim()
  if (value === '') return false
  if (value.startsWith('/')) return !value.startsWith('//')
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
