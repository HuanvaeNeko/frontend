/**
 * 运行时字段校验小工具，喂给 {@link import('./apiEnvelope').EnvelopeOptions.parse} 用。
 *
 * ## 为什么这些函数值得单独成模块
 *
 * 这一组原本长在 `src/api/storage.ts` 里（第三批迁移）。messages / groupMessages
 * 是第四个需要它们的模块，再复制一份就会出现"三份互相漂移的 str()"——本仓
 * `src/types/models.ts` 与 `groupMessages.ts` 两份 GroupMessage 定义已经分叉过一次
 * （spec-msg-group 第 8 条），不要再来一次。
 *
 * ## 为什么用 `parse` 而不是 `require`
 *
 * `readEnvelope` 的 `require` 档判定的是"键存在且不为 undefined"，**`null` 算存在**
 * （见 `apiEnvelope.ts` 里 `EnvelopeOptions.require` 的 JSDoc）。而这批 bug 的核心恰恰
 * 是 `null` 和"整键缺省"：`messages: null` 用 `require` 会放行，把 `TypeError` 推迟到
 * 调用点的 `.map()`，又变回"失败伪装成数据"。所以列表和标量字段一律走 `parse`，
 * 由下面这些函数逐字段实打实检查一次。
 *
 * ## ⚠️ 防线是这些运行时函数，不是类型
 *
 * 不要因为返回类型写了 `string` 就以为调用点写不出 `?? ''`——`src/api/storage.ts`
 * 里 `uploadWithMultipart` 上方的注释记录了实测结论：把兜底值和 `!` 断言原样还原，
 * `tsc --noEmit` 照样通过。类型是文档，强制来自这里抛出的 Error 和覆盖它的测试。
 */

import type { Parser } from './apiEnvelope'

/** 排除 `null` 与数组的对象判定。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 给错误信息用的类型名，区分 `null` / `array` / `object`（`typeof` 三者都是 object）。 */
export function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

export function asRecord(input: unknown, what: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error(`${what} 应为对象，实际是 ${describe(input)}`)
  }
  return input
}

/** 非空字符串；空串和纯空白都算缺失（`toAbsoluteApiUrl('')` 会返回 undefined）。 */
export function str(payload: Record<string, unknown>, key: string, prefix = ''): string {
  const value = payload[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${prefix}${key} 缺失或不是非空字符串`)
  }
  return value
}

export function num(payload: Record<string, unknown>, key: string, prefix = ''): number {
  const value = payload[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${prefix}${key} 缺失或不是有限数字`)
  }
  return value
}

/** 文档写明"存在但可为 null"的数字字段：缺键仍然算错，`null` 才是合法的空。 */
export function nullableNum(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key]
  if (value === null) return null
  return num(payload, key)
}

export function nullableStr(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  if (value === null) return null
  return str(payload, key)
}

export function bool(payload: Record<string, unknown>, key: string, prefix = ''): boolean {
  const value = payload[key]
  if (typeof value !== 'boolean') {
    throw new Error(`${prefix}${key} 缺失或不是布尔值`)
  }
  return value
}

/** 只在部分场景出现的字段，缺席是正常的；出现了就必须是非空字符串。 */
export function optionalStr(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  if (value === undefined || value === null) return undefined
  return str(payload, key)
}

/**
 * 数组字段。**不返回 `[]` 兜底**——`messages: null` 必须炸，
 * 否则就是 friends 那批"稳定返回空列表、UI 一句『暂无消息』"的 bug 原样复发。
 */
export function arr(payload: Record<string, unknown>, key: string, prefix = ''): unknown[] {
  const value = payload[key]
  if (!Array.isArray(value)) {
    throw new Error(`${prefix}${key} 应为数组，实际是 ${describe(value)}`)
  }
  return value
}

/**
 * `data` 本身就是数组：校验它是数组，再逐行喂给 `row`——挂在 `readEnvelope` 的 `parse`
 * 档上，行级校验抛出的错误会被 `validatePayload` 接住、转成可上报的 `ApiShapeError`。
 * （从 `features/miniapps/api/miniapps.ts` 的私有版本提升而来，供好友黑名单 / OAuth 复用。）
 */
export function arrayOf<T>(row: (input: unknown) => T): Parser<T[]> {
  return {
    parse(input: unknown) {
      if (!Array.isArray(input)) throw new Error(`data 应为数组，实际是 ${describe(input)}`)
      return input.map(row)
    },
  }
}
