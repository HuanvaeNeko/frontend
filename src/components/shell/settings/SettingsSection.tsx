import type { ReactNode } from 'react'

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">{title}</h3>
      {description && <p className="mb-2 px-1 text-[12px] text-app-light">{description}</p>}
      <div className="glass-card rounded-xl p-1">{children}</div>
    </section>
  )
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[var(--border-subtle)]">{children}</div>
}

/** 一行：左侧图标+标题+副标题，右侧由调用方决定（开关 / 选择 / 按钮 / 文本） */
export function SettingsRow({ icon, title, subtitle, right, htmlFor }: { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--primary-subtle)] text-primary">{icon}</span>}
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[14px] text-foreground">{title}</label>
        {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
