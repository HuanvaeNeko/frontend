/**
 * 确定性随机源：世界每次重置都从同一个种子开始，于是同一串操作永远产生同一批 UUID——
 * 报告、用例、手工探索里引用到的 ID 在重置之后仍然成立。
 */
let state = 0x9e3779b9

export function reseed(seed = 0x9e3779b9): void {
  state = seed >>> 0
}

/** mulberry32 */
export function rand(): number {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randHex(length: number): string {
  let out = ''
  while (out.length < length) out += Math.floor(rand() * 0x100000000).toString(16).padStart(8, '0')
  return out.slice(0, length)
}

/** v4 形态的 UUID（版本位与变体位都按规范置好，前端的 UUID 正则认得它）。 */
export function uuid(): string {
  const hex = randHex(32).split('')
  hex[12] = '4'
  hex[16] = '89ab'[parseInt(hex[16], 16) & 3]
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]
}
