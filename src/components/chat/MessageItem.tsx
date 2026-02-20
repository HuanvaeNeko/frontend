'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Copy, Download, Image as ImageIcon, RotateCcw, Trash2, Video, FileText } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Markdown } from '@/components/ui/markdown'
import { MessageImage } from './MessageImage'
import { MessageVideo } from './MessageVideo'
import { useI18n } from '@/i18n/I18nProvider'
import type { Message } from '../../api/messages'
import type { GroupMessage } from '../../api/groupMessages'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { cn } from '@/lib/utils'

interface MessageItemProps {
  message: Message
  selectedConversationType: 'friend' | 'group'
  onCopy: (content: string) => void
  onDelete: (uuid: string) => void
  onRecall: (uuid: string) => void
  onDownload: (message: Message) => void
  onPreview: (message: Message) => void
  canRecall: boolean
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

export const MessageItem = memo(({ 
  message, 
  selectedConversationType, 
  onCopy, 
  onDelete, 
  onRecall, 
  onDownload, 
  onPreview,
  canRecall
}: MessageItemProps) => {
  const { t } = useI18n()
  const { user } = useAuthStore()
  
  const isOwn = message.sender_id === user?.user_id
  const groupMessage = selectedConversationType === 'group' ? (message as unknown as GroupMessage) : null
  const isRecalled = (message as Message & { is_recalled?: boolean }).is_recalled

  const renderContent = () => {
    switch (message.message_type) {
      case 'text':
        return <Markdown className="text-sm chat-message-markdown">{message.message_content}</Markdown>
      case 'image':
        return (message.file_url || message.file_uuid) ? (
          <MessageImage 
            fileUrl={message.file_url} 
            fileUuid={message.file_uuid} 
            isFriendMessage={selectedConversationType === 'friend'} 
            onClick={() => onPreview(message)} 
          />
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <ImageIcon className="h-4 w-4" />
            <span>[{t('chat.window.image')}]</span>
          </div>
        )
      case 'video':
        return (message.file_url || message.file_uuid) ? (
          <MessageVideo 
            fileUrl={message.file_url} 
            fileUuid={message.file_uuid} 
            isFriendMessage={selectedConversationType === 'friend'} 
            className="max-w-[240px] rounded-xl" 
          />
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4" />
            <span>[{t('chat.window.video')}]</span>
          </div>
        )
      case 'file':
        return (
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl min-w-[200px]",
            isOwn ? "bg-primary/20" : "bg-primary/10"
          )}>
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              isOwn ? "bg-primary/30" : "bg-primary/20"
            )}>
              <FileText className={cn("h-5 w-5", isOwn ? "text-primary-foreground" : "text-primary")} />
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
                className="h-8 w-8" 
                onClick={(e) => {
                  e.stopPropagation() // Prevent triggering parent click handlers
                  onDownload(message)
                }}
              >
                <Download className={cn("h-4 w-4", isOwn ? "text-primary-foreground" : "text-primary")} />
              </Button>
            )}
          </div>
        )
      default:
        return <p className="text-sm">[{t('chat.window.unsupportedMessageType')}]</p>
    }
  }

  return (
    <motion.div 
      className={cn("flex gap-3 group relative", isOwn ? "flex-row-reverse" : "flex-row")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Avatar className="h-8 w-8 md:h-10 md:w-10 shrink-0 mt-1">
        {groupMessage && <AvatarImage src={groupMessage.sender_avatar_url} />}
        <AvatarFallback className="bg-primary text-primary-foreground text-xs md:text-sm">
          {groupMessage 
            ? (groupMessage.sender_nickname?.[0] || 'U').toUpperCase() 
            : isOwn 
              ? user?.nickname?.[0]?.toUpperCase() || 'U' 
              : 'U'}
        </AvatarFallback>
      </Avatar>
      
      <div className={cn("flex flex-col gap-1 max-w-[85%] md:max-w-[70%]", isOwn ? "items-end" : "items-start")}>
        {groupMessage && !isOwn && (
          <span className="text-[10px] md:text-xs text-muted-foreground px-1">
            {groupMessage.sender_nickname}
          </span>
        )}

        {isRecalled ? (
          <div className="px-3 py-1.5 text-xs text-muted-foreground italic bg-muted/50 rounded-lg">
            {isOwn ? t('chat.window.youRecalled') : t('chat.window.someoneRecalled', { name: groupMessage?.sender_nickname || t('chat.window.otherSide') })}
          </div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div 
                className={cn(
                  "rounded-2xl px-3 py-2 md:px-4 md:py-2.5 cursor-pointer transition-colors break-words text-left relative",
                  isOwn 
                    ? "message-own bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" 
                    : "bg-card border border-border text-foreground hover:bg-accent/50",
                  // Fix for long words breaking layout
                  "min-w-[60px]" 
                )}
              >
                {renderContent()}
                <span className={cn(
                  "text-[10px] opacity-70 block mt-1 text-right w-full",
                  isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {new Date(message.send_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            </ContextMenuTrigger>
            
            <ContextMenuContent className="w-48">
              {message.message_type === 'text' && (
                <ContextMenuItem onClick={() => onCopy(message.message_content)}>
                  <Copy className="h-4 w-4 mr-2" />{t('chat.window.copy')}
                </ContextMenuItem>
              )}
              
              {(message.file_url || message.file_uuid) && (
                <ContextMenuItem onClick={() => onDownload(message)}>
                  <Download className="h-4 w-4 mr-2" />{t('chat.window.download')}
                </ContextMenuItem>
              )}
              
              {(message.message_type === 'image' || message.message_type === 'video') && (message.file_url || message.file_uuid) && (
                <ContextMenuItem onClick={() => onPreview(message)}>
                  <ImageIcon className="h-4 w-4 mr-2" />{t('chat.window.preview')}
                </ContextMenuItem>
              )}

              {canRecall && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onRecall(message.message_uuid)}>
                    <RotateCcw className="h-4 w-4 mr-2" />{t('chat.window.recall')}
                  </ContextMenuItem>
                </>
              )}
              
              <ContextMenuSeparator />
              <ContextMenuItem 
                className="text-destructive focus:text-destructive" 
                onClick={() => onDelete(message.message_uuid)}
              >
                <Trash2 className="h-4 w-4 mr-2" />{t('chat.window.delete')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
      </div>
    </motion.div>
  )
})

MessageItem.displayName = 'MessageItem'
