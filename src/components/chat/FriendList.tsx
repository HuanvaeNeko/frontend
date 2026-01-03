'use client'

import { useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { UserPlus, Check, X, Loader2, Trash2, MoreVertical, Users, Clock, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
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
          <motion.button
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium text-white"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
            }}
            onClick={() => setShowAddDialog(true)}
            whileHover={{ 
              scale: 1.02,
              boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <UserPlus className="h-4 w-4" />
            添加好友
          </motion.button>
        </div>

        {/* 好友列表 */}
        <div className="flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : filteredFriends.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center h-32"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'rgba(147, 197, 253, 0.2)' }}
              >
                <Users className="h-8 w-8 text-blue-400" />
              </div>
              <p className="text-sm text-slate-500">暂无好友</p>
              {searchQuery && <p className="text-xs text-slate-400 mt-1">试试其他搜索条件</p>}
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredFriends.map((friend, index) => (
                <motion.div
                  key={friend.user_id}
                  className="conversation-item"
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  custom={index}
                  layout
                  style={{
                    background: selectedConversation?.id === friend.user_id 
                      ? 'linear-gradient(135deg, rgba(147, 197, 253, 0.25) 0%, rgba(147, 197, 253, 0.15) 100%)'
                      : 'transparent',
                  }}
                >
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0"
                    onClick={() => handleSelectFriend(friend)}
                  >
                    <div className="relative">
                      <div className="conv-avatar">
                        <Avatar className="h-full w-full">
                          <AvatarImage src={friend.avatar_url} />
                          <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-500 text-white">
                            {friend.nickname[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      {/* 在线状态指示器 */}
                      <span 
                        className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                        style={{
                          background: isOnline(friend.user_id) 
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : '#94a3b8',
                          boxShadow: isOnline(friend.user_id) 
                            ? '0 2px 6px rgba(34, 197, 94, 0.4)'
                            : 'none',
                        }}
                        title={isOnline(friend.user_id) ? '在线' : '离线'}
                      />
                    </div>
                    <div className="conv-info">
                      <div className="conv-header">
                        <span className="conv-name">
                          {friend.nickname}
                          {isOnline(friend.user_id) && (
                            <span className="text-xs text-green-500 ml-1">在线</span>
                          )}
                        </span>
                      </div>
                      <div className="conv-preview">
                        {friend.signature || friend.user_id}
                      </div>
                    </div>
                  </button>
                  
                  {/* 操作菜单 */}
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <button 
                        className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4 text-slate-400" />
                      </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        className="min-w-32 rounded-xl shadow-lg border p-1 z-50"
                        style={{
                          background: 'rgba(255, 255, 255, 0.95)',
                          backdropFilter: 'blur(20px)',
                          borderColor: 'rgba(147, 197, 253, 0.3)',
                        }}
                        align="end"
                      >
                        <DropdownMenu.Item
                          className="flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg cursor-pointer outline-none"
                          onClick={() => handleDeleteFriend(friend.user_id, friend.nickname)}
                          disabled={deletingFriend === friend.user_id}
                        >
                          {deletingFriend === friend.user_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          删除好友
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* 添加好友对话框 */}
        <AnimatePresence>
          {showAddDialog && (
            <>
              {/* 遮罩层 */}
              <motion.div
                className="fixed inset-0 z-[100]"
                style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(4px)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddDialog(false)}
              />
              {/* 对话框 */}
              <motion.div
                className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className="w-[400px] max-w-full pointer-events-auto"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    borderRadius: '24px',
                    border: '1px solid rgba(147, 197, 253, 0.3)',
                    boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.25)',
                    padding: '24px',
                  }}
                  variants={dialogVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-xl font-semibold mb-6 text-slate-700">添加好友</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-slate-600 mb-1.5 block">用户ID</label>
                      <input
                        type="text"
                        placeholder="输入用户ID"
                        value={targetUserId}
                        onChange={(e) => setTargetUserId(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                        style={{
                          background: 'rgba(255, 255, 255, 0.6)',
                          border: '1px solid rgba(147, 197, 253, 0.3)',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(147, 197, 253, 0.3)'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-slate-600 mb-1.5 block">验证消息（可选）</label>
                      <input
                        type="text"
                        placeholder="我是..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl text-slate-700 outline-none transition-all"
                        style={{
                          background: 'rgba(255, 255, 255, 0.6)',
                          border: '1px solid rgba(147, 197, 253, 0.3)',
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'
                          e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = 'rgba(147, 197, 253, 0.3)'
                          e.target.style.boxShadow = 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <motion.button
                      className="flex-1 py-3 px-4 rounded-xl font-medium text-slate-600"
                      style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(147, 197, 253, 0.3)',
                      }}
                      onClick={() => {
                        setShowAddDialog(false)
                        setTargetUserId('')
                        setReason('')
                      }}
                      disabled={submitting}
                      whileHover={{ background: 'rgba(147, 197, 253, 0.2)' }}
                      whileTap={{ scale: 0.98 }}
                    >
                      取消
                    </motion.button>
                    <motion.button
                      className="flex-1 py-3 px-4 rounded-xl font-medium text-white flex items-center justify-center gap-2"
                      style={{
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
                      }}
                      onClick={handleSendRequest}
                      disabled={submitting}
                      whileHover={{ 
                        boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
                      }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          发送中...
                        </>
                      ) : (
                        '发送请求'
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // 新朋友 - 待处理的请求
  if (subTab === 'new') {
    return (
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : pendingArray.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-32"
            variants={emptyStateVariants}
            initial="hidden"
            animate="visible"
          >
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(147, 197, 253, 0.2)' }}
            >
              <Clock className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-sm text-slate-500">暂无新的好友请求</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {pendingArray.map((request, index) => (
              <motion.div
                key={request.applicant_user_id}
                className="p-4 mb-2 rounded-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '1px solid rgba(147, 197, 253, 0.2)',
                }}
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={index}
              >
                <div className="flex items-start gap-3">
                  <div className="conv-avatar">
                    <Avatar className="h-full w-full">
                      <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-500 text-white">
                        {request.nickname[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700">{request.nickname}</div>
                    <div className="text-xs text-slate-400">
                      {request.applicant_user_id}
                    </div>
                    {request.reason && (
                      <div className="text-sm text-slate-500 mt-1 p-2 rounded-lg" style={{ background: 'rgba(147, 197, 253, 0.1)' }}>
                        &quot;{request.reason}&quot;
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-2">
                      {new Date(request.request_time).toLocaleString()}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <motion.button
                        className="flex items-center gap-1 px-4 py-2 rounded-lg font-medium text-white text-sm"
                        style={{
                          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        }}
                        onClick={() => handleApprove(request.applicant_user_id)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Check className="h-3 w-3" />
                        同意
                      </motion.button>
                      <motion.button
                        className="flex items-center gap-1 px-4 py-2 rounded-lg font-medium text-slate-600 text-sm"
                        style={{
                          background: 'rgba(255, 255, 255, 0.6)',
                          border: '1px solid rgba(147, 197, 253, 0.3)',
                        }}
                        onClick={() => handleReject(request.applicant_user_id)}
                        whileHover={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <X className="h-3 w-3" />
                        拒绝
                      </motion.button>
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
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
        ) : sentArray.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-32"
            variants={emptyStateVariants}
            initial="hidden"
            animate="visible"
          >
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'rgba(147, 197, 253, 0.2)' }}
            >
              <Send className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-sm text-slate-500">暂无已发送的请求</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {sentArray.map((request, index) => (
              <motion.div
                key={request.target_user_id}
                className="p-4 mb-2 rounded-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '1px solid rgba(147, 197, 253, 0.2)',
                }}
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={index}
              >
                <div className="flex items-start gap-3">
                  <div className="conv-avatar">
                    <Avatar className="h-full w-full">
                      <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-indigo-500 text-white">
                        {request.target_user_id[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700">{request.target_user_id}</div>
                    {request.reason && (
                      <div className="text-sm text-slate-500 mt-1">
                        {request.reason}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span 
                        className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{
                          background: request.status === 'approved'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : request.status === 'rejected'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(234, 179, 8, 0.15)',
                          color: request.status === 'approved'
                            ? '#16a34a'
                            : request.status === 'rejected'
                            ? '#dc2626'
                            : '#ca8a04',
                        }}
                      >
                        {request.status === 'approved'
                          ? '已同意'
                          : request.status === 'rejected'
                          ? '已拒绝'
                          : '待处理'}
                      </span>
                      <span className="text-xs text-slate-400">
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
