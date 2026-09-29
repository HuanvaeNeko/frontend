import { deflateSync } from 'node:zlib'

/**
 * 纯 TS 的 PNG 编码器 + 几种程序化图片（头像 identicon、风景照、柱状图、小程序图标）。
 *
 * 为什么现算而不是放一堆二进制图片进仓库：假后端要给十几个用户、几个群、若干聊天图片
 * 各配一张**真能解码**的图，程序化生成既确定（同一个种子永远同一张图），又不必维护资源文件。
 * 只编 8 位 RGB、无隔行、每行 filter=0 —— 浏览器解码这种最朴素的 PNG 没有任何兼容性问题。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) c = CRC_TABLE[(c ^ part[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32([typeBytes, data]))
  return out
}

/** `rgb` 为逐行紧排的 RGB 三字节，长度必须是 `width * height * 3`。 */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const stride = width * 3
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // 位深
  ihdr[9] = 2 // 真彩色 RGB
  return concat([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}

type Rgb = readonly [number, number, number]

/** 逐像素着色后编码。着色函数返回 0-255 的浮点也可以，这里统一截断。 */
export function paint(width: number, height: number, shade: (x: number, y: number) => Rgb): Uint8Array {
  const rgb = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = shade(x, y)
      const i = (y * width + x) * 3
      rgb[i] = clamp(r)
      rgb[i + 1] = clamp(g)
      rgb[i + 2] = clamp(b)
    }
  }
  return encodePng(width, height, rgb)
}

const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

