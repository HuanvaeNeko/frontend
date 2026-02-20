'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Users,
  Plus,
  Loader2,
  Search,
  Link,
  Check,
  X,
  Crown,
  RefreshCw,
  Mail
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGroupStore } from '../../store/groupStore'
import { useChatStore } from '../../store/chatStore'
import { groupsApi, type GroupInvitation } from '../../api/groups'
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
        <div className="p-3 flex gap-2">
          <Button
            className="flex-1 h-12 gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            创建群聊
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 rounded-xl"
            onClick={() => loadMyGroups()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* 群聊列表 */}
        <div className="flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center h-32"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-muted">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">暂无群聊</p>
              {searchQuery && <p className="text-xs text-muted-foreground mt-1">试试其他搜索条件</p>}
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredGroups.map((group, index) => (
                <motion.button
                  key={group.group_id}
                  className={`flex items-center gap-3 p-3 min-h-[52px] rounded-xl cursor-pointer transition-colors hover:bg-accent active:bg-accent/80 w-full ${selectedConversation?.id === group.group_id ? 'bg-accent' : ''}`}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  custom={index}
                  layout
                  onClick={() => handleSelectGroup(group)}
                >
                  <div className="conv-avatar">
                    <Avatar className="h-full w-full">
                      <AvatarImage src={group.group_avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {group.group_name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="conv-info">
                    <div className="conv-header">
                      <span className="conv-name">
                        {group.role === 'owner' && <Crown className="h-3 w-3 text-yellow-500 mr-1 inline" />}
                        {group.group_name}
                      </span>
                      {group.last_message_time && (
                        <span className="conv-time">
                          {new Date(group.last_message_time).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="conv-footer">
                      <span className="conv-preview">
                        {group.last_message_content || group.group_description || `${group.member_count || 0} 名成员`}
                      </span>
                      {(group.unread_count ?? 0) > 0 && (
                        <span className="conv-unread visible">
                          {group.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* 创建群聊对话框 - 使用 Portal 渲染到 body */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {showCreateDialog && (
              <>
                {/* 遮罩层 */}
                <motion.div
                  className="fixed inset-0 z-[9998] bg-black/45 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowCreateDialog(false)}
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
                  <h3 className="text-xl font-semibold mb-6 text-foreground">创建群聊</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">群名称 *</label>
                      <Input
                        type="text"
                        placeholder="输入群名称"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        maxLength={30}
                        className="h-10"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">群描述（可选）</label>
                      <Input
                        type="text"
                        placeholder="简单介绍一下这个群..."
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        maxLength={200}
                        className="h-10"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">加群方式</label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                        value={joinMode}
                        onChange={(e) => setJoinMode(e.target.value as typeof joinMode)}
                      >
                        <option value="open">开放加入 - 任何人可直接加入</option>
                        <option value="approval_required">需要审批 - 需管理员同意</option>
                        <option value="invite_only">仅邀请 - 只能通过邀请加入</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <Button
                      variant="outline"
                      className="flex-1 h-10"
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
                      className="flex-1 h-10"
                      onClick={handleCreateGroup}
                      disabled={submitting || !groupName.trim()}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          创建中...
                        </>
                      ) : (
                        '创建'
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

  // 加入群聊
  if (subTab === 'join') {
    return (
      <div className="flex flex-col h-full p-4 space-y-6">
        {/* 通过邀请码加入 */}
        <div className="p-4 rounded-xl space-y-3 border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Link className="h-4 w-4" />
            通过邀请码加入
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="输入邀请码"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="flex-1 h-10 font-mono"
              maxLength={10}
            />
            <Button
              className="h-10 px-5"
              onClick={handleJoinByCode}
              disabled={joiningByCode || !inviteCode.trim()}
            >
              {joiningByCode ? <Loader2 className="h-4 w-4 animate-spin" /> : '加入'}
            </Button>
          </div>
        </div>

        {/* 搜索群聊 */}
        <div className="p-4 rounded-xl space-y-3 border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Search className="h-4 w-4" />
            搜索群聊
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="输入群ID"
              value={searchGroupId}
              onChange={(e) => setSearchGroupId(e.target.value)}
              className="flex-1 h-10"
            />
            <Button
              variant="outline"
              className="h-10 px-5"
              onClick={handleSearchGroup}
              disabled={searchingGroup || !searchGroupId.trim()}
            >
              {searchingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
            </Button>
          </div>

          {/* 搜索结果 */}
          {searchResult && (
            <motion.div
              className="p-4 rounded-xl space-y-3 border bg-accent/30"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-3">
                <div className="conv-avatar">
                  <Avatar className="h-full w-full">
                    <AvatarImage src={searchResult.group_avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {searchResult.group_name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{searchResult.group_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {searchResult.member_count ?? 0} 成员 · {getJoinModeText(searchResult.join_mode || 'approval_required')}
                  </div>
                </div>
              </div>

              {(searchResult.join_mode || 'approval_required') !== 'open' && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">申请理由</label>
                  <Input
                    type="text"
                    placeholder="说明加群原因（可选）"
                    value={applyReason}
                    onChange={(e) => setApplyReason(e.target.value)}
                    className="h-10"
                    maxLength={100}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10"
                  onClick={() => {
                    setSearchResult(null)
                    setSearchGroupId('')
                    setApplyReason('')
                  }}
                >
                  取消
                </Button>
                <Button
                  className="flex-1 h-10"
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
            </motion.div>
          )}
        </div>
      </div>
    )
  }

  // 群邀请
  if (subTab === 'invites') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <span className="font-medium text-foreground">群邀请</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={loadInvitations}
            disabled={loadingInvites}
          >
            <RefreshCw className={`h-4 w-4 ${loadingInvites ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {loadingInvites ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
          </div>
        ) : invitations.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-32"
            variants={emptyStateVariants}
            initial="hidden"
            animate="visible"
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3 bg-muted">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无群邀请</p>
          </motion.div>
        ) : (
          <div className="px-2 py-2">
            <AnimatePresence mode="popLayout">
              {invitations.map((invitation, index) => (
                <motion.div
                  key={invitation.request_id}
                  className="p-4 mb-2 rounded-xl flex items-center gap-3 border bg-card"
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  custom={index}
                >
                  <div className="conv-avatar">
                    <Avatar className="h-full w-full">
                      <AvatarImage src={invitation.group_avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {invitation.group_name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{invitation.group_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {invitation.inviter_nickname} 邀请你加入
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(invitation.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon-sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
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
                      size="icon-sm"
                      onClick={() => handleDeclineInvite(invitation.request_id)}
                      disabled={processingInvite === invitation.request_id}
                      className="hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    )
  }

  return null
}
