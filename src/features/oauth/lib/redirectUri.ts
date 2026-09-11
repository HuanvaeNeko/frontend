/**
 * 是否含 C0 控制字符（0x00–0x1F）或 DEL（0x7F）。这条必须在 trim() 之前检查原始输入：
 * WHATWG URL 解析器会把字符串里任意位置（不只是首尾）的 tab / LF / CR 直接抹掉再解析，
 * `trim()` 只处理首尾空白，夹在中间的控制字符会被它放过。修复第 2 轮 Critical：旧实现只在
 * 字符串层面判断 `/` 开头的值是不是 `//` 开头（协议相对地址），`/\t/evil.example/cb` 这种
 * 输入字符串层面看起来像单斜杠开头的站内路径，但喂给 `new URL()`（`redirect.ts` 的
 * `appendQuery` 内部就是这么用的）时 tab 被吃掉，等价于 `//evil.example/cb`——协议相对
 * 地址，解析出的 host 跳出本站。实测：
 * `new URL('/\t/evil.example/cb', 'https://good.example').origin === 'https://evil.example'`。
 *
 * 用逐字符扫描而不是正则字符类：biome 的 `lint/suspicious/noControlCharactersInRegex`
 * 把字面量正则里的控制字符转义当 error 处理（本仓没有为这条规则开例外），这里的控制字符
 * 检测又是刻意为之、必须存在，换一种不触碰这条规则的写法，而不是用抑制注释压掉诊断。
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/**
 * 回调地址白名单形状：绝对 http(s)，或站内绝对路径。
 *
 * 站内路径分支不再用字符串前缀猜测（旧版 `!value.startsWith('//')`），改成真正解析后比对
 * origin——只有这样才能同时挡住协议相对地址（`//evil.example/cb`）和上面这种控制字符走私。
 * 绝对地址分支保持只认协议、不管 host：这里没有后端的注册白名单可查，OAuth 外部客户端的
 * 回调本来就是站外地址，收紧这一条会把合法的外部回调也一起拒了。
 */
export function isValidRedirectUri(raw: string): boolean {
  if (hasControlChars(raw)) return false
  const value = raw.trim()
  if (value === '') return false
  if (value.startsWith('/')) {
    try {
      const url = new URL(value, location.origin)
      return url.origin === location.origin && (url.protocol === 'http:' || url.protocol === 'https:')
    } catch {
      return false
    }
  }
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
