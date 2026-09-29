// biome-ignore-all lint/suspicious/noArrayIndexKey: 卡片节点没有 id；卡片改版时整份内容随 rev 替换，不存在同一列表里的增删重排
import { Bot } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { messagesApi } from '@/features/chat/api/messages'
import { CARD_MAX_DEPTH, type CardNode, cardChildren, cardNum, cardStr, isKnownCardNode, parseCard } from '@/features/chat/lib/card'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { cn } from '@/lib/utils'
import { CardChart } from './CardChart'

/**
 * 可交互卡片消息。结构、白名单见 `@/features/chat/lib/card`；节点字段与交互按 APP
 * CardRenderer.tsx / ActionButton.tsx 的约定：第一个顶层 heading 进卡片头；按钮按下
 * `POST /api/messages/interact`，value 是 `{ value?: 按钮的 value, form?: 下拉与输入的当前值 } | null`；
 * 不认识的节点、超过 32 层的嵌套只在该处显示占位，不连累整张卡片。原来网页端只有一句「卡片消息」。
 */

type FormValues = Record<string, string>
type Press = (node: CardNode) => Promise<void>

const newNonce = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

/** 只接受 http(s) 与站内相对路径；javascript:、data: 之类一律不渲染 */
function safeImageUrl(url: string): string | null {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(url)) return null
  return toAbsoluteApiUrl(url) ?? null
}

export function CardMessage({ messageUuid, content }: { messageUuid: string; content: string }) {
  const { t } = useI18n()
  const doc = useMemo(() => parseCard(content), [content])
  const [form, setForm] = useState<FormValues>({})
  const [failed, setFailed] = useState(false)

  if (!doc) return <p className="text-sm opacity-80">{t('chat.card.invalid')}</p>

  const press: Press = async (node) => {
    setFailed(false)
    const hasValue = node.value !== undefined
    const hasForm = Object.keys(form).length > 0
    const value = hasValue || hasForm ? { ...(hasValue ? { value: node.value } : {}), ...(hasForm ? { form } : {}) } : null
    try {
      await messagesApi.interact({ message_uuid: messageUuid, action_id: cardStr(node.action_id), value, nonce: newNonce() })
    } catch (error) {
      setFailed(true)
      throw error
    }
  }
  const setField = (id: string, value: string) => setForm((prev) => ({ ...prev, [id]: value }))

  const headerIndex = doc.nodes.findIndex((n) => isKnownCardNode(n) && n.type === 'heading')
  const header = headerIndex >= 0 ? doc.nodes[headerIndex] : null

  return (
    <div className="flex w-[min(360px,70vw)] flex-col gap-2 text-sm">
      {header && (
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Bot className="h-4 w-4" /></span>
          <h3 className="min-w-0 truncate font-semibold">{cardStr(header.text)}</h3>
        </div>
      )}
      {doc.nodes.map((node, i) => (i === headerIndex ? null : <CardNodeView key={i} node={node} depth={1} form={form} setField={setField} press={press} />))}
      {failed && <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{t('chat.card.actionFailed')}</p>}
    </div>
  )
}

