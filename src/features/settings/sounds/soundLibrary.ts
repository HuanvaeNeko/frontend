/**
 * 通知提示音库（spec §7）。
 *
 * 内置两项（`water` 文件、`classic` 合成音）+ 用户上传的 MP3（IndexedDB）。
 * 设备级：`sessionScope` 的清盘只覆盖 localStorage / sessionStorage，IndexedDB 天然
 * 不在范围内——与 APP 把提示音放在本机用户目录同义，换账号不清。
 * 存 ArrayBuffer 不存 Blob：fake-indexeddb 用 structuredClone 复制值，happy-dom 的
 * Blob 不是 Node 平台对象会 DataCloneError；浏览器两者都行。
 */
export interface SoundOption { id: string; name: string; kind: 'builtin' | 'custom'; src: string | null }

export const BUILTIN_SOUNDS: readonly SoundOption[] = [
  { id: 'water', name: 'water', kind: 'builtin', src: '/sounds/water.mp3' },
  { id: 'classic', name: 'classic', kind: 'builtin', src: null },
]
export const DEFAULT_SOUND_ID = 'water'
export const MAX_CUSTOM_SOUND_BYTES = 2 * 1024 * 1024

const DB_NAME = 'huanvae-sounds'
const STORE = 'sounds'
const DB_VERSION = 1

interface CustomSoundRecord { id: string; name: string; type: string; bytes: ArrayBuffer; createdAt: string; seq: number }

export class SoundLibraryError extends Error {
  constructor(public readonly code: 'type' | 'size' | 'unavailable', message: string) {
    super(message)
    this.name = 'SoundLibraryError'
  }
}

export function isIndexedDbAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new SoundLibraryError('unavailable', '当前浏览器无法保存自定义提示音'))
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new SoundLibraryError('unavailable', '打开提示音库失败'))
  })
}

async function readAll(): Promise<CustomSoundRecord[]> {
  const db = await openDb()
  try {
    const rows = await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())
    // `createdAt` 的毫秒分辨率在同一批连续 `saveCustom` 里会撞车（`getAll()` 按主键
    // `id`——一个随机 UUID——排序，与写入顺序无关），单靠 `createdAt` 排会抖动；
    // `seq` 是次级键，撞车时退回写入顺序。
    return (rows as CustomSoundRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.seq - b.seq)
  } finally {
    db.close()
  }
}

const toOption = (r: CustomSoundRecord): SoundOption => ({ id: r.id, name: r.name, kind: 'custom', src: null })

export async function listCustom(): Promise<SoundOption[]> {
  if (!isIndexedDbAvailable()) return []
  return (await readAll()).map(toOption)
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

export async function saveCustom(file: File): Promise<SoundOption> {
  if (!isIndexedDbAvailable()) throw new SoundLibraryError('unavailable', '当前浏览器无法保存自定义提示音')
  if (file.type !== 'audio/mpeg') throw new SoundLibraryError('type', '只支持 MP3（audio/mpeg）')
  if (file.size > MAX_CUSTOM_SOUND_BYTES) throw new SoundLibraryError('size', '文件不能超过 2 MB')
  // bytes 必须在开事务之前 await 完：事务里除了同一事务下 IDBRequest 的 promise，
  // 不能再 await 别的东西（比如这个），否则事务会在这次 await 让出的间隙里自动提交关闭。
  const bytes = await file.arrayBuffer()
  const baseName = file.name.replace(/\.mp3$/i, '') || 'sound'
  const db = await openDb()
  try {
    // 「读现有名字 + 算唯一名 + 写入」必须挤在同一个 readwrite 事务里，不能像
    // 以前那样先开一个事务读（readAll()）、再另开一个事务写——两次开事务之间
    // 有一段没有事务保护的窗口，两个标签页（或同一页面里并发的两次 saveCustom）
    // 都可能在这个窗口内读到"还没有同名"，于是都算出同一个名字（实测复现：
    // Promise.all 两次同名上传，会都叫 'Ding'）。IndexedDB 的 readwrite 事务对
    // 同一个 store 在同源的多个连接（含不同标签页）之间是严格串行化的——
    // 把读和写挤进同一个事务，就是借用这条串行化保证把窗口关掉：后开始的那个
    // 事务，它的 getAll() 必然发生在前一个事务 put() 提交之后。
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    const existing = (await request(store.getAll())) as CustomSoundRecord[]
    const name = uniqueName(baseName, new Set(existing.map((r) => r.name)))
    const record: CustomSoundRecord = { id: `custom-${crypto.randomUUID()}`, name, type: file.type, bytes, createdAt: new Date().toISOString(), seq: existing.length + 1 }
    await request(store.put(record))
    return toOption(record)
  } finally {
    db.close()
  }
}

export async function deleteCustom(id: string): Promise<void> {
  const db = await openDb()
  try {
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id))
  } finally {
    db.close()
  }
}

/** 播放地址：builtin 静态路径；custom → blob URL（用完调 revoke）；classic / 未知 / 库不可用 → null */
export async function resolveSoundSrc(id: string): Promise<{ src: string; revoke: () => void } | null> {
  const builtin = BUILTIN_SOUNDS.find((s) => s.id === id)
  if (builtin) return builtin.src ? { src: builtin.src, revoke: () => {} } : null
  if (!isIndexedDbAvailable()) return null
  const db = await openDb()
  try {
    const row = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) as CustomSoundRecord | undefined
    if (!row) return null
    const url = URL.createObjectURL(new Blob([row.bytes], { type: row.type }))
    return { src: url, revoke: () => URL.revokeObjectURL(url) }
  } finally {
    db.close()
  }
}