/** FNV-1a，给 identicon 与配色取一个稳定的整数种子。 */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function hsl(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * GitHub 式 5×5 对称 identicon，128×128。头像与群头像共用，`variant` 只换形状密度，
 * 让群头像一眼看上去和人的头像不是同一种东西。
 */
export function identicon(seed: string, variant: 'user' | 'group' = 'user'): Uint8Array {
  const h = hashString(seed)
  const hue = h % 360
  const fg = hsl(hue, variant === 'group' ? 0.45 : 0.6, 0.52)
  const bg = hsl((hue + 180) % 360, 0.25, 0.94)
  const cells: boolean[] = []
  for (let i = 0; i < 15; i++) cells.push(((h >>> (i % 31)) ^ (h >>> ((i * 7) % 29))) % (variant === 'group' ? 3 : 2) === 0)
  const size = 128
  const pad = 14
  const cell = (size - pad * 2) / 5
  return paint(size, size, (x, y) => {
    const cx = Math.floor((x - pad) / cell)
    const cy = Math.floor((y - pad) / cell)
    if (cx < 0 || cy < 0 || cx > 4 || cy > 4) return bg
    const col = cx > 2 ? 4 - cx : cx
    return cells[col * 5 + cy] ? fg : bg
  })
}

/** 三种"随手拍"的风景照：晚霞、湖面、山路。640×400。 */
export function landscape(kind: 'sunset' | 'lake' | 'trail'): Uint8Array {
  const palettes = {
    sunset: { top: [40, 44, 110] as Rgb, horizon: [252, 150, 90] as Rgb, sun: [255, 214, 140] as Rgb, far: [92, 62, 110] as Rgb, near: [42, 30, 60] as Rgb, water: [70, 60, 120] as Rgb },
    lake: { top: [110, 170, 230] as Rgb, horizon: [214, 234, 248] as Rgb, sun: [255, 250, 225] as Rgb, far: [96, 132, 150] as Rgb, near: [50, 98, 74] as Rgb, water: [74, 136, 170] as Rgb },
    trail: { top: [150, 196, 235] as Rgb, horizon: [230, 238, 222] as Rgb, sun: [255, 245, 200] as Rgb, far: [120, 150, 110] as Rgb, near: [70, 110, 60] as Rgb, water: [150, 120, 80] as Rgb },
  }[kind]
  const w = 640
  const h = 400
  const horizon = 250
  const sunX = kind === 'sunset' ? 420 : 170
  const sunY = kind === 'sunset' ? 205 : 90
  return paint(w, h, (x, y) => {
    const farRidge = 190 + Math.sin(x / 57) * 18 + Math.sin(x / 23 + 1.3) * 7
    const nearRidge = 228 + Math.sin(x / 91 + 2) * 22 + Math.sin(x / 31) * 6
    if (y < horizon) {
      const dSun = Math.hypot(x - sunX, y - sunY)
      let sky = mix(palettes.top, palettes.horizon, (y / horizon) ** 1.4)
      if (dSun < 34) sky = palettes.sun
      else if (dSun < 90) sky = mix(palettes.sun, sky, (dSun - 34) / 56)
      if (y > nearRidge) return palettes.near
      if (y > farRidge) return mix(palettes.far, sky, 0.18)
      return sky
    }
    // 水面 / 山路：倒影加一点横向波纹
    const t = (y - horizon) / (h - horizon)
    const ripple = Math.sin(y * 0.9 + Math.sin(x / 13) * 2) * 10
    const reflectY = horizon - (y - horizon)
    const dSun = Math.abs(x - sunX) + Math.abs(reflectY - sunY) * 0.35
    let base = mix(palettes.water, palettes.near, t * 0.6)
    if (dSun < 70) base = mix(palettes.sun, base, dSun / 70)
    return [base[0] + ripple, base[1] + ripple, base[2] + ripple]
  })
}

/** 群里分享的一张"性能对比"柱状图。560×320。 */
export function barChart(): Uint8Array {
  const w = 560
  const h = 320
  const bars = [0.42, 0.78, 0.55, 0.91, 0.36, 0.64]
  const colors: Rgb[] = [[99, 102, 241], [16, 185, 129], [245, 158, 11], [239, 68, 68], [14, 165, 233], [168, 85, 247]]
  return paint(w, h, (x, y) => {
    if (y > 280 && y < 283 && x > 40 && x < 540) return [120, 120, 130]
    if (x > 40 && x < 43 && y > 30 && y < 283) return [120, 120, 130]
    if (y < 280 && (280 - y) % 50 === 0 && x > 43) return [232, 234, 240]
    const slot = Math.floor((x - 60) / 80)
    if (slot >= 0 && slot < bars.length) {
      const inBar = (x - 60) % 80 < 52
      const top = 280 - bars[slot] * 240
      if (inBar && y >= top && y < 280) return colors[slot]
    }
    return [252, 252, 254]
  })
}

/** 小程序图标，96×96 圆角方块 + 一个简单图形。 */
export function appIcon(kind: 'weather' | 'ledger' | 'film'): Uint8Array {
  const size = 96
  const [c1, c2]: [Rgb, Rgb] =
    kind === 'weather' ? [[56, 189, 248], [37, 99, 235]] : kind === 'ledger' ? [[52, 211, 153], [5, 150, 105]] : [[251, 146, 60], [219, 39, 119]]
  return paint(size, size, (x, y) => {
    const r = 20
    const cx = Math.min(Math.max(x, r), size - 1 - r)
    const cy = Math.min(Math.max(y, r), size - 1 - r)
    if (Math.hypot(x - cx, y - cy) > r) return [255, 255, 255]
    const bg = mix(c1, c2, (x + y) / (size * 2))
    const white: Rgb = [255, 255, 255]
    if (kind === 'weather') {
      if (Math.hypot(x - 40, y - 40) < 16) return [253, 224, 71]
      if (Math.hypot(x - 52, y - 58) < 14 || Math.hypot(x - 68, y - 60) < 11 || (y > 58 && y < 71 && x > 44 && x < 72)) return white
    } else if (kind === 'ledger') {
      if (x > 26 && x < 70 && [30, 44, 58].some((row) => y >= row && y < row + 6)) return white
      if (x > 26 && x < 50 && y >= 72 && y < 78) return white
    } else {
      const d = Math.hypot(x - 48, y - 48)
      if (d < 26 && d > 18) return white
      if (d < 6) return white
    }
    return bg
  })
}
