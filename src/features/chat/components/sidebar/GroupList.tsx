'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Users,
  Plus,
  Loader2,
  Search,
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
import { groupsApi, type GroupInvitation, type JoinSource } from '@/features/chat/api/groups'
import { ApiError } from '@/lib/apiEnvelope'
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
    selectionError,
    clearSelectionError,
    createGroup,
    loadMyGroups,
    selectGroup,
  } = useGroupStore()

  const { setSelectedConversation, selectedConversation } = useChatStore()

  // groupStore 的 selectionError 此前是零消费方：selectGroup 里加载成员/公告
  // 失败时只 console.error，用户什么都看不到。这里给它接一个可见的消费方——
  // 选中一个群之后，"成员和公告悄悄加载失败"不该和"选群成功"长得一样。
  // 用专门的 selectionError 而不是共享的 `error`：createGroup/updateGroup/
  // searchGroups 各自在调用点已经 try/catch 弹过 toast，共享同一个字段会让
  // 同一次失败弹两次。
  useEffect(() => {
    if (!selectionError) return
    toast({ title: t('chat.groupList.failed'), description: selectionError, variant: 'destructive' })
    clearSelectionError()
  }, [selectionError, clearSelectionError, t, toast])

  // 创建群聊状态
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  // 建群时是否需要入群审核。批 3 之前这里是五档 `joinMode`，那套模型连同
  // `groups."join-mode"` 列一起被 migration 043 删掉了（doc:64-75）。
  // 初值取后端默认值 true（不传该字段时后端就按需审核建群，doc:60）。
  const [joinApprovalRequired, setJoinApprovalRequired] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 加入群聊状态
  const [searchGroupId, setSearchGroupId] = useState('')
  const [searchingGroup, setSearchingGroup] = useState(false)
  // `join_mode` 已从这里删掉：后端两个响应结构里都没有这个字段了（doc:460-461），
  // 读到的恒为 undefined，旧代码的三处 `|| 'approval_required'` 把这件事
  // 完整地藏了起来。批 4 起「申请提交后是直接进群还是落待审」由
  // `applyToJoin` 返回的 `data.status` 直答（doc:1128-1132），前端不再猜。
  const [searchResult, setSearchResult] = useState<{
    group_id: string
    group_name: string
    group_avatar_url?: string | null
    member_count?: number
  } | null>(null)
  const [applyReason, setApplyReason] = useState('')
  const [applying, setApplying] = useState(false)

  // 群邀请状态
  const [invitations, setInvitations] = useState<GroupInvitation[]>([])
  const [loadingInvites, setLoadingInvites] = useState(false)
  // 三态之三：失败。与"确实没有邀请"分开渲染——否则一次请求失败和真实空列表
  // 在屏幕上长得一模一样，这正是 apiEnvelope.ts 开篇讲的那类 bug。
  const [invitesError, setInvitesError] = useState<string | null>(null)
  const [processingInvite, setProcessingInvite] = useState<string | null>(null)
  // 已同意、但复核后发现人还没进群（群开着入群审核 ⇒ 落在待审队列里，
  // doc:1194-1203）的邀请。这些行留在列表里并改标成「等待管理员审核」——
  // 删掉它们就等于把用户唯一的状态入口一起删掉。
  const [pendingApprovalIds, setPendingApprovalIds] = useState<string[]>([])

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
      avatar: group.group_avatar_url ?? undefined,
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
    setInvitesError(null)
    try {
      // getInvitations() 现在要么返回真实数组，要么抛错——不再需要
      // Array.isArray 兜底把"解析错了"悄悄变成一个空数组。
      const data = await groupsApi.getInvitations()
      setInvitations(data)
    } catch (error) {
      console.error('Failed to load group invitations:', error)
      setInvitesError(error instanceof Error ? error.message : t('chat.groupList.loadInvitesFailed'))
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
      await createGroup(groupName.trim(), groupDescription.trim() || undefined, joinApprovalRequired)
      toast({
        title: t('chat.groupList.success'),
        description: t('chat.groupList.createSuccess'),
      })
      setShowCreateDialog(false)
      setGroupName('')
      setGroupDescription('')
      setJoinApprovalRequired(true)
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

  /**
   * `POST /{group_id}/apply` 的 403 只有通用文案「权限不足」（doc:1093-1099
   * 明写后端**没有**为"这条加群方式被关了"单独定义文案），所以判据只能是
   * 「状态码 403 + 是哪个端点 + 本次传的 `source`」——不要 match 消息体字符串。
   */
  const describeApplyError = (error: unknown, source: JoinSource): string => {
    if (error instanceof ApiError && error.status === 403) {
      if (source === 'qr') return t('chat.groupList.joinClosedQr')
      if (source === 'search') return t('chat.groupList.joinClosedSearch')
      return t('chat.groupList.joinClosedReferral')
    }
    return error instanceof Error ? error.message : t('chat.groupList.applyFailed')
  }

  /**
   * 申请加入群聊。
   *
   * `source` 是必填的，且**服务端有意不给默认值**（doc:1049-1062）：三个
   * `allow_join_via_*` 开关的全部意义就是按来源分流。本入口是「输入群 ID
   * 搜到群之后申请」，所以传 `'search'`；扫码落地页传 `'qr'`、群卡片/链接
   * 落地传 `'referral'`（那两个入口本仓还没有）。
   *
   * 结果按 `data.status` 分支（doc:1128-1132，唯一判据，不要解析文案）：
   * `joined` 说明这个群 `join_approval_required=false`，用户**已经在群里了**，
   * 必须刷新群列表，否则新群不出现，用户以为还在等审批。
   */
  const handleApplyJoin = async () => {
    if (!searchResult) return

    const source: JoinSource = 'search'
    setApplying(true)
    try {
      const result = await groupsApi.applyToJoin(
        searchResult.group_id,
        source,
        applyReason.trim() || undefined,
      )
      toast({
        title: t('chat.groupList.success'),
        description:
          result.status === 'joined'
            ? t('chat.groupList.joinSuccess')
            : t('chat.groupList.applySubmitted'),
      })
      if (result.status === 'joined') {
        await loadMyGroups()
      }
      setSearchResult(null)
      setSearchGroupId('')
      setApplyReason('')
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: describeApplyError(error, source),
        variant: 'destructive',
      })
    } finally {
      setApplying(false)
    }
  }

  /**
   * 接受群邀请。
   *
   * 🔴 accept 成功**不等于**入群：开着入群审核的群里，同意邀请只是把
   * `user_accepted` 置真，人还在待审队列里（doc:1194-1203）。两种结局
   * HTTP、信封 `success`、内层 `data.success` 全都相同，唯一区别在
   * `data.message`——而文档明写不要解析文案，要重新拉 `GET /api/groups/my`
   * 确认。旧代码无条件弹「已加入群聊」并把这条邀请从列表里删掉，用户被告知
   * 进群了、邀请消失了、群列表里却没有这个群，且再没有任何入口能看到
   * 「我已同意、正在等审批」。
   *
   * 复核失败（`loadMyGroups` 自己抛）单独一档：那时我们**不知道**结局，
   * 不能挑一个说给用户听——挑「已加入」是骗人，挑「接受邀请失败」也是骗人
   * （accept 已经成功了）。
   */
  const handleAcceptInvite = async (invitation: GroupInvitation) => {
    setProcessingInvite(invitation.request_id)
    try {
      await groupsApi.acceptInvitation(invitation.request_id)
      let joined: boolean
      try {
        await loadMyGroups()
        joined = useGroupStore
          .getState()
          .myGroups.some(group => group.group_id === invitation.group_id)
      } catch (verifyError) {
        // 错误对象不丢：用户侧只能得到"无法确认"，但排查者要看得到原因。
        console.error('接受邀请后复核群列表失败:', verifyError)
        toast({
          title: t('chat.groupList.success'),
          description: t('chat.groupList.inviteAcceptedUnconfirmed'),
        })
        return
      }

      if (joined) {
        toast({ title: t('chat.groupList.success'), description: t('chat.groupList.joinedViaInvite') })
        setInvitations(prev => prev.filter(i => i.request_id !== invitation.request_id))
        return
      }

      // 没进群 ⇒ 落在审批队列里。这一行**不能删**：它是用户唯一能看到
      // 「我已同意、正在等审批」的地方。
      toast({
        title: t('chat.groupList.success'),
        description: t('chat.groupList.inviteAcceptedPendingApproval'),
      })
      setPendingApprovalIds(prev =>
        prev.includes(invitation.request_id) ? prev : [...prev, invitation.request_id],
      )
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
                      avatar={group.group_avatar_url ?? undefined}
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
                      <label htmlFor="create-group-join-approval" className="text-sm font-medium text-foreground mb-1.5 block">
                        {t('chat.groupList.joinApprovalLabel')}
                      </label>
                      <select
                        id="create-group-join-approval"
                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                        value={joinApprovalRequired ? 'required' : 'open'}
                        onChange={(e) => setJoinApprovalRequired(e.target.value === 'required')}
                      >
                        <option value="required">{t('chat.groupList.joinApprovalRequiredDesc')}</option>
                        <option value="open">{t('chat.groupList.joinApprovalOpenDesc')}</option>
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
                        setJoinApprovalRequired(true)
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
                    <AvatarImage src={searchResult.group_avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {searchResult.group_name[0]?.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{searchResult.group_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('chat.groupList.memberCount', { count: searchResult.member_count ?? 0 })}
                  </div>
                </div>
              </div>

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
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : t('chat.groupList.applyJoin')}
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
        ) : invitesError ? (
          // 失败态必须和"确实没有邀请"分开渲染，否则两者在屏幕上无法区分
          // （apiEnvelope.ts 开篇讲的那类 bug）。
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
            <p className="text-sm text-destructive">{invitesError}</p>
            <Button variant="outline" size="sm" onClick={loadInvitations}>
              {t('chat.groupList.retry')}
            </Button>
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
                      <AvatarImage src={invitation.group_avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {invitation.group_name[0]?.toUpperCase()}
                      </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{invitation.group_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {/* inviter_nickname 可为 null（users JOIN 缺失，doc:1182），
                          展示层退到 inviter_id，不是 api 解包层的兜底 */}
                      {t('chat.groupList.invitedBy', { name: invitation.inviter_nickname ?? invitation.inviter_id })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(invitation.created_at), 'yyyy/MM/dd')}
                    </div>
                  </div>
                  {pendingApprovalIds.includes(invitation.request_id) ? (
                    // 已同意但还没进群：这一行保留，按钮换成状态说明——再点一次
                    // 同意没有意义（后端那条记录已经是 user_accepted=true）。
                    <div className="text-xs text-muted-foreground shrink-0 max-w-[8rem] text-right">
                      {t('chat.groupList.inviteAcceptedPendingApproval')}
                    </div>
                  ) : (
                  <div className="flex gap-2">
                    <Button
                      size="icon-sm"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      onClick={() => handleAcceptInvite(invitation)}
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
                  )}
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
