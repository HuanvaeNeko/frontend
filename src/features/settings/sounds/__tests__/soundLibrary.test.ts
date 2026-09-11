import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_SOUNDS, DEFAULT_SOUND_ID, MAX_CUSTOM_SOUND_BYTES, SoundLibraryError, deleteCustom, isIndexedDbAvailable, listCustom, resolveSoundSrc, saveCustom } from '../soundLibrary'

const mp3 = (name: string, bytes = 1024, type = 'audio/mpeg') => new File([new Uint8Array(bytes)], name, { type })

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock-1'), revokeObjectURL: vi.fn() }))
})
afterEach(() => vi.unstubAllGlobals())

describe('soundLibrary', () => {
  it('内置两项：water 指向 /sounds/water.mp3，classic 无文件（合成音）；默认 water', () => {
    expect(BUILTIN_SOUNDS).toEqual([
      { id: 'water', name: 'water', kind: 'builtin', src: '/sounds/water.mp3' },
      { id: 'classic', name: 'classic', kind: 'builtin', src: null },
    ])
    expect(DEFAULT_SOUND_ID).toBe('water')
    expect(MAX_CUSTOM_SOUND_BYTES).toBe(2_097_152)
  })
  it('saveCustom：存进库、name 去扩展名、id 以 custom- 开头；listCustom 按 createdAt 升序列出', async () => {
    const a = await saveCustom(mp3('Ding.mp3'))
    expect(a.kind).toBe('custom')
    expect(a.name).toBe('Ding')
    expect(a.id).toMatch(/^custom-/)
    expect(a.src).toBeNull()
    await saveCustom(mp3('dong.MP3'))
    expect((await listCustom()).map((s) => s.name)).toEqual(['Ding', 'dong'])
  })
  it('重名加序号：Ding、Ding (2)、Ding (3)', async () => {
    await saveCustom(mp3('Ding.mp3'))
    await saveCustom(mp3('Ding.mp3'))
    const third = await saveCustom(mp3('Ding.mp3'))
    expect(third.name).toBe('Ding (3)')
    expect((await listCustom()).map((s) => s.name)).toEqual(['Ding', 'Ding (2)', 'Ding (3)'])
  })
  it('只收 audio/mpeg：其它类型抛 code=type；超过 2 MB 抛 code=size；都不入库', async () => {
    await expect(saveCustom(mp3('a.wav', 10, 'audio/wav'))).rejects.toMatchObject({ code: 'type' })
    await expect(saveCustom(mp3('big.mp3', MAX_CUSTOM_SOUND_BYTES + 1))).rejects.toMatchObject({ code: 'size' })
    await expect(saveCustom(mp3('edge.mp3', MAX_CUSTOM_SOUND_BYTES))).resolves.toMatchObject({ name: 'edge' })
    expect(await listCustom()).toHaveLength(1)
    await expect(saveCustom(mp3('a.wav', 10, 'audio/wav'))).rejects.toBeInstanceOf(SoundLibraryError)
  })
  it('deleteCustom 删掉一条；删不存在的 id 不抛', async () => {
    const a = await saveCustom(mp3('a.mp3'))
    await saveCustom(mp3('b.mp3'))
    await deleteCustom(a.id)
    expect((await listCustom()).map((s) => s.name)).toEqual(['b'])
    await expect(deleteCustom('custom-nope')).resolves.toBeUndefined()
  })
  it('resolveSoundSrc：builtin 给静态路径；custom 给 blob URL 且 revoke 调 revokeObjectURL；classic / 未知 → null', async () => {
    expect(await resolveSoundSrc('water')).toMatchObject({ src: '/sounds/water.mp3' })
    expect(await resolveSoundSrc('classic')).toBeNull()
    expect(await resolveSoundSrc('custom-nope')).toBeNull()
    const a = await saveCustom(mp3('a.mp3'))
    const resolved = await resolveSoundSrc(a.id)
    expect(resolved?.src).toBe('blob:mock-1')
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBe(1024)
    resolved?.revoke()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  })
  it('indexedDB 不可用：isIndexedDbAvailable=false，listCustom 给空数组，saveCustom 抛 code=unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(isIndexedDbAvailable()).toBe(false)
    expect(await listCustom()).toEqual([])
    await expect(saveCustom(mp3('a.mp3'))).rejects.toMatchObject({ code: 'unavailable' })
  })
})
