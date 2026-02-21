'use client'

import { memo } from 'react'
import { FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n/I18nProvider'
import type { Message } from '@/features/chat/api/messages'

interface FileMessageContentProps {
  message: Message
  isOwn: boolean
  onDownload: (message: Message) => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

export const FileMessageContent = memo(({ message, isOwn, onDownload }: FileMessageContentProps) => {
  const { t } = useI18n()

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-xl min-w-[200px] transition-colors",
      isOwn ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-muted/50 hover:bg-muted"
    )}>
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
        isOwn ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
      )}>
        <FileText className="h-5 w-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", isOwn ? "text-primary-foreground" : "text-foreground")}>
          {message.message_content || t('chat.window.file')}
        </p>
        {message.file_size && (
          <p className={cn("text-xs", isOwn ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {formatFileSize(message.file_size)}
          </p>
        )}
      </div>

      {(message.file_url || message.file_uuid) && (
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn(
            "h-8 w-8 shrink-0 rounded-full", 
            isOwn ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-primary hover:bg-primary/10"
          )}
          onClick={(e) => {
            e.stopPropagation()
            onDownload(message)
          }}
        >
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
})

FileMessageContent.displayName = 'FileMessageContent'
