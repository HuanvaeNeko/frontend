'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  Users, 
  UserPlus, 
  UserMinus, 
  Loader2,
  Search,
  MessageCircle,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GlassPage, GlassCard, GlassButton, GlassInput, GlassBadge } from '@/components/ui/glass'
import { useFriendsStore } from '../store/friendsStore'
import { useToast } from '@/hooks/use-toast'

export default function Friends() {
  const router = useRouter()
  const { toast } = useToast()
  const { 
    friends, 
    pendingRequests, 
    sentRequests,
    isLoading,
    loadFriends, 
    loadPendingRequests,
    loadSentRequests,
    sendFriendRequest, 
    approveFriendRequest, 
    rejectFriendRequest, 
    removeFriend,
  } = useFriendsStore()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [newFriendId, setNewFriendId] = useState('')
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'sent'>('friends')
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    loadFriends().catch(console.error)
    loadPendingRequests().catch(console.error)
    loadSentRequests().catch(console.error)
  }, [loadFriends, loadPendingRequests, loadSentRequests])

  const handleAddFriend = async () => {
    if (!newFriendId.trim()) {
      toast({ title: '请输入用户ID', variant: 'destructive' })
      return
    }
    try {
      await sendFriendRequest(newFriendId.trim())
      toast({ title: '好友请求已发送', description: '等待对方确认' })
      setNewFriendId('')
    } catch (error) {
      toast({ 
        title: '发送失败', 
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive' 
      })
    }
  }

  const handleAcceptRequest = async (applicantUserId: string) => {
    setProcessingId(applicantUserId)
    try {
      await approveFriendRequest(applicantUserId)
      toast({ title: '已添加好友' })
    } catch (error) {
      toast({ 
        title: '操作失败', 
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive' 
      })
    } finally {
      setProcessingId(null)
    }
  }

  const handleRejectRequest = async (applicantUserId: string) => {
    setProcessingId(applicantUserId)
    try {
      await rejectFriendRequest(applicantUserId)
      toast({ title: '已拒绝请求' })
    } catch (error) {
      toast({ 
        title: '操作失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive' 
      })
    } finally {
      setProcessingId(null)
    }
  }

  const handleRemoveFriend = async (friendUserId: string, nickname: string) => {
    if (!confirm(`确定要删除好友 ${nickname} 吗？`)) return
    setProcessingId(friendUserId)
    try {
      await removeFriend(friendUserId)
      toast({ title: '已删除好友' })
    } catch (error) {
      toast({ 
        title: '删除失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive' 
      })
    } finally {
      setProcessingId(null)
    }
  }

  const filteredFriends = friends.filter(friend =>
    friend.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    friend.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const tabs = [
    { id: 'friends' as const, label: '我的好友', count: friends.length, icon: Users },
    { id: 'requests' as const, label: '好友请求', count: pendingRequests.length, icon: MessageCircle },
    { id: 'sent' as const, label: '已发送', count: sentRequests.length, icon: Clock },
  ]

  return (
    <GlassPage orbCount={4}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 顶部导航 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <GlassButton variant="ghost" onClick={() => router.push('/chat')}>
            <ArrowLeft size={18} />
            返回聊天
          </GlassButton>
        </motion.div>

        {/* 页面标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 flex items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
            <Users size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              好友管理
            </h1>
            <p className="text-gray-500">管理您的好友关系</p>
          </div>
        </motion.div>

        {/* 添加好友 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          <GlassCard className="p-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <GlassInput
                  placeholder="输入用户ID添加好友"
                  value={newFriendId}
                  onChange={(e) => setNewFriendId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                  icon={<UserPlus size={18} />}
                  disabled={isLoading}
                />
              </div>
              <GlassButton onClick={handleAddFriend} loading={isLoading}>
                发送请求
              </GlassButton>
            </div>
          </GlassCard>
        </motion.div>

        {/* 标签切换 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-6"
        >
          <div className="flex gap-2 p-1 bg-white/40 backdrop-blur-lg rounded-xl border border-white/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white shadow-md text-blue-600'
                    : 'text-gray-600 hover:bg-white/50'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id 
                      ? 'bg-blue-100 text-blue-600' 
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* 好友列表 */}
        <AnimatePresence mode="wait">
          {activeTab === 'friends' && (
            <motion.div
              key="friends"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* 搜索框 */}
              <GlassCard className="mb-4 p-4">
                <GlassInput
                  placeholder="搜索好友..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  icon={<Search size={18} />}
                />
              </GlassCard>

              <GlassCard>
                {isLoading && friends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-gray-500">加载中...</p>
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Users size={48} className="mb-4 opacity-50" />
                    <p>{searchTerm ? '未找到匹配的好友' : '暂无好友'}</p>
                    <p className="text-sm mt-1">发送好友请求添加新朋友</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100/50">
                    {filteredFriends.map((friend, index) => (
                      <motion.div
                        key={friend.user_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-4 hover:bg-white/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12 ring-2 ring-white shadow-md">
                            <AvatarImage src={friend.avatar_url} />
                            <AvatarFallback className="bg-gradient-to-br from-green-400 to-emerald-500 text-white font-medium">
                              {friend.nickname[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-gray-800">{friend.nickname}</p>
                            <p className="text-sm text-gray-500">ID: {friend.user_id}</p>
                          </div>
                        </div>
                        <GlassButton
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemoveFriend(friend.user_id, friend.nickname)}
                          loading={processingId === friend.user_id}
                        >
                          <UserMinus size={16} />
                          删除
                        </GlassButton>
                      </motion.div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'requests' && (
            <motion.div
              key="requests"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <GlassCard>
                {isLoading && pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-gray-500">加载中...</p>
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <MessageCircle size={48} className="mb-4 opacity-50" />
                    <p>暂无好友请求</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100/50">
                    {pendingRequests.map((request, index) => (
                      <motion.div
                        key={request.applicant_user_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-4"
                      >
                        <div className="flex items-start gap-4">
                          <Avatar className="h-12 w-12 ring-2 ring-white shadow-md">
                            <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-500 text-white font-medium">
                              {request.nickname[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800">{request.nickname}</p>
                            <p className="text-sm text-gray-500">ID: {request.applicant_user_id}</p>
                            {request.reason && (
                              <p className="text-sm text-gray-600 mt-1 bg-gray-50/50 rounded-lg px-3 py-2">
                                "{request.reason}"
                              </p>
                            )}
                            <div className="flex gap-2 mt-3">
                              <GlassButton
                                size="sm"
                                onClick={() => handleAcceptRequest(request.applicant_user_id)}
                                loading={processingId === request.applicant_user_id}
                              >
                                <CheckCircle size={16} />
                                接受
                              </GlassButton>
                              <GlassButton
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRejectRequest(request.applicant_user_id)}
                                disabled={processingId === request.applicant_user_id}
                              >
                                <XCircle size={16} />
                                拒绝
                              </GlassButton>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'sent' && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <GlassCard>
                {isLoading && sentRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
                    <p className="text-gray-500">加载中...</p>
                  </div>
                ) : sentRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Clock size={48} className="mb-4 opacity-50" />
                    <p>暂无已发送的请求</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100/50">
                    {sentRequests.map((request, index) => (
                      <motion.div
                        key={request.target_user_id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-4"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12 ring-2 ring-white shadow-md">
                            <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-white font-medium">
                              {request.target_user_id[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-gray-800">{request.target_user_id}</p>
                            {request.reason && (
                              <p className="text-sm text-gray-500">"{request.reason}"</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(request.request_time).toLocaleDateString('zh-CN')}
                            </p>
                          </div>
                        </div>
                        <GlassBadge
                          variant={
                            request.status === 'pending' ? 'warning' :
                            request.status === 'approved' ? 'success' : 'error'
                          }
                        >
                          {request.status === 'pending' ? '等待确认' :
                           request.status === 'approved' ? '已通过' : '已拒绝'}
                        </GlassBadge>
                      </motion.div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassPage>
  )
}
