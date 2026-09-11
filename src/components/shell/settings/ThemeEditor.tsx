import { Check, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Button } from '@/components/ui/button'
import { DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS, GLASS_RANGES, OPACITY_GROUPS, THEME_PRESETS } from '@/features/theme/presets'
import { useThemeStore } from '@/features/theme/store'
import type { OpacityLevels, ThemePreset } from '@/features/theme/types'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

const NS = 'shell.settings.themeEditor'
const GROUP_LABEL_KEYS: Record<string, string> = {
  dialog: `${NS}.groupDialog`, background: `${NS}.groupBackground`, card: `${NS}.groupCard`,
  panel: `${NS}.groupPanel`, auxiliary: `${NS}.groupAuxiliary`, overlay: `${NS}.groupOverlay`,
}
const HEX6 = /^#[0-9a-fA-F]{6}$/

/** 50ms 防抖(APP 同款):拖动期间只更新本地显示值,停手 50ms 后写 store */
function useDebouncedNumber(value: number, commit: (v: number) => void) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setLocal(value) }, [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const onChange = (next: number) => {
    setLocal(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(next), 50)
  }
  return [local, onChange] as const
}

function RangeRow({ id, label, value, min, max, step, onCommit, format }: { id: string; label: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void; format?: (v: number) => string }) {
  const [local, onChange] = useDebouncedNumber(value, onCommit)
  return (
    <SettingsRow title={label} htmlFor={id} right={
      <span className="flex items-center gap-2">
        <input id={id} type="range" min={min} max={max} step={step} value={local} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="w-[140px]" />
        <span className="w-12 text-right text-[12px] tabular-nums text-muted-foreground">{format ? format(local) : local}</span>
      </span>
    } />
  )
}

function ColorField({ label, color, onChange }: { label: string; color: string; onChange: (hex: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(color)
  useEffect(() => { setText(color) }, [color])
  return (
    <SettingsRow title={label} right={
      <div className="relative">
        <button type="button" aria-label={label} onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-sm border border-[var(--border-default)] px-2 py-1 text-[12px]">
          <span className="h-5 w-5 rounded-sm border border-[var(--glass-border)]" style={{ backgroundColor: color }} />
          <span className="font-mono">{color.toUpperCase()}</span>
        </button>
        {open && (
          <div className="glass-card absolute right-0 z-20 mt-2 w-[220px] rounded-xl p-3">
            <HexColorPicker color={color} onChange={onChange} />
            <input aria-label={t(`${NS}.hexInput`)} value={text} onChange={(e) => { setText(e.target.value); if (HEX6.test(e.target.value)) onChange(e.target.value.toLowerCase()) }}
              onBlur={() => { if (!HEX6.test(text)) setText(color) }} className="mt-2 w-full rounded-sm border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[12px] text-foreground" />
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setOpen(false)}>{t(`${NS}.done`)}</Button>
          </div>
        )}
      </div>
    } />
  )
}

export function ThemeEditor() {
  const { t } = useI18n()
  const config = useThemeStore((s) => s.config)
  const { setPreset, setPrimaryColor, setAccentColor, setGlassConfig, setOpacityLevel, reset } = useThemeStore.getState()
  const glass = config.customColors.glass ?? DEFAULT_GLASS_CONFIG
  const levels = glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const presets = (Object.keys(THEME_PRESETS) as ThemePreset[]).map((key) => ({ key, ...THEME_PRESETS[key] }))

  return (
    <>
      <SettingsSection title={t(`${NS}.presetTitle`)}>
        <div role="radiogroup" aria-label={t(`${NS}.presetTitle`)} className="grid grid-cols-2 gap-2 p-2">
          {presets.map((p) => {
            const active = config.preset === p.key
            const name = t(`${NS}.${p.key === 'default' ? 'presetDefault' : 'presetCustom'}`)
            return (
              <label key={p.key}
                className={cn('flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left', active ? 'border-primary bg-[var(--primary-subtle)]' : 'border-[var(--border-subtle)]')}>
                {/* 原生 radio 而不是 `role="radio"` 的 button：后者触发 biome useSemanticElements
                    警告（有语义元素可用时不该借 role 伪装），与 AppearanceSection.tsx 的明暗三选一
                    同一个写法。aria-checked 与 checked 重复是有意的——测试对 aria-checked 做字面断言。 */}
                <input type="radio" name="theme-preset" className="sr-only" aria-label={name} aria-checked={active} checked={active} onChange={() => setPreset(p.key)} />
                <span className="flex gap-1">{p.previewColors.map((c) => <span key={c} className="h-5 w-5 rounded-full" style={{ backgroundColor: c }} />)}</span>
                <span className="flex items-center justify-between text-[13px] text-foreground">{name}{active && <Check className="h-4 w-4 text-primary" />}</span>
                <span className="text-[11px] text-muted-foreground">{t(`${NS}.${p.key === 'default' ? 'presetDefaultDesc' : 'presetCustomDesc'}`)}</span>
              </label>
            )
          })}
        </div>
      </SettingsSection>

      {config.preset === 'custom' && (
        <SettingsSection title={t(`${NS}.colorsTitle`)}>
          <SettingsGroup>
            <ColorField label={t(`${NS}.primary`)} color={config.customColors.primary} onChange={setPrimaryColor} />
            <ColorField label={t(`${NS}.accent`)} color={config.customColors.accent ?? config.customColors.primary} onChange={setAccentColor} />
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title={t(`${NS}.glassTitle`)}>
        <SettingsGroup>
          <ColorField label={t(`${NS}.glassBase`)} color={glass.baseColor} onChange={(hex) => setGlassConfig({ baseColor: hex })} />
          <RangeRow id="theme-blur" label={t(`${NS}.blur`)} value={glass.blur} {...GLASS_RANGES.blur} onCommit={(v) => setGlassConfig({ blur: v })} format={(v) => `${v}px`} />
          <RangeRow id="theme-saturation" label={t(`${NS}.saturation`)} value={glass.saturation} {...GLASS_RANGES.saturation} onCommit={(v) => setGlassConfig({ saturation: v })} format={(v) => `${v}%`} />
          <RangeRow id="theme-border" label={t(`${NS}.borderOpacity`)} value={glass.borderOpacity} {...GLASS_RANGES.borderOpacity} onCommit={(v) => setGlassConfig({ borderOpacity: v })} format={(v) => v.toFixed(2)} />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t(`${NS}.advancedTitle`)} description={t(`${NS}.advancedHint`)}>
        <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)} className="w-full px-3 py-2 text-left text-[13px] text-primary">
          {t(`${NS}.advancedTitle`)} · {advancedOpen ? t(`${NS}.collapse`) : t(`${NS}.expand`)}
        </button>
        {advancedOpen && OPACITY_GROUPS.map((group) => (
          <div key={group.key} className="border-t border-[var(--border-subtle)]">
            <div className="px-3 pt-2 text-[12px] font-semibold text-muted-foreground">{t(GROUP_LABEL_KEYS[group.key])}</div>
            <SettingsGroup>
              {group.levels.map((level) => (
                <RangeRow key={level} id={`theme-${level}`} label={level} value={levels[level as keyof OpacityLevels]} min={0} max={100} step={1} onCommit={(v) => setOpacityLevel(level as keyof OpacityLevels, v)} format={(v) => `${v}%`} />
              ))}
            </SettingsGroup>
          </div>
        ))}
      </SettingsSection>

      <div className="mb-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />{t(`${NS}.reset`)}</Button>
      </div>
    </>
  )
}
