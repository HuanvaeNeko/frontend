'use client'

import * as React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

// ============================================
// 毛玻璃容器
// ============================================
interface GlassContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'light' | 'dark' | 'gradient'
  blur?: 'sm' | 'md' | 'lg' | 'xl'
  animated?: boolean
}

const GlassContainer = React.forwardRef<HTMLDivElement, GlassContainerProps>(
  ({ className, variant = 'default', blur = 'lg', animated = true, children, ...props }, ref) => {
    const blurMap = {
      sm: 'backdrop-blur-sm',
      md: 'backdrop-blur-md',
      lg: 'backdrop-blur-lg',
      xl: 'backdrop-blur-xl',
    }

    const variantStyles = {
      default: 'bg-white/70 border-white/50',
      light: 'bg-white/85 border-white/60',
      dark: 'bg-gray-900/70 border-white/10',
      gradient: 'bg-gradient-to-br from-white/80 via-white/60 to-white/70 border-white/50',
    }

    const baseStyles = cn(
      'relative rounded-2xl border',
      'shadow-[0_8px_32px_rgba(59,130,246,0.1),0_0_0_1px_rgba(255,255,255,0.5)_inset]',
      blurMap[blur],
      variantStyles[variant],
      className
    )

    if (animated) {
      return (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className={baseStyles}
          {...(props as HTMLMotionProps<'div'>)}
        >
          {children}
        </motion.div>
      )
    }

    return (
      <div ref={ref} className={baseStyles} {...props}>
        {children}
      </div>
    )
  }
)
GlassContainer.displayName = 'GlassContainer'

// ============================================
// 毛玻璃卡片
// ============================================
interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  animated?: boolean
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hover = true, animated = true, children, ...props }, ref) => {
    const baseStyles = cn(
      'relative p-4 rounded-xl',
      'bg-gradient-to-br from-white/90 via-white/70 to-white/80',
      'backdrop-blur-xl border border-white/60',
      'shadow-[0_8px_32px_rgba(59,130,246,0.1),0_0_40px_rgba(255,255,255,0.4),inset_0_1px_1px_rgba(255,255,255,0.8)]',
      hover && 'transition-all duration-300 hover:shadow-[0_12px_40px_rgba(59,130,246,0.15),0_0_50px_rgba(255,255,255,0.5)]',
      className
    )

    if (animated) {
      return (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          whileHover={hover ? { y: -2 } : undefined}
          className={baseStyles}
          {...(props as HTMLMotionProps<'div'>)}
        >
          {children}
        </motion.div>
      )
    }

    return (
      <div ref={ref} className={baseStyles} {...props}>
        {children}
      </div>
    )
  }
)
GlassCard.displayName = 'GlassCard'

// ============================================
// 毛玻璃按钮
// ============================================
interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => {
    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    }

    const variantStyles = {
      primary: cn(
        'bg-gradient-to-r from-blue-500/80 via-blue-600/80 to-blue-700/80',
        'text-white border-white/30',
        'hover:from-blue-500/90 hover:via-blue-600/90 hover:to-blue-700/90',
        'shadow-[0_4px_20px_rgba(59,130,246,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)]',
        'hover:shadow-[0_8px_28px_rgba(59,130,246,0.45)]'
      ),
      secondary: cn(
        'bg-white/70 text-gray-700 border-white/60',
        'hover:bg-white/85',
        'shadow-[0_2px_12px_rgba(0,0,0,0.06)]',
        'hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)]'
      ),
      ghost: cn(
        'bg-transparent text-gray-600 border-transparent',
        'hover:bg-white/50 hover:border-white/40'
      ),
      danger: cn(
        'bg-gradient-to-r from-red-500/80 to-red-600/80',
        'text-white border-red-300/30',
        'hover:from-red-500/90 hover:to-red-600/90',
        'shadow-[0_4px_20px_rgba(239,68,68,0.35)]'
      ),
    }

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -1 }}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
        className={cn(
          'relative font-medium rounded-xl border',
          'backdrop-blur-lg transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'flex items-center justify-center gap-2',
          sizeStyles[size],
          variantStyles[variant],
          className
        )}
        disabled={disabled || loading}
        {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
      >
        {loading && (
          <svg
            className="animate-spin h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </motion.button>
    )
  }
)
GlassButton.displayName = 'GlassButton'

// ============================================
// 毛玻璃输入框
// ============================================
interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}

