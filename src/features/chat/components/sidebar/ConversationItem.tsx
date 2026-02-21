'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { Check, CheckCheck } from 'lucide-react'

export interface ConversationItemProps {
  id: string
  name: string
  avatar?: string
  lastMessage?: string
  time?: string
  unreadCount?: number
  isOnline?: boolean
  isActive?: boolean
  isTyping?: boolean
  status?: 'sent' | 'delivered' | 'read'
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  type: 'friend' | 'group'
}

export const ConversationItem = memo(({
  id,
  name,
  avatar,
  lastMessage,
  time,
  unreadCount = 0,
  isOnline,
  isActive,
  isTyping,
  status,
  onClick,
  onContextMenu,
  type
}: ConversationItemProps) => {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        "group relative flex w-full items-center gap-3 p-3 text-left transition-all duration-200 ease-out",
        "hover:bg-accent/50 rounded-xl",
        isActive && "bg-accent shadow-sm ring-1 ring-border"
      )}
    >
      {/* Active Indicator Bar (Left) */}
      {isActive && (
        <motion.div 
          layoutId="active-indicator"
          className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-primary"
        />
      )}

      {/* Avatar Section */}
      <div className="relative shrink-0">
        <Avatar className="h-12 w-12 border-2 border-background shadow-sm transition-transform group-hover:scale-105">
          <AvatarImage src={avatar} className="object-cover" />
          <AvatarFallback className={cn(
            "text-sm font-medium",
            type === 'group' ? "bg-orange-100 text-orange-600" : "bg-primary/10 text-primary"
          )}>
            {name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Online Status Dot */}
        {type === 'friend' && isOnline !== undefined && (
          <span className={cn(
            "absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background transition-colors",
            isOnline ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"
          )} />
        )}
      </div>

      {/* Content Section */}
      <div className="flex flex-1 flex-col min-w-0 gap-0.5">
        <div className="flex items-center justify-between">
          <span className={cn(
            "font-semibold truncate transition-colors",
            isActive ? "text-foreground" : "text-foreground/90 group-hover:text-foreground"
          )}>
            {name}
          </span>
          {time && (
            <span className={cn(
              "text-[10px] shrink-0 tabular-nums",
              isActive ? "text-muted-foreground" : "text-muted-foreground/60 group-hover:text-muted-foreground"
            )}>
              {time}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isTyping ? (
              <span className="text-xs text-primary font-medium animate-pulse flex items-center gap-1">
                Typing<span className="animate-bounce">.</span><span className="animate-bounce delay-100">.</span><span className="animate-bounce delay-200">.</span>
              </span>
            ) : (
              <span className={cn(
                "text-xs truncate",
                isActive ? "text-muted-foreground" : "text-muted-foreground/70 group-hover:text-muted-foreground"
              )}>
                {status === 'read' && <CheckCheck className="inline w-3 h-3 mr-1 text-primary" />}
                {status === 'delivered' && <Check className="inline w-3 h-3 mr-1 text-muted-foreground" />}
                {lastMessage || "No messages yet"}
              </span>
            )}
          </div>

          {/* Unread Badge */}
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground shadow-sm animate-in zoom-in">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  )
})

ConversationItem.displayName = 'ConversationItem'
