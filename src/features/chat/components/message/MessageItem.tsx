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
import type { Message } from '@/api/messages'
import type { GroupMessage } from '@/api/groupMessages'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { FileMessageContent } from './FileMessageContent'

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
        return (
           <Markdown 
             className={cn(
               "text-sm sm:text-[15px] leading-relaxed break-words chat-message-markdown",
               isOwn ? "text-primary-foreground" : "text-foreground"
             )}
           >
             {message.message_content}
           </Markdown>
        )
      case 'image':
        return (message.file_url || message.file_uuid) ? (
          <div className="overflow-hidden rounded-lg">
            <MessageImage 
              fileUrl={message.file_url} 
              fileUuid={message.file_uuid} 
              isFriendMessage={selectedConversationType === 'friend'} 
              onClick={() => onPreview(message)} 
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm italic opacity-70">
            <ImageIcon className="h-4 w-4" />
            <span>[{t('chat.window.image')}]</span>
          </div>
        )
      case 'video':
        return (message.file_url || message.file_uuid) ? (
          <div className="overflow-hidden rounded-lg">
            <MessageVideo 
              fileUrl={message.file_url} 
              fileUuid={message.file_uuid} 
              isFriendMessage={selectedConversationType === 'friend'} 
              className="max-w-[240px]" 
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm italic opacity-70">
            <Video className="h-4 w-4" />
            <span>[{t('chat.window.video')}]</span>
          </div>
        )
      case 'file':
        return (
          <FileMessageContent 
            message={message} 
            isOwn={isOwn} 
            onDownload={onDownload} 
          />
        )
      default:
        return <p className="text-sm opacity-70">[{t('chat.window.unsupportedMessageType')}]</p>
    }
  }

  return (
    <motion.div 
      className={cn("flex gap-3 group relative mb-4", isOwn ? "flex-row-reverse" : "flex-row")}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Avatar */}
      <Avatar className={cn(
        "h-8 w-8 md:h-9 md:w-9 shrink-0 mt-auto mb-1 ring-2 ring-background shadow-sm transition-transform hover:scale-105", 
        isOwn ? "order-1" : "order-none"
      )}>
        {groupMessage && <AvatarImage src={groupMessage.sender_avatar_url} />}
        <AvatarFallback className={cn(
          "text-[10px] md:text-xs font-bold",
          groupMessage ? "bg-orange-100 text-orange-600" : (isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
        )}>
          {groupMessage 
            ? (groupMessage.sender_nickname?.[0] || 'U').toUpperCase() 
            : isOwn 
              ? user?.nickname?.[0]?.toUpperCase() || 'U' 
              : 'U'}
        </AvatarFallback>
      </Avatar>
      
      <div className={cn("flex flex-col gap-1 max-w-[85%] md:max-w-[70%]", isOwn ? "items-end" : "items-start")}>
        {/* Sender Name (Group only) */}
        {groupMessage && !isOwn && (
          <span className="text-[10px] md:text-xs text-muted-foreground px-2 mb-0.5 font-medium">
            {groupMessage.sender_nickname}
          </span>
        )}

        {isRecalled ? (
          <div className="px-3 py-1.5 text-xs text-muted-foreground italic bg-muted/50 rounded-full border border-border/50">
            {isOwn ? t('chat.window.youRecalled') : t('chat.window.someoneRecalled', { name: groupMessage?.sender_nickname || t('chat.window.otherSide') })}
          </div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div 
                className={cn(
                  "relative px-4 py-2.5 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md",
                  // Bubble Shapes
                  isOwn 
                    ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground" 
                    : "rounded-2xl rounded-tl-sm bg-card border border-border/50 text-foreground hover:bg-card/80",
                  
                  // Media handling (remove padding/bg for pure media)
                  (message.message_type === 'image' || message.message_type === 'video') && "p-1 bg-transparent border-none shadow-none hover:bg-transparent hover:shadow-none",
                  
                  "min-w-[60px]" 
                )}
              >
                {renderContent()}
                
                {/* Timestamp - Overlay for media, inline-block for text */}
                {(message.message_type !== 'image' && message.message_type !== 'video') && (
                  <div className={cn(
                    "text-[9px] sm:text-[10px] mt-1 w-full flex items-center gap-1",
                    isOwn ? "justify-end text-primary-foreground/70" : "justify-end text-muted-foreground/60"
                  )}>
                    {new Date(message.send_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    {isOwn && <span className="w-1 h-1 rounded-full bg-current opacity-50" />}
                  </div>
                )}
              </div>
            </ContextMenuTrigger>
            
            {/* Context Menu Content ... (unchanged) */}
            <ContextMenuContent className="w-48 rounded-xl border-border/50 bg-background/95 backdrop-blur-md shadow-xl">
              {message.message_type === 'text' && (
                <ContextMenuItem onClick={() => onCopy(message.message_content)} className="rounded-lg cursor-pointer">
                  <Copy className="h-4 w-4 mr-2" />{t('chat.window.copy')}
                </ContextMenuItem>
              )}
              {/* ... other items ... */}
              {(message.file_url || message.file_uuid) && (
                <ContextMenuItem onClick={() => onDownload(message)} className="rounded-lg cursor-pointer">
                  <Download className="h-4 w-4 mr-2" />{t('chat.window.download')}
                </ContextMenuItem>
              )}
              
              {(message.message_type === 'image' || message.message_type === 'video') && (message.file_url || message.file_uuid) && (
                <ContextMenuItem onClick={() => onPreview(message)} className="rounded-lg cursor-pointer">
                  <ImageIcon className="h-4 w-4 mr-2" />{t('chat.window.preview')}
                </ContextMenuItem>
              )}

              {canRecall && (
                <>
                  <ContextMenuSeparator className="bg-border/50" />
                  <ContextMenuItem onClick={() => onRecall(message.message_uuid)} className="rounded-lg cursor-pointer text-orange-500 focus:text-orange-600">
                    <RotateCcw className="h-4 w-4 mr-2" />{t('chat.window.recall')}
                  </ContextMenuItem>
                </>
              )}
              
              <ContextMenuSeparator className="bg-border/50" />
              <ContextMenuItem 
                className="text-destructive focus:text-destructive rounded-lg cursor-pointer" 
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
