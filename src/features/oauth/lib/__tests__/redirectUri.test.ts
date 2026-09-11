import { describe, expect, it } from 'vitest'
import { isValidRedirectUri } from '../redirectUri'

describe('isValidRedirectUri（spec §6.3 / §6.4 同一条规则）', () => {
  it.each(['https://example.com/cb', 'http://localhost:3000/cb', '/apps/my-app/oauth/callback', '/cb?x=1'])('放行：%s', (uri) => {
    expect(isValidRedirectUri(uri)).toBe(true)
  })
  it.each([
    '',
    '   ',
    'javascript:alert(1)',
    'example.com/cb',
    '//evil.example/cb',
    'ftp://x/y',
    'data:text/html,x',
    // 修复第 2 轮 Critical：控制字符走私——字符串层面看起来是站内路径（`/` 开头），
    // 但 WHATWG URL 解析器会先把字符串里任意位置的 tab / LF / CR 抹掉再解析，抹掉后
    // 等价于 `//evil.example/cb`（协议相对地址），解析出的 origin 跑到 evil.example。
    '/\t/evil.example/cb',
    '/\n/evil.example/cb',
    '/\r/evil.example/cb',
    // 大小写混写 / 前导空白：证明协议判断不是靠原样字符串比对，`new URL()` 解析时会把
    // scheme 规整成小写，`.trim()` 会先去掉前导空白，两种写法都不能绕过协议白名单。
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
  ])('拒绝：%s', (uri) => {
    expect(isValidRedirectUri(uri)).toBe(false)
  })

  // 下面两条不在拒绝清单里，是我自己判断后决定放行的——都不是「以 / 开头、字符串层面像站内
  // 路径、解析后却跑出本站」这种验证结果与实际跳转不一致的情况（本次修复要堵的正是这个）。
  // 它们从字符串起点开始就是不折不扣的绝对 http(s) 地址：`isValidRedirectUri` 与
  // `appendQuery`（`redirect.ts`）对它们的解析结果完全一致，不存在「判断觉得安全、实际跳去
  // 别处」的落差。而「绝对地址只认协议、不管 host」是本次修复明确不能收紧的既有设计——
  // 具体 host 是否在注册白名单里只有后端知道，前端在这条没有后端回传的拒绝分支上天生查不到。
  it('放行（判断）：http://user@evil.example/cb —— 合法绝对 http(s) 地址，前端按协议放行，host 由后端注册白名单把关', () => {
    expect(isValidRedirectUri('http://user@evil.example/cb')).toBe(true)
  })
  it('放行（判断）：https:/\\evil —— 反斜杠在 http(s) 这类 special scheme 里被当斜杠处理，new URL() 把它解析成 https://evil（实测 origin: "https://evil"），仍是协议合法的绝对地址；`isValidRedirectUri` 与 appendQuery 对这个字符串的解析结果一致，不构成本轮修复要堵的“判断与实际跳转不一致”', () => {
    expect(isValidRedirectUri('https:/\\evil')).toBe(true)
  })
})