const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, icon, ...props }, ref) => {
    return (
      <div
        className={cn(
          'relative flex items-center gap-2 px-3 py-2',
          'bg-white/60 rounded-lg border border-white/70',
          'backdrop-blur-lg transition-all duration-200',
          'shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_2px_rgba(255,255,255,0.9)]',
          'focus-within:border-blue-300/60 focus-within:bg-white/75',
          'focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.1),0_4px_16px_rgba(59,130,246,0.1)]',
          className
        )}
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          ref={ref}
          className={cn(
            'flex-1 bg-transparent outline-none text-sm text-gray-800',
            'placeholder:text-gray-400'
          )}
          {...props}
        />
      </div>
    )
  }
)
GlassInput.displayName = 'GlassInput'

// ============================================
// 毛玻璃文本区域
// ============================================
interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  resize?: boolean
}

const GlassTextarea = React.forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ className, resize = true, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'w-full px-3 py-2 min-h-[80px]',
          'bg-white/60 rounded-lg border border-white/70',
          'backdrop-blur-lg transition-all duration-200',
          'shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_2px_rgba(255,255,255,0.9)]',
          'focus:border-blue-300/60 focus:bg-white/75 focus:outline-none',
          'focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1),0_4px_16px_rgba(59,130,246,0.1)]',
          'text-sm text-gray-800 placeholder:text-gray-400',
          !resize && 'resize-none',
          className
        )}
        {...props}
      />
    )
  }
)
GlassTextarea.displayName = 'GlassTextarea'

// ============================================
// 毛玻璃徽章
// ============================================
interface GlassBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

const GlassBadge = React.forwardRef<HTMLSpanElement, GlassBadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variantStyles = {
      default: 'bg-gray-500/20 text-gray-700 border-gray-200/50',
      success: 'bg-green-500/20 text-green-700 border-green-200/50',
      warning: 'bg-yellow-500/20 text-yellow-700 border-yellow-200/50',
      error: 'bg-red-500/20 text-red-700 border-red-200/50',
      info: 'bg-blue-500/20 text-blue-700 border-blue-200/50',
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-3 py-1 text-sm font-medium',
          'rounded-full border backdrop-blur-sm',
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
GlassBadge.displayName = 'GlassBadge'

// ============================================
// 背景装饰球
// ============================================
interface BackgroundOrbsProps {
  count?: number
  className?: string
}

const BackgroundOrbs: React.FC<BackgroundOrbsProps> = ({ count = 3, className }) => {
  const orbStyles = [
    'w-96 h-96 -top-24 -right-24 bg-gradient-to-br from-blue-400/40 to-blue-500/30',
    'w-80 h-80 -bottom-20 -left-20 bg-gradient-to-br from-purple-400/35 to-indigo-500/25',
    'w-64 h-64 top-1/3 left-1/4 bg-gradient-to-br from-pink-400/30 to-rose-500/20',
    'w-72 h-72 bottom-1/4 right-1/4 bg-gradient-to-br from-cyan-400/30 to-teal-500/20',
    'w-56 h-56 top-1/4 right-1/3 bg-gradient-to-br from-amber-400/25 to-orange-500/15',
  ]

  return (
    <div className={cn('fixed inset-0 pointer-events-none overflow-hidden z-0', className)}>
      {orbStyles.slice(0, count).map((style, i) => (
        <motion.div
          key={i}
          className={cn(
            'absolute rounded-full blur-3xl',
            style
          )}
          animate={{
            x: [0, 30 * (i % 2 === 0 ? 1 : -1), 0],
            y: [0, 20 * (i % 2 === 0 ? -1 : 1), 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 15 + i * 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// ============================================
// 页面容器
// ============================================
interface GlassPageProps extends React.HTMLAttributes<HTMLDivElement> {
  showOrbs?: boolean
  orbCount?: number
}

const GlassPage = React.forwardRef<HTMLDivElement, GlassPageProps>(
  ({ className, showOrbs = true, orbCount = 3, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'min-h-screen w-full overflow-x-hidden overflow-y-auto',
          'bg-gradient-to-br from-blue-50 via-white to-purple-50',
          className
        )}
        {...props}
      >
        {showOrbs && <BackgroundOrbs count={orbCount} />}
        <div className="relative z-10 pb-8">{children}</div>
      </div>
    )
  }
)
GlassPage.displayName = 'GlassPage'

// ============================================
// 导出
// ============================================
export {
  GlassContainer,
  GlassCard,
  GlassButton,
  GlassInput,
  GlassTextarea,
  GlassBadge,
  BackgroundOrbs,
  GlassPage,
}

