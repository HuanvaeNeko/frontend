import { Play, Square, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ListLoading } from '@/components/shell/ListStates'
import { BUILTIN_SOUNDS, DEFAULT_SOUND_ID, SoundLibraryError, type SoundOption, deleteCustom, isIndexedDbAvailable, listCustom, resolveSoundSrc, saveCustom } from '@/features/settings/sounds/soundLibrary'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { playSound } from '@/hooks/useSound'
import { useI18n } from '@/i18n/I18nProvider'

const NS = 'shell.settings.sounds'

/** 通知分区里的提示音列表（spec §7）。试听走本组件自己的 Audio（与 SoundManager 无关），音量取主音量。 */
export function SoundSelector() {
  const { t } = useI18n()
  const selected = useSettingsStore((s) => s.notificationSound)
  const volume = useSettingsStore((s) => s.soundVolume)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const [custom, setCustom] = useState<SoundOption[] | null>(null)
  const [available] = useState(() => isIndexedDbAvailable())
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const audioRef = useRef<{ el: HTMLAudioElement; revoke: () => void } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // preview() 的"这次调用还是不是最新一次"令牌：每次新的 preview() 调用、以及组件
  // 卸载，都会递增它。resolveSoundSrc 的 await 之后重新核对一次，不相等就说明这次
  // 解析已经过期——要么被更晚的一次 preview() 顶掉，要么组件已经卸载——此时只
  // revoke 掉这次解析出来的资源，不再构造 Audio、不再碰任何 state（见 preview()
  // 与下面挂载 effect 的清理）。
  const previewTokenRef = useRef(0)

  // useCallback 钉住引用（依赖为空数组）：既让下面 effect 的清理函数能在定义前引用它，
  // 又能把它安全地放进依赖数组满足 useExhaustiveDependencies，不必用抑制注释。
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.el.pause()
      audioRef.current.revoke()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  // 同样用 useCallback 钉住，只依赖 t：locale 不换时引用不变，effect 依赖数组
  // 因此不会在每次渲染都触发（真的切换语言时会多拉一次列表，读操作本身幂等，无害）。
  // 非 SoundLibraryError 的情形统一回退到 loadFailed 的译文——不能直接吐 e.message，
  // 那可能是浏览器原生 DOMException 的英文文案，也可能是 soundLibrary.ts 内部兜底
  // 用的硬编码中文（比如 request() 找不到 req.error 时的 'IndexedDB 请求失败'），
  // 两者都不受这个组件的 i18n 控制，en-US 界面下会原样露出来。
  const libraryMessage = useCallback((e: unknown): string => {
    if (e instanceof SoundLibraryError) return t(`${NS}.${e.code === 'type' ? 'errType' : e.code === 'size' ? 'errSize' : 'errUnavailable'}`)
    return t(`${NS}.loadFailed`)
  }, [t])

  useEffect(() => {
    let alive = true
    listCustom().then((list) => { if (alive) setCustom(list) }).catch((e: unknown) => { if (alive) { setCustom([]); setError(libraryMessage(e)) } })
    // 挂载拉一次；stop / libraryMessage 引用稳定，不会因为列进依赖数组而二次触发。
    return () => { alive = false; previewTokenRef.current += 1; stop() }
  }, [stop, libraryMessage])

  const preview = async (id: string) => {
    stop()
    previewTokenRef.current += 1
    const token = previewTokenRef.current
    if (id === 'classic') { playSound('message'); return }
    const resolved = await resolveSoundSrc(id).catch(() => null)
    if (previewTokenRef.current !== token) {
      // 这次解析已经过期（被更晚一次 preview() 顶掉，或者组件已经卸载）：只把
      // 刚解析出来的资源（如果有）revoke 掉，不构造 Audio、不碰 audioRef/state
      // ——那些属于"当前"那次调用，不是这次。
      resolved?.revoke()
      return
    }
    if (!resolved) return
    const el = new Audio(resolved.src)
    el.volume = volume
    el.addEventListener('ended', () => stop())
    el.addEventListener('error', () => stop())
    audioRef.current = { el, revoke: resolved.revoke }
    setPlayingId(id)
    el.play().catch(() => stop())
  }

  const select = (id: string) => {
    setSetting('notificationSound', id)
    void preview(id)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const saved = await saveCustom(file)
      setCustom((prev) => [...(prev ?? []), saved])
      select(saved.id)
    } catch (e: unknown) {
      setError(libraryMessage(e))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (id: string) => {
    setConfirmId(null)
    setError(null)
    try {
      await deleteCustom(id)
      setCustom((prev) => (prev ?? []).filter((s) => s.id !== id))
      if (selected === id) setSetting('notificationSound', DEFAULT_SOUND_ID)
      if (playingId === id) stop()
    } catch (e: unknown) {
      setError(`${t(`${NS}.deleteFailed`)}: ${libraryMessage(e)}`)
    }
  }

  const label = (s: SoundOption) => (s.kind === 'builtin' ? t(`${NS}.${s.id}`) : s.name)
  // 已知缺口（本轮裁定不实现）：如果这台设备之前在 IndexedDB 可用时存过并选中过某个
  // custom-* 提示音，之后 IndexedDB 单独变得不可用（例如切到隐私模式——同一设备、
  // 同一账号，且必须是"先存后失效"这个顺序，触发条件很窄），选中的 id 不会出现在
  // 下面的 options 里（isIndexedDbAvailable() 为 false 时 listCustom() 直接返回空
  // 数组），于是没有任何一个 radio 会被选中。播放侧是安全的：resolveSoundSrc(id)
  // 对不可用的库也返回 null，playSelected 会回退到合成音，用户依然听得到提示音，
  // 只是选择器界面上看不出选中了谁。最小修法：在 options 里为"被选中但不在列表里
  // 的 custom-*"插入一个禁用态占位项。
  const options = [...BUILTIN_SOUNDS, ...(custom ?? [])]

  return (
    <div className="px-3 pb-3">
      <p className="py-2 text-[12px] text-muted-foreground">{t(`${NS}.hint`)}</p>
      {custom === null ? <ListLoading /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {options.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[14px] text-foreground">
                <input type="radio" name="notification-sound" value={s.id} checked={selected === s.id} onChange={() => select(s.id)} aria-label={label(s)} />
                <span className="truncate">{label(s)}</span>
                {s.kind === 'custom' && <span className="rounded-sm bg-[var(--bg-tertiary)] px-1.5 text-[11px] text-muted-foreground">{t(`${NS}.custom`)}</span>}
              </label>
              {playingId === s.id ? (
                <button type="button" className="subtle-btn" aria-label={t(`${NS}.stop`)} onClick={stop}><Square className="h-4 w-4" />{t(`${NS}.stop`)}</button>
              ) : (
                <button type="button" className="subtle-btn" aria-label={t(`${NS}.preview`)} onClick={() => void preview(s.id)}><Play className="h-4 w-4" />{t(`${NS}.preview`)}</button>
              )}
              {s.kind === 'custom' && (confirmId === s.id ? (
                <span className="flex gap-1">
                  <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" onClick={() => void remove(s.id)}>{t(`${NS}.confirm`)}</button>
                  <button type="button" className="subtle-btn" onClick={() => setConfirmId(null)}>{t(`${NS}.cancel`)}</button>
                </span>
              ) : (
                <button type="button" className="subtle-btn" aria-label={t(`${NS}.del`)} onClick={() => setConfirmId(s.id)}><Trash2 className="h-4 w-4" />{t(`${NS}.del`)}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {available ? (
        <label className="subtle-btn mt-2 cursor-pointer">
          <Upload className="h-4 w-4" />{uploading ? t(`${NS}.uploading`) : t(`${NS}.upload`)}
          <input ref={fileRef} type="file" accept="audio/mpeg" className="sr-only" aria-label={t(`${NS}.upload`)} disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
      ) : (
        <p className="mt-2 text-[12px] text-app-light">{t(`${NS}.errUnavailable`)}</p>
      )}
      {error && <p className="mt-2 text-[13px] text-destructive" role="alert">{error}</p>}
    </div>
  )
}
