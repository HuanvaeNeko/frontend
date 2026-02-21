'use client'

import { memo } from 'react'
import { MoreVertical, Settings, Phone, Video } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/I18nProvider'
import type { Conversation } from '@/store/chatStore'
import { cn } from '@/lib/utils'

interface ChatHeaderProps {
  conversation: Conversation
  hideMobileHeader?: boolean
  onGroupManage: () => void
}

export const ChatHeader = memo(({ 
  conversation, 
  hideMobileHeader = false, 
  onGroupManage 
}: ChatHeaderProps) => {
  const { t } = useI18n()

  return (
    <header className={cn(
      "px-4 sm:px-6 py-3 min-h-[64px] shrink-0 border-b border-border/40 bg-card/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20 shadow-sm",
      hideMobileHeader && "hidden md:flex"
    )}>
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="relative">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-background shadow-sm">
            <AvatarImage src={conversation.avatar} className="object-cover" />
            <AvatarFallback className={cn(
              "text-sm font-medium",
              conversation.type === 'group' ? "bg-orange-100 text-orange-600" : "bg-primary/10 text-primary"
            )}>
              {conversation.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {conversation.type === 'friend' && conversation.online && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
          )}
        </div>
        
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <h2 className="text-sm sm:text-base font-semibold text-foreground truncate leading-tight">
            {conversation.name}
          </h2>
          <span className="text-[11px] sm:text-xs text-muted-foreground truncate font-medium flex items-center gap-1.5">
            {conversation.type === 'friend' ? (
              conversation.online ? <span className="text-green-600">Online</span> : t('chat.window.friend')
            ) : (
              t('chat.window.group')
            )}
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full">
          <Phone className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full">
          <Video className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        {conversation.type === 'group' && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full" 
            onClick={onGroupManage} 
            title={t('chat.window.groupManage')}
          >
            <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full">
          <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </header>
  )
})

ChatHeader.displayName = 'ChatHeader'
