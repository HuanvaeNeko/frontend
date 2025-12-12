import { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Loader2,
  Search,
  Link,
  Check,
  X,
  Crown,
  ChevronRight,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGroupStore } from '../../store/groupStore'
import { useChatStore } from '../../store/chatStore'
import { groupsApi, type GroupInvitation } from '../../api/groups'
import { useToast } from '@/hooks/use-toast'

interface GroupListProps {
  subTab: 'main' | 'invites' | 'join'
  searchQuery: string
}

export default function GroupList({ subTab, searchQuery }: GroupListProps) {
  const { toast } = useToast()
  const {
    myGroups,
    isLoading,
    createGroup,
    loadMyGroups,
    selectGroup,
  } = useGroupStore()

  const { setSelectedConversation, selectedConversation } = useChatStore()

  // 创建群聊状态
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [joinMode, setJoinMode] = useState<'open' | 'approval_required' | 'invite_only'>('open')
  const [submitting, setSubmitting] = useState(false)

  // 加入群聊状态
  const [inviteCode, setInviteCode] = useState('')
  const [joiningByCode, setJoiningByCode] = useState(false)
  const [searchGroupId, setSearchGroupId] = useState('')
  const [searchingGroup, setSearchingGroup] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    group_id: string
    group_name: string
    group_avatar_url?: string
    member_count?: number
    join_mode?: string
  } | null>(null)
  const [applyReason, setApplyReason] = useState('')
  const [applying, setApplying] = useState(false)

  // 群邀请状态
  const [invitations, setInvitations] = useState<GroupInvitation[]>([])
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [processingInvite, setProcessingInvite] = useState<string | null>(null)

  // 确保 myGroups 是数组
  const groupsArray = Array.isArray(myGroups) ? myGroups : []

  // 筛选群聊
  const filteredGroups = groupsArray.filter((group) =>
    group.group_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.group_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 加载群邀请
  useEffect(() => {
    if (subTab === 'invites') {
      loadInvitations()
    }
  }, [subTab])

  const loadInvitations = async () => {
    setLoadingInvites(true)
    try {
      const data = await groupsApi.getInvitations()
      setInvitations(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('加载群邀请失败:', error)
    } finally {
      setLoadingInvites(false)
    }
  }

  // 创建群聊
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({
        title: '错误',
        description: '请输入群名称',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await createGroup(groupName.trim(), groupDescription.trim() || undefined, joinMode)
      toast({
        title: '成功',
        description: '群聊创建成功',
      })
      setShowCreateDialog(false)
      setGroupName('')
      setGroupDescription('')
      setJoinMode('open')
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '创建群聊失败',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // 选择群聊
  const handleSelectGroup = (group: typeof myGroups[0]) => {
    selectGroup(group)
    setSelectedConversation({
      id: group.group_id,
      type: 'group',
      name: group.group_name,
      avatar: group.group_avatar_url,
      unreadCount: group.unread_count || 0,
      lastMessage: group.last_message_content || undefined,
      lastTime: group.last_message_time || undefined,
    })
  }

  // 通过邀请码加入
  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) {
      toast({
        title: '错误',
        description: '请输入邀请码',
        variant: 'destructive',
      })
      return
    }

    setJoiningByCode(true)
    try {
      await groupsApi.joinByCode(inviteCode.trim())
      toast({
        title: '成功',
        description: '加入群聊成功',
      })
      setInviteCode('')
      loadMyGroups()
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '加入群聊失败',
        variant: 'destructive',
      })
    } finally {
      setJoiningByCode(false)
    }
  }

  // 搜索群聊
  const handleSearchGroup = async () => {
    if (!searchGroupId.trim()) {
      toast({
        title: '错误',
        description: '请输入群ID',
        variant: 'destructive',
      })
      return
    }

    setSearchingGroup(true)
    setSearchResult(null)
    try {
      const results = await groupsApi.searchGroups(searchGroupId.trim())
      if (results.length > 0) {
        setSearchResult(results[0])
      } else {
        toast({
          title: '未找到',
          description: '没有找到匹配的群聊',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '搜索群聊失败',
        variant: 'destructive',
      })
    } finally {
      setSearchingGroup(false)
    }
  }

  // 申请加入群聊
  const handleApplyJoin = async () => {
    if (!searchResult) return

    setApplying(true)
    try {
      await groupsApi.applyToJoin(searchResult.group_id, applyReason)
      toast({
        title: '成功',
        description: (searchResult.join_mode || 'approval_required') === 'open' ? '加入成功' : '申请已提交，等待审核',
      })
      setSearchResult(null)
      setSearchGroupId('')
      setApplyReason('')
      if ((searchResult.join_mode || 'approval_required') === 'open') {
        loadMyGroups()
      }
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '申请失败',
        variant: 'destructive',
      })
    } finally {
      setApplying(false)
    }
  }

  // 接受群邀请
  const handleAcceptInvite = async (invitationId: string) => {
    setProcessingInvite(invitationId)
    try {
      await groupsApi.acceptInvitation(invitationId)
      toast({ title: '成功', description: '已加入群聊' })
      setInvitations(prev => prev.filter(i => i.request_id !== invitationId))
      loadMyGroups()
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '接受邀请失败',
        variant: 'destructive',
      })
    } finally {
      setProcessingInvite(null)
    }
  }

  // 拒绝群邀请
  const handleDeclineInvite = async (invitationId: string) => {
    setProcessingInvite(invitationId)
    try {
      await groupsApi.declineInvitation(invitationId)
      toast({ title: '已拒绝', description: '已拒绝群邀请' })
      setInvitations(prev => prev.filter(i => i.request_id !== invitationId))
    } catch (error) {
      toast({
        title: '失败',
        description: error instanceof Error ? error.message : '拒绝邀请失败',
        variant: 'destructive',
      })
    } finally {
      setProcessingInvite(null)
    }
  }

  const getJoinModeText = (mode: string) => {
    const modes: Record<string, string> = {
      open: '开放加入',
      approval_required: '需要审核',
      invite_only: '仅邀请',
      admin_invite_only: '仅管理员邀请',
      closed: '禁止加入'
    }
    return modes[mode] || mode
  }

  // 主列表 - 我的群聊
  if (subTab === 'main') {
    return (
      <div className="flex flex-col h-full">
        {/* 创建群聊按钮 */}
        <div className="p-4 border-b flex gap-2">
          <Button
            className="flex-1 gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            创建群聊
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => loadMyGroups()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* 群聊列表 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">暂无群聊</p>
              {searchQuery && <p className="text-xs mt-1">试试其他搜索条件</p>}
            </div>
          ) : (
            filteredGroups.map((group) => (
              <button
                key={group.group_id}
                className={`w-full p-4 flex items-center gap-3 hover:bg-accent transition-colors ${
                  selectedConversation?.id === group.group_id ? 'bg-accent' : ''
                }`}
                onClick={() => handleSelectGroup(group)}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={group.group_avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {group.group_name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{group.group_name}</span>
                    {group.role === 'owner' && <Crown className="h-3 w-3 text-yellow-500" />}
                    {(group.unread_count ?? 0) > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                        {group.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {group.last_message_content || group.group_description || `${group.member_count || 0} 名成员`}
                  </div>
                  {group.last_message_time && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(group.last_message_time).toLocaleString()}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>

        {/* 创建群聊对话框 */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-96 max-w-[90vw] shadow-xl">
              <h3 className="text-lg font-semibold mb-4">创建群聊</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="groupName">群名称 *</Label>
                  <Input
                    id="groupName"
                    placeholder="输入群名称"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    maxLength={30}
                  />
                </div>

                <div>
                  <Label htmlFor="groupDescription">群描述（可选）</Label>
                  <Input
                    id="groupDescription"
                    placeholder="简单介绍一下这个群..."
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    maxLength={200}
                  />
                </div>

                <div>
                  <Label htmlFor="joinMode">加群方式</Label>
                  <select
                    id="joinMode"
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    value={joinMode}
                    onChange={(e) => setJoinMode(e.target.value as typeof joinMode)}
                  >
                    <option value="open">开放加入 - 任何人可直接加入</option>
                    <option value="approval_required">需要审批 - 需管理员同意</option>
                    <option value="invite_only">仅邀请 - 只能通过邀请加入</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowCreateDialog(false)
                    setGroupName('')
                    setGroupDescription('')
                    setJoinMode('open')
                  }}
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreateGroup}
                  disabled={submitting || !groupName.trim()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    '创建'
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 加入群聊
  if (subTab === 'join') {
    return (
      <div className="flex flex-col h-full p-4 space-y-6">
        {/* 通过邀请码加入 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Link className="h-4 w-4" />
            通过邀请码加入
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="输入邀请码"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="font-mono"
              maxLength={10}
            />
            <Button onClick={handleJoinByCode} disabled={joiningByCode || !inviteCode.trim()}>
              {joiningByCode ? <Loader2 className="h-4 w-4 animate-spin" /> : '加入'}
            </Button>
          </div>
        </div>

        <div className="border-t" />

        {/* 搜索群聊 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            搜索群聊
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="输入群ID"
              value={searchGroupId}
              onChange={(e) => setSearchGroupId(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={handleSearchGroup}
              disabled={searchingGroup || !searchGroupId.trim()}
            >
              {searchingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
            </Button>
          </div>

          {/* 搜索结果 */}
          {searchResult && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={searchResult.group_avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                    {searchResult.group_name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium">{searchResult.group_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {searchResult.member_count ?? 0} 成员 · {getJoinModeText(searchResult.join_mode || 'approval_required')}
                  </div>
                </div>
              </div>

              {(searchResult.join_mode || 'approval_required') !== 'open' && (
                <div>
                  <Label>申请理由</Label>
                  <Input
                    placeholder="说明加群原因（可选）"
                    value={applyReason}
                    onChange={(e) => setApplyReason(e.target.value)}
                    className="mt-1"
                    maxLength={100}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSearchResult(null)
                    setSearchGroupId('')
                    setApplyReason('')
                  }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleApplyJoin}
                  disabled={applying}
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (searchResult.join_mode || 'approval_required') === 'open' ? (
                    '加入'
                  ) : (
                    '申请加入'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 群邀请
  if (subTab === 'invites') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-medium">群邀请</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadInvitations}
            disabled={loadingInvites}
          >
            <RefreshCw className={`h-4 w-4 ${loadingInvites ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loadingInvites ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : invitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Users className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">暂无群邀请</p>
          </div>
        ) : (
          invitations.map((invitation) => (
            <div
              key={invitation.request_id}
              className="p-4 border-b flex items-center gap-3"
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={invitation.group_avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                  {invitation.group_name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{invitation.group_name}</div>
                <div className="text-sm text-muted-foreground">
                  {invitation.inviter_nickname} 邀请你加入
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(invitation.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleAcceptInvite(invitation.request_id)}
                  disabled={processingInvite === invitation.request_id}
                >
                  {processingInvite === invitation.request_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeclineInvite(invitation.request_id)}
                  disabled={processingInvite === invitation.request_id}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  return null
}
