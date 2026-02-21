'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { UserPlus, Check, X, Loader2, Trash2, MoreVertical, Users, Clock, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFriendsStore } from '@/store/friendsStore'
import { useChatStore } from '@/store/chatStore'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'
import { ConversationItem } from './ConversationItem'

// 列表项动画配置
const listItemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  }),
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.2 },
  },
}

// 弹窗动画
const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.2 },
  },
}

// 空状态动画
const emptyStateVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
}

interface FriendListProps {
  subTab: 'main' | 'new' | 'sent'
  searchQuery: string
}

export default function FriendList({ subTab, searchQuery }: FriendListProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const {
    friends,
    pendingRequests,
    sentRequests,
    isLoading,
    sendFriendRequest,
    approveFriendRequest,
    rejectFriendRequest,
    removeFriend,
    isOnline,
  } = useFriendsStore()
  
  const { setSelectedConversation, selectedConversation } = useChatStore()
  
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingFriend, setDeletingFriend] = useState<string | null>(null)

  // 确保 friends 是数组
  const friendsArray = Array.isArray(friends) ? friends : []
  const pendingArray = Array.isArray(pendingRequests) ? pendingRequests : []
  const sentArray = Array.isArray(sentRequests) ? sentRequests : []

  // 筛选好友
  const filteredFriends = friendsArray.filter((friend) =>
    friend.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 发送好友请求
  const handleSendRequest = async () => {
    if (!targetUserId.trim()) {
      toast({
        title: t('chat.friendList.error'),
        description: t('chat.friendList.enterUserId'),
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await sendFriendRequest(targetUserId.trim(), reason.trim() || undefined)
      toast({
        title: t('chat.friendList.success'),
        description: t('chat.friendList.requestSent'),
      })
      setShowAddDialog(false)
      setTargetUserId('')
      setReason('')
    } catch (error) {
      toast({
        title: t('chat.friendList.failed'),
        description: error instanceof Error ? error.message : t('chat.friendList.requestSendFailed'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // 同意好友请求
  const handleApprove = async (applicantUserId: string) => {
    try {
      await approveFriendRequest(applicantUserId)
      toast({
        title: t('chat.friendList.success'),
        description: t('chat.friendList.friendAdded'),
      })
    } catch (error) {
      toast({
        title: t('chat.friendList.failed'),
        description: error instanceof Error ? error.message : t('chat.friendList.operationFailed'),
        variant: 'destructive',
      })
    }
  }

  // 拒绝好友请求
  const handleReject = async (applicantUserId: string) => {
    try {
      await rejectFriendRequest(applicantUserId)
      toast({
        title: t('chat.friendList.rejected'),
        description: t('chat.friendList.requestRejected'),
      })
    } catch (error) {
      toast({
        title: t('chat.friendList.failed'),
        description: error instanceof Error ? error.message : t('chat.friendList.operationFailed'),
        variant: 'destructive',
      })
    }
  }

  // 删除好友
  const handleDeleteFriend = async (friendUserId: string, nickname: string) => {
    if (!confirm(t('chat.friendList.deleteConfirm', { name: nickname }))) {
      return
    }
    
    setDeletingFriend(friendUserId)
    try {
      await removeFriend(friendUserId)
      toast({
        title: t('chat.friendList.deleted'),
        description: t('chat.friendList.friendRemoved', { name: nickname }),
      })
      // 如果当前正在查看被删除的好友的会话，清空选中
      if (selectedConversation?.id === friendUserId) {
        setSelectedConversation(null)
      }
    } catch (error) {
      toast({
        title: t('chat.friendList.deleteFailed'),
        description: error instanceof Error ? error.message : t('chat.friendList.operationFailed'),
        variant: 'destructive',
      })
    } finally {
      setDeletingFriend(null)
    }
  }

  // 选择好友开始聊天
  const handleSelectFriend = (friend: typeof friends[0]) => {
    setSelectedConversation({
      id: friend.user_id,
      type: 'friend',
      name: friend.nickname,
      avatar: friend.avatar_url,
      unreadCount: 0,
      online: false,
    })
  }

  // 主列表 - 好友
  if (subTab === 'main') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {/* 添加好友按钮 (List Header) */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="mb-2"
          >
            <Button 
              className="w-full h-10 gap-2 font-medium shadow-sm transition-all active:scale-[0.98] rounded-xl border-dashed border-2 border-border/50 hover:border-primary/50 hover:bg-primary/5 bg-transparent text-muted-foreground hover:text-primary" 
              variant="outline"
              onClick={() => setShowAddDialog(true)}
            >
              <UserPlus className="h-4 w-4" />
              {t('chat.friendList.addFriend')}
            </Button>
          </motion.div>

          {/* 好友列表 */}
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredFriends.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center h-48 text-center px-4"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-muted/50 ring-8 ring-muted/20">
                <Users className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-foreground">{t('chat.friendList.noFriends')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">{searchQuery ? t('chat.friendList.tryOtherSearch') : '添加好友开始聊天吧！'}</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredFriends.map((friend) => {
                const unread = useChatStore.getState().getFriendUnread(friend.user_id)
                const summary = useChatStore.getState().unreadSummary
                const friendUnread = summary?.friend_unreads.find(u => u.friend_id === friend.user_id)
                const lastMsg = friendUnread?.last_message_preview || friend.signature || "Say hi!"

                return (
                  <div key={friend.user_id} className="relative group">
                    <ConversationItem
                      id={friend.user_id}
                      type="friend"
                      name={friend.nickname}
                      avatar={friend.avatar_url}
                      lastMessage={lastMsg}
                      unreadCount={unread}
                      isOnline={isOnline(friend.user_id)}
                      isActive={selectedConversation?.id === friend.user_id}
                      onClick={() => handleSelectFriend(friend)}
                      // time={formatTime(friend.last_active)} // If we had this
                    />
                    
                    {/* Hover Actions (Desktop) */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                       <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-background shadow-sm border border-border">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                            onClick={() => handleDeleteFriend(friend.user_id, friend.nickname)}
                            disabled={deletingFriend === friend.user_id}
                          >
                            {deletingFriend === friend.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            {t('chat.friendList.deleteFriend')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Add Friend Dialog Portal ... (unchanged) */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {showAddDialog && (
              <>
                {/* 遮罩层 */}
                <motion.div
                  className="fixed inset-0 z-[9998] bg-foreground/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowAddDialog(false)}
                />
                {/* 对话框 */}
                <motion.div
                  className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                <motion.div
                  className="w-[400px] max-w-full pointer-events-auto rounded-2xl border bg-card p-6 shadow-xl"
                  variants={dialogVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-xl font-semibold mb-6 text-foreground">{t('chat.friendList.addFriend')}</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.friendList.userId')}</label>
                      <Input
                        type="text"
                        placeholder={t('chat.friendList.enterUserIdPlaceholder')}
                        value={targetUserId}
                        onChange={(e) => setTargetUserId(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.friendList.verifyMessageOptional')}</label>
                      <Input
                        type="text"
                        placeholder={t('chat.friendList.verifyPlaceholder')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="h-10"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <Button
                      variant="outline"
                      className="flex-1 h-10"
                      onClick={() => {
                        setShowAddDialog(false)
                        setTargetUserId('')
                        setReason('')
                      }}
                      disabled={submitting}
                    >
                      {t('chat.friendList.cancel')}
                    </Button>
                    <Button
                      className="flex-1 h-10"
                      onClick={handleSendRequest}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('chat.friendList.sending')}
                        </>
                      ) : (
                        t('chat.friendList.sendRequest')
                      )}
                    </Button>
                  </div>
                </motion.div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    )
  }

  // 新朋友 - 待处理的请求
  if (subTab === 'new') {
    return (
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : pendingArray.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-32"
            variants={emptyStateVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-muted">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('chat.friendList.noNewRequests')}</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {pendingArray.map((request, index) => (
              <motion.div
                key={request.applicant_user_id}
                className="p-4 mb-2 rounded-xl border bg-card"
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={index}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {request.nickname[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{request.nickname}</div>
                    <div className="text-xs text-muted-foreground">
                      {request.applicant_user_id}
                    </div>
                    {request.reason && (
                      <div className="text-sm text-muted-foreground mt-1 p-2 rounded-lg bg-muted/60">
                        &quot;{request.reason}&quot;
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      {new Date(request.request_time).toLocaleString()}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        onClick={() => handleApprove(request.applicant_user_id)}
                      >
                        <Check className="h-3 w-3" />
                        {t('chat.friendList.approve')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(request.applicant_user_id)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                        {t('chat.friendList.reject')}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    )
  }

  // 已发送 - 我发送的请求
  if (subTab === 'sent') {
    return (
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sentArray.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-32"
            variants={emptyStateVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-muted">
              <Send className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t('chat.friendList.noSentRequests')}</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {sentArray.map((request, index) => (
              <motion.div
                key={request.target_user_id}
                className="p-4 mb-2 rounded-xl border bg-card"
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={index}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {request.target_user_id[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{request.target_user_id}</div>
                    {request.reason && (
                      <div className="text-sm text-muted-foreground mt-1">
                        {request.reason}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${request.status === 'approved' ? 'bg-primary/15 text-primary' : request.status === 'rejected' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                        {request.status === 'approved'
                          ? t('chat.friendList.statusApproved')
                          : request.status === 'rejected'
                          ? t('chat.friendList.statusRejected')
                          : t('chat.friendList.statusPending')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(request.request_time).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    )
  }

  return null
}
