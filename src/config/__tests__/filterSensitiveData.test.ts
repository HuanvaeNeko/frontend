import { describe, expect, it } from 'vitest'
import { filterSensitiveData } from '../filterSensitiveData'

// 从 filterSensitiveData 自身的签名推导事件类型，不需要额外引入
// '@sentry/react-router' 的类型——被测函数已经带着这个约束。
type FilteredEvent = Parameters<typeof filterSensitiveData>[0]

function makeEvent(data?: Record<string, unknown>): FilteredEvent {
  return {
    ...(data === undefined ? {} : { request: { data } }),
  }
}

// beforeSend 的 password/token 过滤是 src/config/filterSensitiveData.ts 里唯一有
// 实际安全后果的逻辑（防止表单密码、鉴权 token 随异常事件一起上报到 Sentry），所以
// 单独提出来做单测覆盖。这份测试只从 '../filterSensitiveData' 这一个模块导入，
// 不引用任何 '@sentry/react-router' 的类型或包——这本身就是"这个模块对 Sentry
// 零依赖"的直接证明（该模块能被 server/index.ts 静态 import、而不用像 Sentry 本身
// 那样延迟到 NODE_ENV 落定之后才动态 import，原因也在这里）。
describe('filterSensitiveData', () => {
  it('把 request.data 里的 password 字段替换成 [Filtered]', () => {
    const event = makeEvent({ password: 'super-secret', username: 'huan' })

    const result = filterSensitiveData(event, {})
    const data = result.request?.data as Record<string, unknown>

    expect(data.password).toBe('[Filtered]')
  })

  it('把 request.data 里的 token 字段替换成 [Filtered]', () => {
    const event = makeEvent({ token: 'abc123', username: 'huan' })

    const result = filterSensitiveData(event, {})
    const data = result.request?.data as Record<string, unknown>

    expect(data.token).toBe('[Filtered]')
  })

  it('没有 request.data 时原样透传，不抛错', () => {
    const event = makeEvent()

    const result = filterSensitiveData(event, {})

    expect(result).toBe(event)
    expect(result.request).toBeUndefined()
  })

  it('password/token 之外的字段保持不变', () => {
    const event = makeEvent({ username: 'huan', age: 18, password: 'secret', token: 'tok' })

    const result = filterSensitiveData(event, {})
    const data = result.request?.data as Record<string, unknown>

    expect(data.username).toBe('huan')
    expect(data.age).toBe(18)
    expect(data.password).toBe('[Filtered]')
    expect(data.token).toBe('[Filtered]')
  })
})
