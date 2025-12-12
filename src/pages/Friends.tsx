import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Users, UserPlus, UserMinus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import * as Tabs from '@radix-ui/react-tabs'
import { useFriendsStore } from '../store/friendsStore'
import { 
  fadeInVariants, 
  slideUpVariants, 
  scaleInVariants,
  staggerContainer,
  staggerItem,
} from '../utils/motionAnimations'

export default function Friends() {
  const navigate = useNavigate()
  const { 
    friends, 
    pendingRequests, 
    isLoading,
    error,
    loadFriends, 
    loadPendingRequests,
    sendFriendRequest, 
    approveFriendRequest, 
    rejectFriendRequest, 
    removeFriend,
    clearError,
  } = useFriendsStore()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [newFriendId, setNewFriendId] = useState('')

  // 初始化加载好友和请求列表
  useEffect(() => {
    loadFriends().catch(console.error)
    loadPendingRequests().catch(console.error)
  }, [loadFriends, loadPendingRequests])

  // 显示错误提示
  useEffect(() => {
    if (error) {
      alert(error)
      clearError()
    }
  }, [error, clearError])

  const handleAddFriend = async () => {
    if (!newFriendId.trim()) {
      alert('请输入用户ID')
      return
    }
    try {
      await sendFriendRequest(newFriendId.trim())
      alert('好友请求已发送')
      setNewFriendId('')
    } catch {
      // 错误已在 store 中处理
    }
  }

  const handleAcceptRequest = async (applicantUserId: string) => {
    try {
      await approveFriendRequest(applicantUserId)
      alert('已添加为好友')
    } catch {
      // 错误已在 store 中处理
    }
  }

  const handleRejectRequest = async (applicantUserId: string) => {
    try {
      await rejectFriendRequest(applicantUserId)
      alert('已拒绝请求')
    } catch {
      // 错误已在 store 中处理
    }
  }

  const handleRemoveFriend = async (friendUserId: string) => {
    if (!confirm('确定要删除该好友吗？')) return
    try {
      await removeFriend(friendUserId)
      alert('已删除好友')
    } catch {
      // 错误已在 store 中处理
    }
  }

  const filteredFriends = friends.filter(friend =>
    friend.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    friend.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/')} className="gap-2">
            <ArrowLeft size={18} />返回首页
          </Button>
        </div>

        <motion.div
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 flex items-center gap-4"
        >
          <Users size={32} className="text-green-500" />
          <div>
            <h1 className="text-4xl font-bold">好友管理</h1>
            <p className="text-muted-foreground">管理您的好友关系</p>
          </div>
        </motion.div>

        <motion.div
          variants={slideUpVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="输入用户ID添加好友"
                value={newFriendId}
                onChange={(e) => setNewFriendId(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddFriend()}
                className="flex-1"
                disabled={isLoading}
              />
              <Button 
                onClick={handleAddFriend} 
                className="gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <UserPlus size={18} />
                )}
                发送请求
              </Button>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        <motion.div
          variants={scaleInVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
        <Tabs.Root defaultValue="friends" className="w-full">
          <Tabs.List className="flex border-b">
            <Tabs.Trigger
              value="friends"
              className="flex-1 px-4 py-2 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary"
            >
              我的好友 ({friends.length})
            </Tabs.Trigger>
            <Tabs.Trigger
              value="requests"
              className="flex-1 px-4 py-2 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary"
            >
              好友请求 ({pendingRequests.length})
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="friends" className="mt-4">
            <Input
              placeholder="搜索好友"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4"
            />
            <Card>
              <CardContent className="pt-6">
                {isLoading && friends.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={32} className="animate-spin text-muted-foreground" />
                  </div>
                ) : filteredFriends.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">暂无好友</p>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="space-y-4"
                  >
                    <AnimatePresence>
                      {filteredFriends.map((friend) => (
                        <motion.div
                          key={friend.user_id}
                          variants={staggerItem}
                          layout
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-gradient-to-br from-green-400 to-blue-500 text-white">
                                {friend.nickname[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{friend.nickname}</p>
                              <p className="text-sm text-muted-foreground">ID: {friend.user_id}</p>
                            </div>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleRemoveFriend(friend.user_id)}
                            disabled={isLoading}
                          >
                            <UserMinus size={16} />删除
                          </Button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="requests" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {isLoading && pendingRequests.length === 0 ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={32} className="animate-spin text-muted-foreground" />
                  </div>
                ) : pendingRequests.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">暂无好友请求</p>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    className="space-y-4"
                  >
                    <AnimatePresence>
                      {pendingRequests.map((request) => (
                        <motion.div
                          key={request.applicant_user_id}
                          variants={staggerItem}
                          layout
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-500 text-white">
                                {request.nickname[0]}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{request.nickname}</p>
                              <p className="text-sm text-muted-foreground">ID: {request.applicant_user_id}</p>
                              {request.reason && (
                                <p className="text-sm text-muted-foreground">留言: {request.reason}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => handleAcceptRequest(request.applicant_user_id)}
                              disabled={isLoading}
                            >
                              接受
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleRejectRequest(request.applicant_user_id)}
                              disabled={isLoading}
                            >
                              拒绝
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </Tabs.Content>
        </Tabs.Root>
        </motion.div>
      </div>
    </div>
  )
}
