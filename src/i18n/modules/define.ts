/** 与中文同形、叶子都是字符串 */
export type MessageShape<T> = { [K in keyof T]: T[K] extends string ? string : MessageShape<T[K]> }

/**
 * 定义一个文案模块：中英文并排写在同一个文件里，英文必须与中文逐 key 对齐——少一个、多一个都编译不过。
 * 在 messages.ts 里按命名空间挂到 zhCN / enUS 上。
 */
export function defineMessages<const Z extends Record<string, unknown>>(zh: Z, en: MessageShape<Z>): { zh: Z; en: MessageShape<Z> } {
  return { zh, en }
}
