import { X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Button } from './button'

export function Toaster() {
  const { toasts } = useToast()

  return (
    <div className="fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:right-0 sm:top-0 sm:flex-col md:max-w-[420px]">
      {toasts.map(({ id, title, description, variant, action, ...props }) => (
        <div
          key={id}
          className={`group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all ${
            variant === 'destructive'
              ? 'border-red-500 bg-red-50 text-red-900'
              : 'border-gray-200 bg-white'
          } mb-2`}
          {...props}
        >
          <div className="grid gap-1">
            {title && <div className="text-sm font-semibold">{title}</div>}
            {description && (
              <div className="text-sm opacity-90">{description}</div>
            )}
          </div>
          {action}
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-2 top-2 h-6 w-6 rounded-md"
            onClick={() => props.onOpenChange?.(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
