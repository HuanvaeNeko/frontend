// biome-ignore-all lint/suspicious/noArrayIndexKey: 卡片节点没有 id；卡片改版时整份内容随 rev 替换，不存在同一列表里的增删重排
import { useI18n } from '@/i18n/I18nProvider'
import { type CardNode, cardNum, cardStr } from '@/features/chat/lib/card'

interface Point { open: number; high: number; low: number; close: number }

const WIDTH = 320
const PAD = 8

/** chart 节点：`{ title, chart_type: 'candlestick' | 'area', data: [{timestamp, open, high, low, close}], height }`（APP CardChart.tsx）。纯 SVG，不引图表库 */
export function CardChart({ node }: { node: CardNode }) {
  const { t } = useI18n()
  const title = cardStr(node.title)
  const height = Math.min(480, Math.max(120, cardNum(node.height) ?? 240))
  const points: Point[] = (Array.isArray(node.data) ? node.data : []).flatMap((d) => {
    if (!d || typeof d !== 'object') return []
    const r = d as Record<string, unknown>
    const close = cardNum(r.close)
    if (close === undefined) return []
    const open = cardNum(r.open) ?? close
    return [{ open, close, high: cardNum(r.high) ?? Math.max(open, close), low: cardNum(r.low) ?? Math.min(open, close) }]
  })
  if (points.length === 0) return <p className="text-xs opacity-80">{t('chat.card.chartEmpty')}</p>

  const min = Math.min(...points.map((p) => p.low))
  const max = Math.max(...points.map((p) => p.high))
  const span = max - min || 1
  const y = (v: number) => PAD + (1 - (v - min) / span) * (height - PAD * 2)
  const step = WIDTH / points.length
  const x = (i: number) => step * i + step / 2

  return (
    <figure className="space-y-1">
      {title && <figcaption className="text-xs font-medium">{title}</figcaption>}
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={title || t('chat.card.chart')} className="w-full" style={{ height: height / 2 }} preserveAspectRatio="none">
        {node.chart_type === 'candlestick' ? (
          points.map((p, i) => {
            const up = p.close >= p.open
            const color = up ? 'var(--status-success, #16a34a)' : 'var(--destructive, #dc2626)'
            const top = y(Math.max(p.open, p.close))
            return (
              <g key={i} stroke={color} fill={color}>
                <line x1={x(i)} x2={x(i)} y1={y(p.high)} y2={y(p.low)} strokeWidth={1} />
                <rect x={x(i) - step * 0.3} y={top} width={step * 0.6} height={Math.max(1, y(Math.min(p.open, p.close)) - top)} />
              </g>
            )
          })
        ) : (
          <>
            <path d={`M ${x(0)} ${height - PAD} ${points.map((p, i) => `L ${x(i)} ${y(p.close)}`).join(' ')} L ${x(points.length - 1)} ${height - PAD} Z`} fill="var(--primary)" opacity={0.15} />
            <path d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.close)}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth={2} />
          </>
        )}
      </svg>
    </figure>
  )
}
