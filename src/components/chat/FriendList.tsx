import { useState, useEffect } from 'react'
import { UserPlus, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFriendsStore } from '../../store/friendsStore'
import { useChatStore } from '../../store/chatStore'
import { useToast } from '@/hooks/use-toast'

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
  } = useFriendsStore()
  
  const { setSelectedConversation, selectedConversation } = useChatStore()
  
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 筛选好友
  const filteredFriends = friends.filter((friend) =>
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
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">暂无好友</p>
              {searchQuery && <p className="text-xs mt-1">试试其他搜索条件</p>}
            </div>
          ) : (
            filteredFriends.map((friend) => (
              <button
                key={friend.user_id}
                className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                  selectedConversation?.id === friend.user_id ? 'bg-accent' : ''
                }`}
                onClick={() => handleSelectFriend(friend)}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={friend.avatar_url} />
                  <AvatarFallback>
                    {friend.nickname[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium truncate">{friend.nickname}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {friend.signature || friend.user_id}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* 添加好友对话框 */}
        {showAddDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-96 max-w-[90vw]">
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
            </div>
          </div>
        )}
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
        ) : pendingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">暂无新的好友请求</p>
          </div>
        ) : (
          pendingRequests.map((request) => (
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
        ) : sentRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">暂无已发送的请求</p>
          </div>
        ) : (
          sentRequests.map((request) => (
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
