'use client'

import { useMemo } from 'react'

function makePath(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
}

function lissajous(width: number, height: number, a: number, b: number, delta: number, samples = 640): string {
  const cx = width / 2
  const cy = height / 2
  const rx = width * 0.34
  const ry = height * 0.32
  const points: Array<[number, number]> = []
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2
    points.push([cx + rx * Math.sin(a * t + delta), cy + ry * Math.sin(b * t)])
  }
  return makePath(points)
}

function rose(width: number, height: number, k: number, samples = 560): string {
  const cx = width / 2
  const cy = height / 2
  const rMax = Math.min(width, height) * 0.28
  const points: Array<[number, number]> = []
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2
    const r = rMax * Math.cos(k * t)
    points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
  }
  return makePath(points)
}

const formulas = [
  { title: 'Lissajous Field', expr: 'x = A·sin(a·t + δ), y = B·sin(b·t)' },
  { title: 'Rose Spectrum', expr: 'r = R·cos(k·θ),  θ ∈ [0, 2π]' },
  { title: 'Latency Dynamics', expr: 'Δ(t)=∫(q(t)-μ)dt / N' },
] as const

export default function MathCoreSection() {
  const width = 1080
  const height = 460

  const lissajousPath = useMemo(() => lissajous(width, height, 3, 2, Math.PI / 2), [])
  const rosePath = useMemo(() => rose(width, height, 5), [])

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:px-10">
      <div className="mb-8 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-slate-500 dark:text-slate-400">MATHEMATICAL CORE</p>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">用参数方程塑造通信系统的节奏</h2>
        </div>
        <span className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">TOPOLOGY · FLOW · SIGNAL</span>
      </div>

      <div
        data-reveal
        data-gsap="math-stage"
        className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/70 sm:p-6"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(14,165,233,0.15),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(16,185,129,0.12),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.08),transparent_40%)]" />
        <svg viewBox={`0 0 ${width} ${height}`} className="relative z-10 h-[260px] w-full sm:h-[320px]">
          <defs>
            <linearGradient id="mathCurveA" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="48%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
            <linearGradient id="mathCurveB" x1="100%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="55%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>

          <g opacity="0.18">
            {Array.from({ length: 12 }).map((_, i) => (
              <line key={`h-${i}`} x1="60" y1={40 + i * 32} x2={width - 60} y2={40 + i * 32} stroke="#64748b" strokeWidth="1" />
            ))}
            {Array.from({ length: 18 }).map((_, i) => (
              <line key={`v-${i}`} x1={80 + i * 52} y1="26" x2={80 + i * 52} y2={height - 26} stroke="#64748b" strokeWidth="1" />
            ))}
          </g>

          <path data-gsap="math-path" d={lissajousPath} fill="none" stroke="url(#mathCurveA)" strokeWidth="2.8" strokeLinecap="round" />
          <path data-gsap="math-path" d={rosePath} fill="none" stroke="url(#mathCurveB)" strokeWidth="1.8" strokeLinecap="round" opacity="0.78" />

          {[0.12, 0.31, 0.56, 0.77].map((ratio, i) => (
            <circle
              key={ratio}
              data-gsap="math-node"
              cx={120 + ratio * (width - 240)}
              cy={110 + (i % 2 === 0 ? 46 : 178)}
              r={8 + i}
              fill={i % 2 === 0 ? '#22d3ee' : '#34d399'}
              opacity="0.85"
            />
          ))}
        </svg>

        <div className="relative z-10 mt-4 grid gap-3 sm:grid-cols-3">
          {formulas.map((item) => (
            <article key={item.title} data-gsap="math-panel" className="rounded-2xl border border-white/80 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-950/55">
              <p className="text-xs tracking-[0.14em] text-slate-500 dark:text-slate-400">{item.title}</p>
              <p className="mt-2 font-mono text-xs leading-6 text-slate-700 dark:text-slate-200">{item.expr}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

