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
 * `hasControlChars` 与这里的 origin 比对，对「控制字符走私出协议相对地址」这一族攻击是
 * 互相冗余的（实测过：单独留哪一层都能挡住 `/\t/evil.example/cb` 这类输入，删掉其中一层
 * 也测不红——见 2026-09-11-settings-completion/task-6-report.md「修复第 1 轮」的变异校验
 * 记录）。真正独立兜底、不能删的是 `AuthorizePage.tsx` 的 `deny()` 里那层二次核验：两层
 * 都在这里失守时，只有它能拦住实际跳转。
 *
 * 绝对地址分支保持只认协议、不管 host，这是刻意的、控制器已裁决维持的政策——不要后来有人
 * 「顺手」收紧成同源检查。OAuth 外部客户端的回调按契约设计就是站外绝对地址（backend-docs
 * 的注册示例就是 `https://example.com/callback`），收紧这一条等于把外部客户端整个废掉；
 * `https:/\evil` 经 WHATWG 解析等价于 `https://evil/`，和 `https://example.com/cb` 属于
 * 同一类合法绝对地址，不是需要额外堵的绕过。
 *
 * 这条政策的安全性依赖一个本文件无法验证的后端行为：`AuthorizePage.tsx` 的拒绝分支敢用
 * query 里的 `redirect_uri` 跳转，前提是后端在返回 `consent_required` 之前已经把这个
 * `redirect_uri` 对该 `client_id` 的注册白名单校验过了（RFC 6749 §4.1.2.1 要求如此，
 * Task 4 也见过「redirect_uri 未注册」的 400 契约）——这里的形状检查只是第二道防线，不是
 * 主防线。如果将来确认后端在 consent 阶段不做这层校验，本地检查不足以兜底：任何人都能拿
 * 一个已注册的 `client_id` 配任意站外 `redirect_uri` 走到同意页，再靠「拒绝」把用户送走，
 * 那时控制字符只是众多写法之一，收紧字符集根本不解决问题。届时正确的修法是把拒绝分支改成
 * 「不跳转、只显示已拒绝」，而不是继续在这里加字符黑名单。
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
