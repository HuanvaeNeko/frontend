'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { Copy, Download, Image as ImageIcon, RotateCcw, Trash2, Video } from 'lucide-react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Markdown } from '@/components/ui/markdown'
import { MessageImage } from './MessageImage'
import { MessageVideo } from './MessageVideo'
import { useI18n } from '@/i18n/I18nProvider'
import type { Message } from '@/features/chat/api/messages'
import type { GroupMessage } from '@/features/chat/api/groupMessages'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { cn } from '@/lib/utils'
import { FileMessageContent } from './FileMessageContent'
import { GroupCardMessage, MeetingInviteCard } from './SpecialMessageContent'

interface MessageItemProps {
  message: Message
  selectedConversationType: 'friend' | 'group'
  onCopy: (content: string) => void
  onDelete: (uuid: string) => void
  onRecall: (uuid: string) => void
  onDownload: (message: Message) => void
  onPreview: (message: Message) => void
  canRecall: boolean
  /** 好友会话里对方的名字与头像（群消息用消息自带的 sender_*，自己的用资料） */
  peerName?: string
  peerAvatarUrl?: string
}

export const MessageItem = memo(({ 
  message, 
  selectedConversationType, 
  onCopy, 
  onDelete, 
  onRecall, 
  onDownload, 
  onPreview,
  canRecall,
  peerName,
  peerAvatarUrl,
}: MessageItemProps) => {
  const { t } = useI18n()
  const { user } = useAuthStore()
  const selfAvatarUrl = useProfileStore((s) => s.profile?.user_avatar_url)
  
  const isOwn = message.sender_id === user?.user_id
  const groupMessage = selectedConversationType === 'group' ? (message as unknown as GroupMessage) : null
  const isRecalled = (message as Message & { is_recalled?: boolean }).is_recalled
  // 头像：自己用资料头像；群消息用发送者；好友会话用对方（原来好友消息一律显示「U」）。
  // 相对地址必须转成绝对地址——在 /app/chat/g-xxx 下，相对的 avatars/... 会被解析成
  // /app/chat/avatars/...，永远 404。
  const avatarSrc = toAbsoluteApiUrl(isOwn ? (selfAvatarUrl || user?.avatar_url) : groupMessage ? groupMessage.sender_avatar_url : peerAvatarUrl)
  const avatarName = isOwn ? user?.nickname : groupMessage ? groupMessage.sender_nickname : peerName
  const avatarInitial = (avatarName?.trim()?.[0] || 'U').toUpperCase()

  const renderContent = () => {
    // message_type 的类型只列了四种，但后端还会发 system / meeting_invite / group_card / card
    switch (message.message_type as string) {
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
      // 会议邀请 / 群名片 / 可交互卡片：原来都落到「不支持的消息类型」
      case 'meeting_invite':
        return <MeetingInviteCard content={message.message_content} isOwn={isOwn} />
      case 'group_card':
        return <GroupCardMessage content={message.message_content} isOwn={isOwn} />
      case 'card':
        return <p className="text-sm opacity-80">{t('chat.window.cardMessage')}</p>
      default:
        return <p className="text-sm opacity-70">[{t('chat.window.unsupportedMessageType')}]</p>
    }
  }

  // 系统消息（「某某加入了群聊」之类）：居中的一行提示，不是某个人的气泡
  if ((message.message_type as string) === 'system') {
    return (
      <div role="note" data-message-uuid={message.message_uuid} className="flex justify-center py-1">
        <span className="max-w-[80%] rounded-full bg-muted/60 px-3 py-1 text-center text-xs text-muted-foreground">{message.message_content}</span>
      </div>
    )
  }

  return (
    <motion.div 
      data-message-uuid={message.message_uuid}
      className={cn("flex gap-3 group relative", isOwn ? "flex-row-reverse" : "flex-row")}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Avatar */}
      <Avatar className={cn(
        "h-8 w-8 md:h-9 md:w-9 shrink-0 mt-auto mb-1 ring-2 ring-background shadow-sm transition-transform hover:scale-105", 
        isOwn ? "order-1" : "order-none"
      )}>
        {avatarSrc && <AvatarImage src={avatarSrc} />}
        <AvatarFallback className={cn(
          "text-[10px] md:text-xs font-bold",
          groupMessage && !isOwn ? "bg-orange-100 text-orange-600" : (isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
        )}>
          {avatarInitial}
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
                    {format(new Date(message.send_time), 'HH:mm')}
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
