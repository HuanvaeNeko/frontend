'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import {
  Users,
  Plus,
  Loader2,
  Search,
  Check,
  X,
  RefreshCw,
  Mail,
  Send
} from 'lucide-react'
import { format } from 'date-fns'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import {
  groupsApi,
  type GroupInvitation,
  type JoinSource,
  type SentJoinRequest,
} from '@/features/chat/api/groups'
import type { DiscoveryGroupCard } from '@/api/discovery'
import { ApiError } from '@/lib/apiEnvelope'
import { ConversationItem } from './ConversationItem'
import { CreateGroupDialog } from './CreateGroupDialog'
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
    loadMyGroups,
    selectGroup,
  } = useGroupStore()

  const { setSelectedConversation, selectedConversation } = useChatStore()

  // groupStore 的 selectionError 此前是零消费方：selectGroup 里加载成员/公告
  // 失败时只 console.error，用户什么都看不到。这里给它接一个可见的消费方——
  // 选中一个群之后，"成员和公告悄悄加载失败"不该和"选群成功"长得一样。
  // 用专门的 selectionError 而不是共享的 `error`：createGroup/updateGroup
  // 各自在调用点已经 try/catch 弹过 toast，共享同一个字段会让同一次失败弹两次。
  //（这里原本还列着 store 的 searchGroups，那个 action 零消费方且漏了 limit，
  // 批 6 复核时删除——搜索始终是本组件直接调 `groupsApi.searchGroups`。）
  useEffect(() => {
    if (!selectionError) return
    toast({ title: t('chat.groupList.failed'), description: selectionError, variant: 'destructive' })
    clearSelectionError()
  }, [selectionError, clearSelectionError, t, toast])

  // 创建群聊状态：是否显示对话框——表单本身的四个 state 与提交逻辑已经
  // 搬进 CreateGroupDialog（Task 8）。
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // 加入群聊状态。输入框接受「完整群名」或「群 ID」两种——发现搜索是完全匹配
  // （大小写不敏感的 ILIKE，无通配，发现搜索.md:164），子串不再命中。
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchingGroup, setSearchingGroup] = useState(false)
  // `join_mode` 已从这里删掉：后端两个响应结构里都没有这个字段了（doc:460-461），
  // 读到的恒为 undefined，旧代码的三处 `|| 'approval_required'` 把这件事
  // 完整地藏了起来。批 4 起「申请提交后是直接进群还是落待审」由
  // `applyToJoin` 返回的 `data.status` 直答（doc:1128-1132），前端不再猜。
  //
  // 批 6 起类型就是到货的那一个：discovery 的 `GroupCard`。此前这里手写了一个
  // 结构字面量，字段名（`group_avatar_url`）和可选性都是照着已删端点写的。
  //
  // 存的是**整个数组**，不是 `results[0]`：请求带 `limit=20`（`discovery.ts` 的
  // `clampDiscoveryLimit` 注释解释了为什么让 URL 说真话），而完全匹配同名群是
  // 合法的，所以「到货 20 条、只渲染 1 条、其余 19 条一声不吭地丢掉」正是这一轮
  // 在消灭的那类静默偏差——只不过丢的是结果而不是错误。
  const [searchResults, setSearchResults] = useState<DiscoveryGroupCard[]>([])
  // 申请附言按 group_id 各存各的：多张卡片同屏时共用一个 string 会让在 A 卡片里
  // 打的字出现在 B 卡片的输入框里。搜到结果时按 group_id 建满（见
  // `handleSearchGroup`），渲染与读取都只认这份表里的键。
  const [applyReasons, setApplyReasons] = useState<Record<string, string>>({})
  // 哪一张卡片正在提交。用 group_id 而不是布尔：否则一次提交会把所有卡片的
  // 按钮一起转圈，用户看不出自己点的是哪一个。
  const [applyingGroupId, setApplyingGroupId] = useState<string | null>(null)

  // 我发出的、仍在待审的加群申请（`GET /api/groups/requests/sent`，doc:1330-1369）。
  // 三态与群邀请列表同构：加载中 / 失败 / (空 | 列表)——"请求失败"和"确实没有
  // 申请"必须分开渲染，否则又是 apiEnvelope.ts 开篇那类看不见的失败。
  const [sentRequests, setSentRequests] = useState<SentJoinRequest[]>([])
  const [loadingSent, setLoadingSent] = useState(false)
  const [sentError, setSentError] = useState<string | null>(null)

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
  //
  // 🔴 **这是纯组件内存，撑不过一次刷新，而且前端修不了这一条**：
  // `InvitationInfo`（`GET /api/groups/invitations` 的行，doc:1176-1189
  // 字段表）里**没有** `user_accepted` 字段——`JoinRequest.user_accepted`
  // 有（doc:1258-1260），`InvitationInfo` 没有。也就是说页面一刷新，
  // `pendingApprovalIds` 归零，而前端手里**没有任何数据源**能重新算出
  // "这条邀请我已经同意过、正在等审批"这件事，因为后端压根没把这个状态
  // 吐给这个端点。
  //
  // 刷新之后会撞上两种同样不理想的结局之一（取决于这条记录刷新后还在不在
  // `GET /invitations` 里返回，文档没写）：
  // - 还在 ⇒ 这一行重新长出「同意/拒绝」两个按钮，用户能对着一条自己已经
  //   `user_accepted=true` 的记录再点一次「同意」——文档完全没说对一条
  //   已同意的记录再次 accept 会发生什么，这是本次迁移留下的一处未定义
  //   行为，不是本次要补的兜底；
  // - 不在了 ⇒ 用户回到最初那句抱怨：刷新一次之后，「我已经同意了，正在
  //   等审批」这件事在界面上彻底没有入口，只能干等或去找管理员确认。
  //
  // 前端能做的补丁（比如"只要发过 accept 请求就写 localStorage 永久记住"）
  // record 的是"这台设备发过这个请求"，不是"这条邀请此刻的真实状态"——
  // 换设备、清缓存、甚至只是被另一个管理员批准/拒绝之后，这份本地记录都会
  // 和后端脱节，伪造出一种它并不具备的可靠性，正是本次迁移要消灭的那类
  // "看着能用、实际是假的"形态。真正的修法在后端：给 `InvitationInfo` 加一个
  // `user_accepted: boolean`（同名同义于 `JoinRequest.user_accepted`），
  // 前端才有一个真实字段可以在每次挂载时重新推导这份状态，而不是拿组件
  // 生命周期顶替数据库。
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

  /**
   * 拉「我发出的加群申请」。
   *
   * 这是本批三个新端点里唯一有现成落点的一个：用户在下面的搜索卡片里点了
   * 「申请加入」、拿到 `status: 'pending'` 之后，此前**没有任何界面**能告诉他
   * 这条申请还在不在——后端 doc:1330-1369 一直有这个端点，前端从来没实现。
   *
   * 包 `useCallback` 是为了能把它如实写进下面 effect 的依赖数组：函数每次渲染
   * 换引用的话，要么 effect 每次渲染都重跑，要么依赖数组撒谎。
   * （上面 `loadInvitations` 的 `[subTab]` 是既有欠账，biome 至今在警告它，
   * 不在这一批里顺手动。）
   */
  const loadSentRequests = useCallback(async () => {
    setLoadingSent(true)
    setSentError(null)
    try {
      // 空列表和形状漂移在 api 层已经被分开了（`data.requests` 拿不到数组就抛），
      // 所以这里不需要 Array.isArray 之类的兜底把"解析错了"变成"暂无申请"。
      setSentRequests(await groupsApi.getSentJoinRequests())
    } catch (error) {
      console.error('Failed to load sent join requests:', error)
      setSentError(
        error instanceof Error ? error.message : t('chat.groupList.loadSentRequestsFailed'),
      )
    } finally {
      setLoadingSent(false)
    }
  }, [t])

  useEffect(() => {
    if (subTab === 'join') {
      void loadSentRequests()
    }
  }, [subTab, loadSentRequests])

  /** 清空一次搜索的全部产物（结果、每张卡片的附言）。关键词单独清，见调用点。 */
  const clearSearchResults = () => {
    setSearchResults([])
    setApplyReasons({})
  }

  // 搜索群聊
  const handleSearchGroup = async () => {
    if (!searchKeyword.trim()) {
      toast({
        title: t('chat.groupList.error'),
        description: t('chat.groupList.enterGroupKeyword'),
        variant: 'destructive',
      })
      return
    }

    setSearchingGroup(true)
    clearSearchResults()
    try {
      const results = await groupsApi.searchGroups(searchKeyword.trim())
      if (results.length > 0) {
        // 全部留下。`results[0]` 之外的那些不是噪声：完全匹配（大小写不敏感的
        // ILIKE，发现搜索.md:164）允许同名群同时命中，丢掉它们等于替用户做了
        // 一个他不知道自己做过的选择。
        setSearchResults(results)
        setApplyReasons(Object.fromEntries(results.map((card) => [card.group_id, ''])))
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
   *
   * 形参是**具体哪一张卡片**：搜索结果可以有多条（同名群完全匹配都会命中），
   * 从组件状态里去猜"当前那一个"就会在多结果时点 A 申请到 B。
   *
   * 调用点已由 `card.is_member` 门控（渲染处不给已在群的人这颗按钮）：
   * 后端对已是成员的申请返回 400「已是该群成员」（群聊管理.md:1089），
   * 渲染一颗必被拒的按钮就是拿一次注定的报错去换用户的一次点击。
   */
  const handleApplyJoin = async (card: DiscoveryGroupCard) => {
    const source: JoinSource = 'search'
    setApplyingGroupId(card.group_id)
    try {
      const result = await groupsApi.applyToJoin(
        card.group_id,
        source,
        applyReasons[card.group_id].trim() || undefined,
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
      } else {
        // 落待审 ⇒ 这条申请此刻就该出现在下面「我发出的申请」里。不刷新的话，
        // 用户看到的是一句 toast 之后什么都没变，和"申请没发出去"分不开。
        await loadSentRequests()
      }
      clearSearchResults()
      setSearchKeyword('')
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: describeApplyError(error, source),
        variant: 'destructive',
      })
    } finally {
      setApplyingGroupId(null)
    }
  }

  /**
   * accept 的 403 同样只有通用文案「权限不足」（doc:1093-1099 没有为这个端点
   * 单独定义文案）。文档记录的唯一成因就是 `groups.ts` 里 `acceptInvitation`
   * 上方那段注释：存量 `member_invite` 邀请在群主关掉 `allow_join_via_referral`
   * 之后不可 accept（doc:749-751 的 ⚠️、doc:1097-1099——同一道门在
   * `POST /{group_id}/apply` 上也有一份，见 {@link describeApplyError}）。
   * 文档没有再列出这个端点的其它 403 成因，所以按状态码单值映射是安全的——
   * 不像 apply 那样还要按 `source` 分支。
   */
  const describeAcceptError = (error: unknown): string => {
    if (error instanceof ApiError && error.status === 403) {
      return t('chat.groupList.inviteAcceptClosed')
    }
    return error instanceof Error ? error.message : t('chat.groupList.acceptInviteFailed')
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
        description: describeAcceptError(error),
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

        <CreateGroupDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
      </div>
    )
  }

  // 加入群聊
  if (subTab === 'join') {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6">
        {/* 搜索群聊 */}
        <div className="p-4 rounded-xl space-y-3 border bg-card">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Search className="h-4 w-4" />
            {t('chat.groupList.searchGroup')}
          </div>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={t('chat.groupList.enterGroupKeywordPlaceholder')}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="flex-1 h-10"
            />
            <Button
              variant="outline"
              className="h-10 px-5"
              onClick={handleSearchGroup}
              disabled={searchingGroup || !searchKeyword.trim()}
            >
              {searchingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : t('chat.groupList.search')}
            </Button>
          </div>

          {/*
            搜索结果——**全部**渲染。请求带 `limit=20`，旧实现只留 `results[0]`：
            同名群完全匹配都会命中（发现搜索.md:164 的 ILIKE 无通配），于是"到货 20 条
            只显示 1 条"会让用户以为另外那些群不存在，而屏幕上没有任何信号。
          */}
          {searchResults.length > 1 && (
            <div className="text-xs text-muted-foreground">
              {t('chat.groupList.matchedGroupCount', { count: searchResults.length })}
            </div>
          )}
          {searchResults.map((card) => (
            <motion.div
              key={card.group_id}
              className="p-4 rounded-xl space-y-3 border bg-accent/30"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={card.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {card.group_name[0]?.toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="font-medium text-foreground">{card.group_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('chat.groupList.memberCount', { count: card.member_count })}
                  </div>
                </div>
                {/*
                  「要不要审核」的唯一判据是 `join_approval_required`：五档 join_mode
                  连同数据库列一起被 migration 043 删了（发现搜索.md:109-112）。
                  卡片上直接显示，用户按下「申请加入」之前就知道会不会落待审。
                */}
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {card.join_approval_required
                    ? t('chat.groupList.needApproval')
                    : t('chat.groupList.noApproval')}
                </span>
              </div>

              {/*
                `is_member` 在这里被消费——这也是 `parseDiscoveryGroupCard` 严格解析
                它的理由。已在群里的人点「申请加入」，后端必回 400「已是该群成员」
                （群聊管理.md:1089）：渲染一颗注定被拒的按钮，等于用一次报错去回答
                一个本地就能回答的问题。改成告诉他人已经在群里，附言输入框一并撤掉。
              */}
              {card.is_member ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-muted-foreground">
                    {t('chat.groupList.alreadyMember')}
                  </span>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => {
                      clearSearchResults()
                      setSearchKeyword('')
                    }}
                  >
                    {t('chat.groupList.cancel')}
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">{t('chat.groupList.applyReason')}</label>
                    <Input
                      type="text"
                      placeholder={t('chat.groupList.applyReasonPlaceholder')}
                      value={applyReasons[card.group_id]}
                      onChange={(e) =>
                        setApplyReasons((prev) => ({ ...prev, [card.group_id]: e.target.value }))
                      }
                      className="h-10"
                      maxLength={100}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-10"
                      onClick={() => {
                        clearSearchResults()
                        setSearchKeyword('')
                      }}
                    >
                      {t('chat.groupList.cancel')}
                    </Button>
                    <Button
                      className="flex-1 h-10"
                      onClick={() => handleApplyJoin(card)}
                      disabled={applyingGroupId !== null}
                    >
                      {applyingGroupId === card.group_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('chat.groupList.applyJoin')
                      )}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>

        {/*
          我发出的加群申请（`GET /api/groups/requests/sent`，doc:1330-1369）。
          放在「加入群聊」这一页而不是「群邀请」页：这里是申请发出去的地方，
          用户提交完之后要找的也是这里。方向也不同——邀请是别人发给我的。
        */}
        <div className="p-4 rounded-xl space-y-3 border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Send className="h-4 w-4" />
              {t('chat.groupList.sentRequests')}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={loadSentRequests}
              disabled={loadingSent}
            >
              <RefreshCw className={`h-4 w-4 ${loadingSent ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {loadingSent ? (
            // `data-testid` 是这一态**唯一**能被断言的痕迹：加载中只有一个转圈
            // 图标，没有文案，而失败态与空态各自有一句可 `getByText` 的话。少了它
            // 这一支就是哑的——把 `loadingSent` 换成 `false`，加载中会安静地渲染成
            // 「暂无待审核的加群申请」，35 条用例一条都不红。三态必须在 DOM 里
            // 分得开，不能只有其中两态分得开。
            <div
              data-testid="sent-requests-loading"
              className="flex items-center justify-center py-6"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : sentError ? (
            // 失败态和"确实没有申请"分开渲染：两者在屏幕上长得一样，就等于
            // 又造了一个没人会报的 bug。
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <p className="text-sm text-destructive">{sentError}</p>
              <Button variant="outline" size="sm" onClick={loadSentRequests}>
                {t('chat.groupList.retry')}
              </Button>
            </div>
          ) : sentRequests.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('chat.groupList.noSentRequests')}
            </p>
          ) : (
            <>
              {sentRequests.map((request) => (
                <div
                  key={request.request_id}
                  className="p-3 rounded-xl flex items-start gap-3 border bg-accent/30"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={request.group_avatar_url ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {request.group_name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{request.group_name}</div>
                    {request.message !== null && (
                      <div className="text-sm text-muted-foreground truncate">{request.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(request.created_at), 'yyyy/MM/dd')}
                    </div>
                  </div>
                  {/*
                    只有状态徽章，**没有「撤回」按钮**：doc:1334 写明后端 by design
                    不提供 `DELETE`/`cancel` 端点。画一颗点了只会 404 的按钮，等于
                    替后端编一个它没有的能力；下面那句提示是它的替代品。
                    徽章文案写死成「等待审核」而不读 `request.status`，是因为解包层
                    已经把该字段钉在闭集 `pending` 上（非 pending 会抛错），两者等价。
                  */}
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {t('chat.groupList.sentStatusPending')}
                  </span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {t('chat.groupList.sentNoWithdrawHint')}
              </p>
            </>
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
          // 同「我发出的申请」那一块：加载态没有任何文案，`data-testid` 是它在
          // DOM 里唯一的身份。见那里的注释。
          <div data-testid="invites-loading" className="flex items-center justify-center h-32">
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
                    // 已同意但还没进群：这一行保留，两个按钮**都**换成状态说明。
                    // 「同意」没有意义的理由见上（后端那条记录已经是
                    // user_accepted=true）。「拒绝」一并去掉，是刻意的选择而不是
                    // 漏改：accept 已经把这条记录送进了 `GET /{group_id}/requests`
                    // 待审队列（doc:1258-1260），此刻它在语义上已经不是"一条待
                    // 我表态的邀请"，而是"一条待审批人处理的申请"——真正能动它
                    // 的下一步在审批人手里（批准/拒绝申请），不在邀请人这一侧。
                    // 文档也没有给出反证：`POST /invitations/{id}/decline`
                    // （doc:1236-1247）连响应样例都没有，对一条
                    // `user_accepted=true` 的记录调用它会不会撤销已经生效的同意、
                    // 或者对着一条已经不在原队列里的记录报错，完全没有说明——
                    // 与其猜一个可能撤销用户刚做出的同意的操作，不如不给这个入口。
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
