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
  RefreshCw,
  Mail
} from 'lucide-react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { groupsApi, type GroupInvitation } from '@/features/chat/api/groups'
import { ConversationItem } from './ConversationItem'
import { useI18n } from '@/i18n/I18nProvider'

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
  const { t } = useI18n()
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
      console.error('Failed to load group invitations:', error)
    } finally {
      setLoadingInvites(false)
    }
  }

  // 创建群聊
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({
        title: t('chat.groupList.error'),
        description: t('chat.groupList.enterGroupName'),
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await createGroup(groupName.trim(), groupDescription.trim() || undefined, joinMode)
      toast({
        title: t('chat.groupList.success'),
        description: t('chat.groupList.createSuccess'),
      })
      setShowCreateDialog(false)
      setGroupName('')
      setGroupDescription('')
      setJoinMode('open')
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.createFailed'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }



  // 通过邀请码加入
  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) {
      toast({
        title: t('chat.groupList.error'),
        description: t('chat.groupList.enterInviteCode'),
        variant: 'destructive',
      })
      return
    }

    setJoiningByCode(true)
    try {
      await groupsApi.joinByCode(inviteCode.trim())
      toast({
        title: t('chat.groupList.success'),
        description: t('chat.groupList.joinSuccess'),
      })
      setInviteCode('')
      loadMyGroups()
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.joinFailed'),
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
        title: t('chat.groupList.error'),
        description: t('chat.groupList.enterGroupId'),
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
          title: t('chat.groupList.notFound'),
          description: t('chat.groupList.noMatchedGroup'),
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.searchFailed'),
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
        title: t('chat.groupList.success'),
        description: (searchResult.join_mode || 'approval_required') === 'open' ? t('chat.groupList.joinSuccess') : t('chat.groupList.applySubmitted'),
      })
      setSearchResult(null)
      setSearchGroupId('')
      setApplyReason('')
      if ((searchResult.join_mode || 'approval_required') === 'open') {
        loadMyGroups()
      }
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.applyFailed'),
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
      toast({ title: t('chat.groupList.success'), description: t('chat.groupList.joinedViaInvite') })
      setInvitations(prev => prev.filter(i => i.request_id !== invitationId))
      loadMyGroups()
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.acceptInviteFailed'),
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
      toast({ title: t('chat.groupList.rejected'), description: t('chat.groupList.inviteRejected') })
      setInvitations(prev => prev.filter(i => i.request_id !== invitationId))
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.declineInviteFailed'),
        variant: 'destructive',
      })
    } finally {
      setProcessingInvite(null)
    }
  }

  const getJoinModeText = (mode: string) => {
    const modes: Record<string, string> = {
      open: t('chat.groupList.joinMode.open'),
      approval_required: t('chat.groupList.joinMode.approval'),
      invite_only: t('chat.groupList.joinMode.inviteOnly'),
      admin_invite_only: t('chat.groupList.joinMode.adminInviteOnly'),
      closed: t('chat.groupList.joinMode.closed')
    }
    return modes[mode] || mode
  }

  // 主列表 - 我的群聊
  if (subTab === 'main') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {/* 创建群聊按钮 (List Header) */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 mb-2"
          >
            <Button
              className="flex-1 h-10 gap-2 font-medium shadow-sm transition-all active:scale-[0.98] rounded-xl border-dashed border-2 border-border/50 hover:border-primary/50 hover:bg-primary/5 bg-transparent text-muted-foreground hover:text-primary"
              variant="outline"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4" />
              {t('chat.groupList.createGroup')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl hover:bg-background shadow-sm border border-transparent hover:border-border transition-all"
              onClick={() => loadMyGroups()}
              disabled={isLoading}
              title={t('chat.groupList.refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </motion.div>

          {/* 群聊列表 */}
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <motion.div
              className="flex flex-col items-center justify-center h-48 text-center px-4"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4 bg-muted/50 ring-8 ring-muted/20">
                <Users className="h-8 w-8 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-foreground">{t('chat.groupList.noGroups')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">{searchQuery ? t('chat.groupList.tryOtherSearch') : '创建或加入一个群聊吧！'}</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredGroups.map((group) => {
                 const lastMsg = group.last_message_content || group.group_description || t('chat.groupList.memberCount', { count: group.member_count || 0 })
                 
                 return (
                  <div key={group.group_id} className="relative group">
                    <ConversationItem
                      id={group.group_id}
                      type="group"
                      name={group.group_name}
                      avatar={group.group_avatar_url}
                      lastMessage={lastMsg}
                      unreadCount={group.unread_count || 0}
                      isActive={selectedConversation?.id === group.group_id}
                      onClick={() => handleSelectGroup(group)}
                      time={group.last_message_time ? format(new Date(group.last_message_time), 'yyyy/MM/dd') : undefined}
                    />
                  </div>
                )
              })}
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
                  className="fixed inset-0 z-[9998] bg-foreground/45"
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
                  <h3 className="text-xl font-semibold mb-6 text-foreground">{t('chat.groupList.createGroup')}</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.groupList.groupNameRequired')}</label>
                      <Input
                        type="text"
                        placeholder={t('chat.groupList.enterGroupNamePlaceholder')}
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        maxLength={30}
                        className="h-10"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.groupList.groupDescOptional')}</label>
                      <Input
                        type="text"
                        placeholder={t('chat.groupList.groupDescPlaceholder')}
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        maxLength={200}
                        className="h-10"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.groupList.joinModeLabel')}</label>
                      <select
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                        value={joinMode}
                        onChange={(e) => setJoinMode(e.target.value as typeof joinMode)}
                      >
                        <option value="open">{t('chat.groupList.joinModeOpenDesc')}</option>
                        <option value="approval_required">{t('chat.groupList.joinModeApprovalDesc')}</option>
                        <option value="invite_only">{t('chat.groupList.joinModeInviteOnlyDesc')}</option>
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
                      {t('chat.groupList.cancel')}
                    </Button>
                    <Button
                      className="flex-1 h-10"
                      onClick={handleCreateGroup}
                      disabled={submitting || !groupName.trim()}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('chat.groupList.creating')}
                        </>
                      ) : (
                        t('chat.groupList.create')
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
            {t('chat.groupList.joinByInviteCode')}
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={t('chat.groupList.enterInviteCodePlaceholder')}
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
              {joiningByCode ? <Loader2 className="h-4 w-4 animate-spin" /> : t('chat.groupList.join')}
            </Button>
          </div>
        </div>

        {/* 搜索群聊 */}
        <div className="p-4 rounded-xl space-y-3 border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Search className="h-4 w-4" />
            {t('chat.groupList.searchGroup')}
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={t('chat.groupList.enterGroupIdPlaceholder')}
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
              {searchingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : t('chat.groupList.search')}
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
                <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={searchResult.group_avatar_url} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {searchResult.group_name[0]?.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{searchResult.group_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('chat.groupList.memberCount', { count: searchResult.member_count ?? 0 })} · {getJoinModeText(searchResult.join_mode || 'approval_required')}
                  </div>
                </div>
              </div>

              {(searchResult.join_mode || 'approval_required') !== 'open' && (
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">{t('chat.groupList.applyReason')}</label>
                  <Input
                    type="text"
                    placeholder={t('chat.groupList.applyReasonPlaceholder')}
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
                  {t('chat.groupList.cancel')}
                </Button>
                <Button
                  className="flex-1 h-10"
                  onClick={handleApplyJoin}
                  disabled={applying}
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (searchResult.join_mode || 'approval_required') === 'open' ? (
                    t('chat.groupList.join')
                  ) : (
                    t('chat.groupList.applyJoin')
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
          <span className="font-medium text-foreground">{t('chat.groupList.groupInvites')}</span>
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
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
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
            <p className="text-sm text-muted-foreground">{t('chat.groupList.noInvites')}</p>
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
                  <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={invitation.group_avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {invitation.group_name[0]?.toUpperCase()}
                      </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{invitation.group_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('chat.groupList.invitedBy', { name: invitation.inviter_nickname })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(invitation.created_at), 'yyyy/MM/dd')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="icon-sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
