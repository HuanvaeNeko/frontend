'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

/* ============================================
   BackgroundOrbs - 背景装饰浮动光球
   ============================================ */

interface BackgroundOrbsProps {
  count: number
  className?: string
}

export function BackgroundOrbs({ count, className }: BackgroundOrbsProps) {
  const orbs = React.useMemo(() => {
    const configs = [
      { size: 'w-72 h-72', color: 'from-blue-300/30 to-purple-300/20', pos: '-top-20 -left-20', delay: '0s' },
      { size: 'w-96 h-96', color: 'from-purple-300/25 to-pink-300/15', pos: '-bottom-32 -right-20', delay: '2s' },
      { size: 'w-64 h-64', color: 'from-cyan-300/20 to-blue-300/15', pos: 'top-1/3 right-1/4', delay: '4s' },
      { size: 'w-80 h-80', color: 'from-indigo-300/20 to-violet-300/15', pos: 'bottom-1/4 left-1/3', delay: '1s' },
      { size: 'w-56 h-56', color: 'from-sky-300/25 to-cyan-300/15', pos: 'top-1/4 left-1/2', delay: '3s' },
    ]
    return configs.slice(0, count)
  }, [count])

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {orbs.map((orb, i) => (
        <div
          key={i}
          className={cn(
            'absolute rounded-full bg-gradient-to-br blur-3xl animate-pulse',
            orb.size,
            orb.color,
            orb.pos,
          )}
          style={{ animationDelay: orb.delay, animationDuration: '6s' }}
        />
      ))}
    </div>
  )
}

/* ============================================
   GlassPage - 整页玻璃容器
   ============================================ */

interface GlassPageProps {
  orbCount?: number
  children: React.ReactNode
  className?: string
}

export function GlassPage({ orbCount = 4, children, className }: GlassPageProps) {
  return (
    <div className={cn('min-h-screen relative overflow-x-hidden bg-gradient-to-br from-blue-100 via-slate-50 to-purple-100', className)}>
      <BackgroundOrbs count={orbCount} />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

/* ============================================
   GlassCard - 玻璃拟态卡片
   ============================================ */

interface GlassCardProps {
  className?: string
  children: React.ReactNode
}

export function GlassCard({ className, children }: GlassCardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-6 backdrop-blur-xl',
        'bg-white/70 border border-blue-200/30',
        'shadow-lg shadow-blue-500/5',
        className,
      )}
    >
      {children}
    </div>
  )
}

/* ============================================
   GlassButton - 玻璃拟态按钮
   ============================================ */

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'danger' | 'secondary'
  size?: 'sm' | 'default' | 'lg'
  loading?: boolean
}

export function GlassButton({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: GlassButtonProps) {
  const variantStyles = {
    default: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5',
    ghost: 'bg-white/60 backdrop-blur-lg border border-blue-200/30 text-slate-600 hover:bg-white/90 hover:-translate-x-0.5',
    danger: 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25 hover:shadow-xl',
    secondary: 'bg-white/70 backdrop-blur-lg border border-blue-200/30 text-slate-700 hover:bg-white/90',
  }

  const sizeStyles = {
    sm: 'px-3 py-2 text-sm gap-1.5 rounded-xl',
    default: 'px-5 py-2.5 text-sm gap-2 rounded-xl',
    lg: 'px-6 py-3 text-base gap-2.5 rounded-2xl',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

/* ============================================
   GlassInput - 玻璃拟态输入框
   ============================================ */

interface GlassInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  icon?: React.ReactNode
}

export function GlassInput({ icon, className, ...props }: GlassInputProps) {
  return (
    <div className={cn('relative', className)}>
      {icon && (
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          {icon}
        </div>
      )}
      <input
        className={cn(
          'w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all duration-200',
          'bg-white/60 border border-blue-200/30 backdrop-blur-lg',
          'placeholder:text-slate-400',
          'focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 focus:bg-white/80',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          icon && 'pl-10',
        )}
        {...props}
      />
    </div>
  )
}

/* ============================================
   GlassTextarea - 玻璃拟态文本域
   ============================================ */

export function GlassTextarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all duration-200 resize-none',
        'bg-white/60 border border-blue-200/30 backdrop-blur-lg',
        'placeholder:text-slate-400',
        'focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 focus:bg-white/80',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  )
}

/* ============================================
   GlassBadge - 玻璃拟态徽章
   ============================================ */

interface GlassBadgeProps {
  variant: 'success' | 'warning' | 'error'
  className?: string
  children: React.ReactNode
}

export function GlassBadge({ variant, className, children }: GlassBadgeProps) {
  const variantStyles = {
    success: 'bg-emerald-100/80 text-emerald-700 border-emerald-200/50',
    warning: 'bg-amber-100/80 text-amber-700 border-amber-200/50',
    error: 'bg-red-100/80 text-red-700 border-red-200/50',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full border backdrop-blur-sm',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
