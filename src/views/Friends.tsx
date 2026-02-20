'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Users,
  UserPlus,
  UserMinus,
  Loader2,
  Search,
  MessageCircle,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFriendsStore } from '../store/friendsStore'
import { useToast } from '@/hooks/use-toast'
import { ROUTES } from '@/lib/routes'

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
        variant: 'destructive',
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
        variant: 'destructive',
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
        variant: 'destructive',
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
        variant: 'destructive',
      })
    } finally {
      setProcessingId(null)
    }
  }

  const filteredFriends = friends.filter((friend) =>
    friend.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    friend.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-8 md:p-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => router.push(ROUTES.app.chat)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">好友管理</h1>
              <p className="text-sm text-muted-foreground">管理联系人与请求</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5"><Users className="h-3.5 w-3.5" />{friends.length} 位好友</Badge>
        </motion.div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">添加好友</CardTitle>
            <CardDescription>输入用户 ID 发送好友请求</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 max-sm:flex-col">
            <Input
              placeholder="例如: user_1234"
              value={newFriendId}
              onChange={(e) => setNewFriendId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
              disabled={isLoading}
            />
            <Button onClick={handleAddFriend} disabled={isLoading} className="gap-2">
              <UserPlus className="h-4 w-4" />发送请求
            </Button>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'friends' | 'requests' | 'sent')}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends" className="gap-1.5">好友 ({friends.length})</TabsTrigger>
            <TabsTrigger value="requests" className="gap-1.5">请求 ({pendingRequests.length})</TabsTrigger>
            <TabsTrigger value="sent" className="gap-1.5">已发送 ({sentRequests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="space-y-3">
            <Card>
              <CardContent className="pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="搜索昵称或用户 ID"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-3">
                {isLoading && friends.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中...</div>
                ) : filteredFriends.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <span>{searchTerm ? '未找到匹配好友' : '暂无好友'}</span>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredFriends.map((friend) => (
                      <div key={friend.user_id} className="flex items-center justify-between gap-3 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={friend.avatar_url} />
                            <AvatarFallback>{friend.nickname[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{friend.nickname}</div>
                            <div className="truncate text-xs text-muted-foreground">{friend.user_id}</div>
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemoveFriend(friend.user_id, friend.nickname)}
                          disabled={processingId === friend.user_id}
                          className="gap-1.5"
                        >
                          {processingId === friend.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                          删除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <Card>
              <CardContent className="pt-3">
                {isLoading && pendingRequests.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中...</div>
                ) : pendingRequests.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <MessageCircle className="h-8 w-8" />
                    <span>暂无好友请求</span>
                  </div>
                ) : (
                  <div className="divide-y">
                    {pendingRequests.map((request) => (
                      <div key={request.applicant_user_id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0 space-y-1">
                          <div className="font-medium">{request.nickname}</div>
                          <div className="text-xs text-muted-foreground">{request.applicant_user_id}</div>
                          {request.reason && <div className="text-xs text-muted-foreground">“{request.reason}”</div>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleAcceptRequest(request.applicant_user_id)} disabled={processingId === request.applicant_user_id} className="gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" />接受
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleRejectRequest(request.applicant_user_id)} disabled={processingId === request.applicant_user_id} className="gap-1.5">
                            <XCircle className="h-3.5 w-3.5" />拒绝
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sent">
            <Card>
              <CardContent className="pt-3">
                {isLoading && sentRequests.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载中...</div>
                ) : sentRequests.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Clock className="h-8 w-8" />
                    <span>暂无已发送请求</span>
                  </div>
                ) : (
                  <div className="divide-y">
                    {sentRequests.map((request) => (
                      <div key={request.target_user_id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 space-y-1">
                          <div className="font-medium">{request.target_user_id}</div>
                          {request.reason && <div className="text-xs text-muted-foreground">“{request.reason}”</div>}
                          <div className="text-xs text-muted-foreground">{new Date(request.request_time).toLocaleDateString('zh-CN')}</div>
                        </div>
                        <Badge variant={request.status === 'approved' ? 'default' : request.status === 'rejected' ? 'destructive' : 'secondary'}>
                          {request.status === 'pending' ? '等待确认' : request.status === 'approved' ? '已通过' : '已拒绝'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
