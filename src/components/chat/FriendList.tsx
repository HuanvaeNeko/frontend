import { useState } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { UserPlus, Check, X, Loader2, Trash2, MoreVertical, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
        <div className="p-4 border-b">
          <Button
            className="w-full gap-2"
            onClick={() => setShowAddDialog(true)}
          >
            <UserPlus className="h-4 w-4" />
            添加好友
          </Button>
        </div>

        {/* 好友列表 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFriends.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center h-32 text-muted-foreground"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <Users className="h-12 w-12 mb-2 opacity-30" />
              <p className="text-sm">暂无好友</p>
              {searchQuery && <p className="text-xs mt-1">试试其他搜索条件</p>}
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
            {filteredFriends.map((friend, index) => (
              <motion.div
                key={friend.user_id}
                className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                  selectedConversation?.id === friend.user_id ? 'bg-accent' : ''
                }`}
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                custom={index}
                whileHover={{ backgroundColor: 'rgba(0,0,0,0.04)' }}
                layout
              >
                <button
                  className="flex items-center gap-3 flex-1 min-w-0"
                  onClick={() => handleSelectFriend(friend)}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={friend.avatar_url} />
                      <AvatarFallback>
                        {friend.nickname[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {/* 在线状态指示器 */}
                    <span 
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                        isOnline(friend.user_id) ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                      title={isOnline(friend.user_id) ? '在线' : '离线'}
                    />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{friend.nickname}</span>
                      {isOnline(friend.user_id) && (
                        <span className="text-xs text-green-600">在线</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {friend.signature || friend.user_id}
                    </div>
                  </div>
                </button>
                
                {/* 操作菜单 */}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="min-w-32 bg-white rounded-md shadow-lg border p-1 z-50"
                      align="end"
                    >
                      <DropdownMenu.Item
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded cursor-pointer outline-none"
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
          <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-card rounded-lg p-6 w-96 max-w-[90vw] shadow-2xl"
              variants={dialogVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <h3 className="text-lg font-semibold mb-4">添加好友</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="userId">用户ID</Label>
                  <Input
                    id="userId"
                    placeholder="输入用户ID"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="reason">验证消息（可选）</Label>
                  <Input
                    id="reason"
                    placeholder="我是..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button
                  variant="outline"
                  className="flex-1"
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
                  className="flex-1"
                  onClick={handleSendRequest}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      发送中...
                    </>
                  ) : (
                    '发送请求'
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    )
  }

  // 新朋友 - 待处理的请求
  if (subTab === 'new') {
    return (
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendingArray.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">暂无新的好友请求</p>
          </div>
        ) : (
          pendingArray.map((request) => (
            <div
              key={request.applicant_user_id}
              className="p-4 border-b hover:bg-accent transition-colors"
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {request.nickname[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{request.nickname}</div>
                  <div className="text-xs text-muted-foreground">
                    {request.applicant_user_id}
                  </div>
                  {request.reason && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {request.reason}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(request.request_time).toLocaleString()}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="default"
                      className="gap-1"
                      onClick={() => handleApprove(request.applicant_user_id)}
                    >
                      <Check className="h-3 w-3" />
                      同意
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => handleReject(request.applicant_user_id)}
                    >
                      <X className="h-3 w-3" />
                      拒绝
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  // 已发送 - 我发送的请求
  if (subTab === 'sent') {
    return (
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sentArray.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">暂无已发送的请求</p>
          </div>
        ) : (
          sentArray.map((request) => (
            <div
              key={request.target_user_id}
              className="p-4 border-b"
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {request.target_user_id[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{request.target_user_id}</div>
                  {request.reason && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {request.reason}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      request.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : request.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
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
            </div>
          ))
        )}
      </div>
    )
  }

  return null
}
