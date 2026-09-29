'use client'

import { Fragment, memo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MessageItem } from '../message/MessageItem'
import { useI18n } from '@/i18n/I18nProvider'
import { formatDayDivider, isSameLocalDay } from '@/features/chat/lib/dayDivider'
import type { Message } from '@/features/chat/api/messages'
import type { Conversation } from '@/features/chat/store/chatStore'
import type { User } from '@/features/auth/types/auth'

interface MessageListProps {
  messages: Message[]
  conversation: Conversation
  user: User | null
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
  onScroll: () => void
  onCopy: (content: string) => void
  onDelete: (uuid: string) => void
  onRecall: (uuid: string) => void
  onDownload: (message: Message) => void
  onPreview: (message: Message) => void
  canRecallMessage: (time: string) => boolean
  messagesContainerRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

export const MessageList = memo(({
  messages,
  conversation,
  user,
  loading,
  hasMore,
  onLoadMore,
  onScroll,
  onCopy,
  onDelete,
  onRecall,
  onDownload,
  onPreview,
  canRecallMessage,
  messagesContainerRef,
  messagesEndRef
}: MessageListProps) => {
  const { t, locale } = useI18n()

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">{t('chat.window.noMessage')}</p>
      </div>
    )
  }

  return (
    <div 
      ref={messagesContainerRef} 
      className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3" 
      onScroll={onScroll}
    >
      {hasMore && (
        <div className="text-center">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onLoadMore} 
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('chat.window.loading')}
              </>
            ) : (
              t('chat.window.loadMore')
            )}
          </Button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {messages.map((message, index) => {
          const canRecall = user?.user_id === message.sender_id && canRecallMessage(message.send_time)
          // 气泡里只有 HH:mm：每天的第一条前插一条日期分隔，否则分不清是今天还是去年
          const prev = messages[index - 1]
          const dayLabel = !prev || !isSameLocalDay(prev.send_time, message.send_time)
            ? formatDayDivider(message.send_time, new Date(), locale)
            : ''

          return (
            <Fragment key={message.message_uuid}>
              {dayLabel && (
                <div role="separator" aria-label={dayLabel} className="flex justify-center py-1">
                  <span className="rounded-full bg-muted/70 px-3 py-0.5 text-[11px] text-muted-foreground">{dayLabel}</span>
                </div>
              )}
              <MessageItem
                message={message}
                selectedConversationType={conversation.type}
                peerName={conversation.type === 'friend' ? conversation.name : undefined}
                peerAvatarUrl={conversation.type === 'friend' ? conversation.avatar : undefined}
                onCopy={onCopy}
                onDelete={onDelete}
                onRecall={onRecall}
                onDownload={onDownload}
                onPreview={onPreview}
                canRecall={canRecall}
              />
            </Fragment>
          )
        })}
      </AnimatePresence>
      
      <div ref={messagesEndRef} />
    </div>
  )
})

MessageList.displayName = 'MessageList'