function CardNodeView({ node, depth, form, setField, press }: { node: unknown; depth: number; form: FormValues; setField: (id: string, value: string) => void; press: Press }) {
  const { t } = useI18n()
  if (depth > CARD_MAX_DEPTH || !isKnownCardNode(node)) return <p className="text-xs opacity-70">{t('chat.card.unsupported')}</p>

  const kids = (className: string) => (
    <div className={className}>
      {cardChildren(node).map((child, i) => <CardNodeView key={i} node={child} depth={depth + 1} form={form} setField={setField} press={press} />)}
    </div>
  )

  switch (node.type) {
    case 'container':
    case 'column':
      return kids('flex min-w-0 flex-col gap-2')
    case 'row':
      return kids('flex flex-wrap gap-2 [&>*]:min-w-0 [&>*]:flex-1')
    case 'divider':
      return <hr className="border-border" />
    case 'text':
      return <p className="whitespace-pre-wrap break-words">{cardStr(node.text)}</p>
    case 'markdown':
      return <Markdown className="text-sm">{cardStr(node.text)}</Markdown>
    case 'heading': {
      const level = node.level === 1 ? 'text-base' : node.level === 2 ? 'text-[15px]' : 'text-sm'
      return <h4 className={cn('font-semibold', level)}>{cardStr(node.text)}</h4>
    }
    case 'image': {
      const src = safeImageUrl(cardStr(node.url))
      return src ? <img src={src} alt={cardStr(node.alt)} loading="lazy" className="max-h-64 w-auto max-w-full rounded-md" /> : null
    }
    case 'progress': {
      const max = cardNum(node.max) ?? 100
      const value = Math.min(max, Math.max(0, cardNum(node.value) ?? 0))
      const label = cardStr(node.label)
      return (
        <div className="space-y-1">
          <div className="flex justify-between text-xs opacity-80"><span>{label}</span><span>{Math.round((value / (max || 1)) * 100)}%</span></div>
          <div role="progressbar" aria-label={label || undefined} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${(value / (max || 1)) * 100}%` }} />
          </div>
        </div>
      )
    }
    case 'stat':
      return (
        <div className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="text-xs opacity-70">{cardStr(node.label)}</p>
          <p className="text-base font-semibold">{cardStr(node.value)}</p>
        </div>
      )
    case 'table': {
      const columns = Array.isArray(node.columns) ? node.columns.map(cardStr) : []
      const rows = Array.isArray(node.rows) ? node.rows.filter(Array.isArray) as unknown[][] : []
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            {columns.length > 0 && <thead><tr>{columns.map((c, i) => <th key={i} className="border-b border-border px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>}
            <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="border-b border-border/50 px-2 py-1">{cardStr(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    }
    case 'chart':
      return <CardChart node={node} />
    case 'log-tail': {
      const lines = (Array.isArray(node.lines) ? node.lines.map(cardStr) : []).slice(-200)
      return (
        <div className="space-y-1">
          {cardStr(node.title) && <p className="text-xs font-medium">{cardStr(node.title)}</p>}
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-4">{lines.join('\n')}</pre>
          {node.truncated === true && <p className="text-[11px] opacity-70">{t('chat.card.truncated')}</p>}
        </div>
      )
    }
    case 'button':
      return <div><ActionButton node={node} press={press} /></div>
    case 'action-buttons':
      return (
        <div className="flex flex-wrap gap-2">
          {(Array.isArray(node.buttons) ? node.buttons : []).filter((b): b is CardNode => typeof b === 'object' && b !== null).map((b, i) => <ActionButton key={i} node={b} press={press} />)}
        </div>
      )
    case 'select': {
      const id = cardStr(node.action_id)
      const options = (Array.isArray(node.options) ? node.options : []).filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
      return (
        <select aria-label={cardStr(node.label) || cardStr(node.placeholder) || id} value={form[id] ?? ''} onChange={(e) => setField(id, e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground">
          <option value="" disabled>{cardStr(node.placeholder) || t('chat.card.selectPlaceholder')}</option>
          {options.map((o, i) => <option key={i} value={cardStr(o.value)}>{cardStr(o.label) || cardStr(o.value)}</option>)}
        </select>
      )
    }
    case 'input': {
      const id = cardStr(node.action_id)
      return (
        <label className="block space-y-1">
          {cardStr(node.label) && <span className="text-xs opacity-80">{cardStr(node.label)}</span>}
          <input value={form[id] ?? ''} placeholder={cardStr(node.placeholder)} onChange={(e) => setField(id, e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" />
        </label>
      )
    }
    case 'sandbox':
      return <p className="text-xs opacity-80">{t('chat.card.richCard')}</p>
  }
}

type ButtonState = 'idle' | 'confirming' | 'running' | 'done' | 'failed'

/** APP ActionButton：confirm 的按钮先变「确认…？」3 秒；执行中 / 已执行 / 失败 2.5 秒后复原 */
function ActionButton({ node, press }: { node: CardNode; press: Press }) {
  const { t } = useI18n()
  const [state, setState] = useState<ButtonState>('idle')
  const label = cardStr(node.text) || cardStr(node.action_id)

  useEffect(() => {
    if (state !== 'confirming' && state !== 'done' && state !== 'failed') return
    const timer = setTimeout(() => setState('idle'), state === 'confirming' ? 3000 : 2500)
    return () => clearTimeout(timer)
  }, [state])

  const click = async () => {
    if (state === 'running') return
    if (node.confirm === true && state !== 'confirming') {
      setState('confirming')
      return
    }
    setState('running')
    try {
      await press(node)
      setState('done')
    } catch {
      setState('failed')
    }
  }

  const text = state === 'confirming' ? t('chat.card.confirm', { label })
    : state === 'running' ? t('chat.card.running')
    : state === 'done' ? t('chat.card.done')
    : state === 'failed' ? t('chat.card.failed')
    : label
  const variant = node.style === 'primary' ? 'default' : node.style === 'danger' ? 'destructive' : 'secondary'

  return <Button type="button" size="sm" variant={variant} disabled={state === 'running'} onClick={() => { void click() }}>{text}</Button>
}
