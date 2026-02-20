'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { UserPlus, Check, X, Loader2, Trash2, MoreVertical, Users, Clock, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFriendsStore } from '../../store/friendsStore'
import { useChatStore } from '../../store/chatStore'
import { useToast } from '@/hooks/use-toast'

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
        title: '错误',
        description: '请输入用户ID',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await sendFriendRequest(targetUserId.trim(), reason.trim() || undefined)
      toast({
        title: '成功',
        description: '好友请求已发送',
      })
      setShowAddDialog(false)
      setTargetUserId('')
      setReason('')
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '发送请求失败',
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
        title: '成功',
        description: '已添加好友',
      })
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '操作失败',
        variant: 'destructive',
      })
    }
  }

  // 拒绝好友请求
  const handleReject = async (applicantUserId: string) => {
    try {
      await rejectFriendRequest(applicantUserId)
      toast({
        title: '已拒绝',
        description: '已拒绝该好友请求',
      })
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '操作失败',
        variant: 'destructive',
      })
    }
  }

  // 删除好友
  const handleDeleteFriend = async (friendUserId: string, nickname: string) => {
    if (!confirm(`确定要删除好友 ${nickname} 吗？删除后将无法互相发送消息。`)) {
      return
    }
    
    setDeletingFriend(friendUserId)
    try {
      await removeFriend(friendUserId)
      toast({
        title: '已删除',
        description: `${nickname} 已从好友列表移除`,
      })
      // 如果当前正在查看被删除的好友的会话，清空选中
      if (selectedConversation?.id === friendUserId) {
        setSelectedConversation(null)
      }
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '操作失败',
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
        {/* 添加好友按钮 */}
        <div className="p-3">
          <Button className="w-full h-11 gap-2" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-4 w-4" />
            添加好友
          </Button>
        </div>

        {/* 好友列表 */}
        <div className="flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredFriends.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center h-32"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-muted">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">暂无好友</p>
              {searchQuery && <p className="text-xs text-muted-foreground mt-1">试试其他搜索条件</p>}
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredFriends.map((friend, index) => (
                <motion.div
                  key={friend.user_id}
                  className={`rounded-xl border p-3 transition-all hover:border-primary/30 hover:bg-accent/60 ${
                    selectedConversation?.id === friend.user_id ? 'border-primary/40 bg-accent' : 'border-transparent bg-card'
                  }`}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  custom={index}
                  layout
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => handleSelectFriend(friend)}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={friend.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {friend.nickname[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {/* 在线状态指示器 */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background ${isOnline(friend.user_id) ? 'bg-primary shadow-sm' : 'bg-muted-foreground'}`}
                        title={isOnline(friend.user_id) ? '在线' : '离线'}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {friend.nickname}
                          {isOnline(friend.user_id) && (
                            <span className="ml-1 text-xs text-primary">在线</span>
                          )}
                        </span>
                        {/* 未读计数角标 */}
                        {(() => {
                          const unread = useChatStore.getState().getFriendUnread(friend.user_id)
                          if (unread > 0) return (
                            <span className="shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-destructive text-[11px] font-bold text-destructive-foreground">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )
                          return null
                        })()}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {(() => {
                          const summary = useChatStore.getState().unreadSummary
                          const friendUnread = summary?.friend_unreads.find(u => u.friend_id === friend.user_id)
                          if (friendUnread?.last_message_preview) return friendUnread.last_message_preview
                          return friend.signature || friend.user_id
                        })()}
                      </div>
                    </div>
                  </button>
                  
                  {/* 操作菜单 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="p-2 rounded-lg hover:bg-accent transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteFriend(friend.user_id, friend.nickname)}
                        disabled={deletingFriend === friend.user_id}
                      >
                        {deletingFriend === friend.user_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        删除好友
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* 添加好友对话框 - 使用 Portal 渲染到 body */}
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
                  <h3 className="text-xl font-semibold mb-6 text-foreground">添加好友</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">用户ID</label>
                      <Input
                        type="text"
                        placeholder="输入用户ID"
                        value={targetUserId}
                        onChange={(e) => setTargetUserId(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">验证消息（可选）</label>
                      <Input
                        type="text"
                        placeholder="我是..."
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
                      取消
                    </Button>
                    <Button
                      className="flex-1 h-10"
                      onClick={handleSendRequest}
                      disabled={submitting}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          发送中...
                        </>
                      ) : (
                        '发送请求'
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
            <p className="text-sm text-muted-foreground">暂无新的好友请求</p>
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
                        同意
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(request.applicant_user_id)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                        拒绝
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
            <p className="text-sm text-muted-foreground">暂无已发送的请求</p>
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
                          ? '已同意'
                          : request.status === 'rejected'
                          ? '已拒绝'
                          : '待处理'}
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
