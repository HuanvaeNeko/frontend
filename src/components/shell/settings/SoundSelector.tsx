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

  useEffect(() => {
    let alive = true
    listCustom().then((list) => { if (alive) setCustom(list) }).catch((e: unknown) => { if (alive) { setCustom([]); setError(e instanceof Error ? e.message : String(e)) } })
    // 挂载拉一次；stop 引用稳定，不会因为列进依赖数组而二次触发。
    return () => { alive = false; stop() }
  }, [stop])

  const preview = async (id: string) => {
    stop()
    if (id === 'classic') { playSound('message'); return }
    const resolved = await resolveSoundSrc(id).catch(() => null)
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

  const libraryMessage = (e: unknown): string => {
    if (e instanceof SoundLibraryError) return t(`${NS}.${e.code === 'type' ? 'errType' : e.code === 'size' ? 'errSize' : 'errUnavailable'}`)
    return e instanceof Error ? e.message : String(e)
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
