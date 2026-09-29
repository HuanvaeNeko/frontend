import { useState, useEffect, useRef } from 'react'
import {
  Settings,
  Users,
  Bell,
  Crown,
  Shield,
  UserPlus,
  UserMinus,
  VolumeX,
  Volume2,
  Check,
  Trash2,
  Edit3,
  Plus,
  Loader2,
  Camera,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import {
  groupsApi,
  type Group,
  type GroupMember,
  type GroupNotice,
  type InviteResult,
  type JoinPolicy,
  type JoinRequest,
  type SearchScope,
  type ShareScope
} from '../../api/groups'
import { ApiError } from '@/lib/apiEnvelope'
import { isUploadSessionExpired } from '@/api/storage'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useI18n } from '@/i18n/I18nProvider'

interface GroupManagementProps {
  groupId: string
  onClose?: () => void
}

export default function GroupManagement({ groupId, onClose }: GroupManagementProps) {
  const { toast } = useToast()
  const { t } = useI18n()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 群信息
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)

  // 成员
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  // 三态之三：失败。与"成员列表为空"分开表示——否则一次网络故障会长期显示
  // 空空如也的成员列表，和真的没有成员没有任何区别（apiEnvelope.ts 规则 1）。
  const [membersError, setMembersError] = useState<string | null>(null)

  // 公告
  const [notices, setNotices] = useState<GroupNotice[]>([])
  const [loadingNotices, setLoadingNotices] = useState(false)
  const [noticesError, setNoticesError] = useState<string | null>(null)

  // 加入请求
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [requestsError, setRequestsError] = useState<string | null>(null)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)

  // UI 状态
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'notices' | 'requests'>('info')
  const [editingName, setEditingName] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [newDescription, setNewDescription] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

  // 弹窗状态
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteUserIds, setInviteUserIds] = useState('')
  const [inviting, setInviting] = useState(false)

  const [showNoticeDialog, setShowNoticeDialog] = useState(false)
  const [noticeTitle, setNoticeTitle] = useState('')
  const [noticeContent, setNoticeContent] = useState('')
  const [noticePinned, setNoticePinned] = useState(false)
  const [creatingNotice, setCreatingNotice] = useState(false)

  // 成员操作
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null)
  const [showMuteDialog, setShowMuteDialog] = useState(false)
  const [muteDuration, setMuteDuration] = useState(60)
  const [operating, setOperating] = useState(false)

  // 我的角色
  const myMember = members.find(m => m.user_id === user?.user_id)
  const isOwner = myMember?.role === 'owner'
  const isAdmin = myMember?.role === 'owner' || myMember?.role === 'admin'

  /**
   * 谁能列/批/拒入群申请：群主恒可；管理员**只在** `admin_can_approve=true`
   * 时可以，否则三条审批端点一律 `403`（doc:1255、:1274、:1306，权限总表 :2256）。
   * 旧代码用的是 `isAdmin`，等于给 `admin_can_approve=false` 的群里的管理员
   * 渲染一个每次点都 403 的页签。
   *
   * `group === null` 只在群详情还没到或加载失败时出现，那时管理员一侧取不到
   * 判据——不猜，按最小可见处理（只有群主看得到）。这里刻意不写
   * `group?.admin_can_approve ?? true` 之类的兜底：猜错的方向就是那个 403 页签。
   */
  const canApproveJoinRequests = isOwner || (isAdmin && group !== null && group.admin_can_approve)

  // 加载数据
  useEffect(() => {
    loadGroupInfo()
    loadMembers()
    loadNotices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // 入群申请要等「有没有审批权」确定之后再拉：挂载那一刻 members 还是空的，原实现按那时
  // 闭包里的 isAdmin（恒 false）判断，自动加载从不发生——页签显示「加入申请0」、点开是
  // 「暂无加入申请」，群主以为没人申请。判据用 canApproveJoinRequests（群主，或
  // admin_can_approve=true 的管理员），不是 isAdmin：无审批权的管理员拉这个列表只会 403。
  useEffect(() => {
    if (canApproveJoinRequests) loadJoinRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, canApproveJoinRequests])

  /**
   * 加载群详情。`getGroupDetail` 现在会抛 `ApiError`，文案是后端原文
   * （403「你不是本群成员」、404「群聊不存在」）或 `groupDetailResponse` 逐字段
   * 校验失败时的精确文案（如「join_approval_required 缺失或不是布尔值」）——
   * 旧代码是不带绑定的 `catch {}`，两种信息都被吞掉，用户和排查者看到的永远
   * 是同一句「加载群信息失败」。与 150 行之外 `handleUpdateJoinPolicy` 修的是
   * 同一种症状，这里抄同一个修法：能读到 `err.message` 就用它，读不到才退到
   * 通用兜底。
   */
  const loadGroupInfo = async () => {
    setLoading(true)
    try {
      const data = await groupsApi.getGroupDetail(groupId)
      setGroup(data)
      setNewGroupName(data.group_name)
      setNewDescription(data.group_description || '')
    } catch (err) {
      toast({
        title: t('chat.groupList.error'),
        description: err instanceof Error ? err.message : t('groupManage.info.loadFailed'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    setLoadingMembers(true)
    setMembersError(null)
    try {
      const { members } = await groupsApi.getMembers(groupId)
      setMembers(members)
    } catch (err) {
      // 三态：失败要能和"这个群真的没有成员"区分开，不能只 console.error
      // 然后让成员列表继续显示上一次（或初始的空）状态。
      console.error('加载成员失败:', err)
      setMembersError(err instanceof Error ? err.message : t('groupManage.members.loadFailed'))
    } finally {
      setLoadingMembers(false)
    }
  }

  const loadNotices = async () => {
    setLoadingNotices(true)
    setNoticesError(null)
    try {
      const data = await groupsApi.getNotices(groupId)
      setNotices(data)
    } catch (err) {
      console.error('加载公告失败:', err)
      setNoticesError(err instanceof Error ? err.message : t('groupManage.notices.loadFailed'))
    } finally {
      setLoadingNotices(false)
    }
  }

  const loadJoinRequests = async () => {
    setLoadingRequests(true)
    setRequestsError(null)
    try {
      const data = await groupsApi.getJoinRequests(groupId)
      setJoinRequests(data)
    } catch (err) {
      console.error('加载加入请求失败:', err)
      setRequestsError(err instanceof Error ? err.message : t('groupManage.requests.loadFailed'))
    } finally {
      setLoadingRequests(false)
    }
  }

  /**
   * 403 在 approve/reject 上只有一种成因：`admin_can_approve=false` 时管理员
   * 无权审批（doc:1274、:1306）。该 403 的响应体文案是通用「权限不足」——
   * 不含任何专属关键词，只能按状态码分诊，不能 match 消息体字符串。
   */
  const describeApprovalError = (err: unknown, fallback: string): string => {
    if (err instanceof ApiError && err.status === 403) {
      return t('groupManage.requests.noPermission')
    }
    return err instanceof Error ? err.message : fallback
  }

  const handleApproveRequest = async (requestId: string) => {
    setProcessingRequest(requestId)
    try {
      await groupsApi.approveJoinRequest(groupId, requestId)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.requests.approved') })
      setJoinRequests(prev => prev.filter(r => r.request_id !== requestId))
      loadMembers()
    } catch (err) {
      toast({ title: t('chat.groupList.error'), description: describeApprovalError(err, t('groupManage.actionFailed')), variant: 'destructive' })
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    setProcessingRequest(requestId)
    try {
      await groupsApi.rejectJoinRequest(groupId, requestId)
      toast({ title: t('chat.groupList.rejected'), description: t('groupManage.requests.rejected') })
      setJoinRequests(prev => prev.filter(r => r.request_id !== requestId))
    } catch (err) {
      toast({ title: t('chat.groupList.error'), description: describeApprovalError(err, t('groupManage.actionFailed')), variant: 'destructive' })
    } finally {
      setProcessingRequest(null)
    }
  }

  // 群信息操作
  const handleUpdateName = async () => {
    if (!newGroupName.trim()) return
    try {
      await groupsApi.updateGroup(groupId, { group_name: newGroupName.trim() })
      setGroup(prev => prev ? { ...prev, group_name: newGroupName.trim() } : null)
      setEditingName(false)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.info.nameUpdated') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.info.nameUpdateFailed'), variant: 'destructive' })
    }
  }

  const handleUpdateDescription = async () => {
    try {
      await groupsApi.updateGroup(groupId, { group_description: newDescription })
      setGroup(prev => prev ? { ...prev, group_description: newDescription } : null)
      setEditingDescription(false)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.info.descriptionUpdated') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.info.descriptionUpdateFailed'), variant: 'destructive' })
    }
  }

  /**
   * 群头像走 storage 的四步预签名链路（`POST /api/groups/{id}/avatar` 已于
   * 2026-08-28 删除，doc:250-252）。组件这一侧只有三点要知道：
   *
   * - 结果字段叫 **`file_url`**，不是旧响应的 `avatar_url`（doc:288-306）；
   *   它已在 api 出口补成绝对地址，这里不再拼基址。
   * - 失败一律透出**后端原文**：第 1 步的 403「不是群主/管理员」（doc:285-287）
   *   和 confirm 的「文件大小超过限制…（实际 N 字节）」都是有用的话，
   *   套一句自造的「上传失败」等于把它们扔掉。403 也**不是**登录态问题，
   *   不触发登出。
   * - 409 = 上传会话被同一个群的另一个管理员接管 / 已过期（doc:369）：
   *   重发同一条永远不会成功，必须整条重来。这里只把话说清楚让用户重选文件，
   *   **不自动重试**——自动重走链路会去接管别人的会话，两边互相打架。
   *
   * 因此 `finally` 里必须清掉 input 的 value（仓里同一套写法见 ChatWindow :244、
   * FileManager :182、ProfileModal :260、ProfilePage :81）：浏览器只在 value **变化**
   * 时才发 `change`，不清就等于"失败之后不许重选同一个文件"——而上面那句提示要用户
   * 做的恰恰就是重选文件，一次网络抖动就能把这个入口锁死到用户换一张图为止。
   * 用 ref 而不是 `e.target`：与仓里其余四处一致，也不依赖异步 `finally` 里
   * 事件对象还活着。
   */
  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      const result = await groupsApi.uploadGroupAvatar(groupId, file)
      setGroup(prev => prev ? { ...prev, group_avatar_url: result.file_url } : null)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.info.avatarUpdated') })
    } catch (err) {
      const description = isUploadSessionExpired(err)
        ? t('groupManage.info.avatarSessionTaken', { message: err.message })
        : err instanceof Error ? err.message : t('groupManage.info.avatarUploadFailed')
      toast({ title: t('chat.groupList.error'), description, variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * 改一项入群策略。只发被改的那一个字段——`PUT /{id}/join-policy` 的八个
   * 字段全部可选，「未出现的字段保持原值」（doc:479-480）。整份回填会把
   * 用户没动的开关也写回去，中间隔一次别人的修改就静默覆盖。
   *
   * 回填用**响应**里的完整八值（doc:538），不是本地乐观拼接：服务端可能
   * 因为联动规则回吐和请求不同的值，乐观拼接会让面板显示一个后端没有的状态。
   *
   * 失败时透出后端原文。这个端点**仅群主**可用（doc:477），所以 403 是常规
   * 失败而不是登录态问题——固定文案「更新失败」正是本批要修的症状：
   * 端点被删（404）之后，群主每次改设置都只看到这四个字。
   */
  const handleUpdateJoinPolicy = async (patch: Partial<JoinPolicy>) => {
    setSavingPolicy(true)
    try {
      const policy = await groupsApi.updateJoinPolicy(groupId, patch)
      setGroup(prev => prev ? { ...prev, ...policy } : null)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.policy.updated') })
    } catch (err) {
      toast({
        title: t('chat.groupList.error'),
        description: err instanceof Error ? err.message : t('groupManage.errors.updateJoinPolicy'),
        variant: 'destructive',
      })
    } finally {
      setSavingPolicy(false)
    }
  }

  // 成员操作

  /** 逐条结果拼成一行行「谁：后端怎么说」，文案照抄后端（doc:2299-2300）。 */
  const describeInviteResults = (rows: InviteResult[]): string =>
    rows
      .map(row => t('groupManage.invite.resultRow', { user: row.user_id, message: row.message }))
      .join(t('groupManage.invite.resultSeparator'))

  /**
   * 邀请成员。**本模块唯一一处「HTTP 200 里表达失败」**：整批请求成功的同时，
   * 每个被邀请人的成败在 `results[].success` 里（doc:733-752、doc:782-796）。
   *
   * 旧代码把返回值整个丢弃、无条件弹「邀请已发送」——群关掉
   * `allow_join_via_referral` 之后普通成员邀请的每一个人都会失败
   * （`该群未开放好友推荐加群`，且后端不建记录、不通知），而屏幕上和全部
   * 成功一模一样。这里三分支：全成功 / 部分成功 / 全失败，且**只有全成功
   * 才关弹窗清输入框**，否则用户会连自己刚邀请了谁都找不回来。
   */
  const handleInviteMembers = async () => {
    if (!inviteUserIds.trim()) return
    const userIds = inviteUserIds.split(',').map(id => id.trim()).filter(Boolean)
    if (userIds.length === 0) return
    setInviting(true)
    try {
      const { results } = await groupsApi.inviteMembers(groupId, userIds)
      const failed = results.filter(row => !row.success)
      if (failed.length === 0) {
        // 成功文案也照抄后端：审核开着时它是「邀请已发送，待对方同意并经管理员
        // 审核」，关着时是「对方已自动加入群聊」——自己写一句固定文案就等于
        // 又回到"按我是不是管理员预测结果"。
        toast({ title: t('chat.groupList.success'), description: describeInviteResults(results) })
        setShowInviteDialog(false)
        setInviteUserIds('')
      } else if (failed.length === results.length) {
        toast({
          title: t('groupManage.invite.failed'),
          description: describeInviteResults(failed),
          variant: 'destructive',
        })
      } else {
        toast({
          title: t('groupManage.invite.partial', { ok: results.length - failed.length, failed: failed.length }),
          description: describeInviteResults(failed),
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: t('chat.groupList.error'),
        description: err instanceof Error ? err.message : t('groupManage.invite.failed'),
        variant: 'destructive',
      })
    } finally {
      setInviting(false)
    }
  }

  /** `name` 只用于确认框文案（同 APP「确定要将 某某 移出群聊吗？」），请求仍按 user_id 发。 */
  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(t('groupManage.members.removeConfirm', { name }))) return
    setOperating(true)
    try {
      await groupsApi.removeMember(groupId, userId)
      setMembers(prev => prev.filter(m => m.user_id !== userId))
      toast({ title: t('chat.groupList.success'), description: t('groupManage.members.removed') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.members.removeFailed'), variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleSetAdmin = async (userId: string) => {
    setOperating(true)
    try {
      await groupsApi.setAdmin(groupId, userId)
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: 'admin' } : m))
      toast({ title: t('chat.groupList.success'), description: t('groupManage.members.adminSet') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.actionFailed'), variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleRemoveAdmin = async (userId: string) => {
    setOperating(true)
    try {
      await groupsApi.removeAdmin(groupId, userId)
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: 'member' } : m))
      toast({ title: t('chat.groupList.success'), description: t('groupManage.members.adminRemoved') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.actionFailed'), variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleMuteMember = async () => {
    if (!selectedMember) return
    setOperating(true)
    try {
      await groupsApi.muteMember(groupId, selectedMember.user_id, muteDuration)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.members.muted', { minutes: muteDuration }) })
      setShowMuteDialog(false)
      loadMembers()
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.errors.mute'), variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleUnmuteMember = async (userId: string) => {
    setOperating(true)
    try {
      await groupsApi.unmuteMember(groupId, userId)
      loadMembers()
      toast({ title: t('chat.groupList.success'), description: t('groupManage.members.unmuted') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.actionFailed'), variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  /** `name` 同上，只进确认框文案（同 APP TransferOwner 的「确定要将群主转让给 某某 吗？」）。 */
  const handleTransferOwner = async (userId: string, name: string) => {
    if (!confirm(t('groupManage.members.transferConfirm', { name }))) return
    setOperating(true)
    try {
      await groupsApi.transferOwner(groupId, userId)
      toast({ title: t('chat.groupList.success'), description: t('groupManage.members.transferred') })
      loadMembers()
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.members.transferFailed'), variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  // 公告操作
  const handleCreateNotice = async () => {
    if (!noticeTitle.trim() || !noticeContent.trim()) return
    setCreatingNotice(true)
    try {
      await groupsApi.createNotice(groupId, {
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        is_pinned: noticePinned
      })
      toast({ title: t('chat.groupList.success'), description: t('groupManage.notices.published') })
      setShowNoticeDialog(false)
      setNoticeTitle('')
      setNoticeContent('')
      setNoticePinned(false)
      loadNotices()
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.notices.publishFailed'), variant: 'destructive' })
    } finally {
      setCreatingNotice(false)
    }
  }

  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm(t('groupManage.notices.deleteConfirm'))) return
    try {
      await groupsApi.deleteNotice(groupId, noticeId)
      setNotices(prev => prev.filter(n => n.id !== noticeId))
      toast({ title: t('chat.groupList.success'), description: t('groupManage.notices.deleted') })
    } catch {
      toast({ title: t('chat.groupList.error'), description: t('groupManage.notices.deleteFailed'), variant: 'destructive' })
    }
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-primary', 'bg-primary/90', 'bg-primary/80', 'bg-primary/70',
      'bg-primary/60', 'bg-primary/50', 'bg-primary/40', 'bg-primary/30'
    ]
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="h-4 w-4 text-primary" />
    if (role === 'admin') return <Shield className="h-4 w-4 text-primary" />
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 标签导航 */}
      <div className="flex border-b overflow-x-auto">
        {[
          { key: 'info', label: t('groupManage.tabs.info'), icon: Settings, show: true },
          { key: 'members', label: t('groupManage.tabs.members'), icon: Users, show: true },
          { key: 'notices', label: t('groupManage.tabs.notices'), icon: Bell, show: true },
          { key: 'requests', label: t('groupManage.tabs.requests'), icon: UserPlus, show: canApproveJoinRequests, badge: joinRequests.length }
        ].filter(tab => tab.show).map(tab => (
          <button
            key={tab.key}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {/* 不能写 `tab.badge && …`：数字 0 会被当成文本渲染出来，按钮变成「入群申请0」 */}
            {(tab.badge ?? 0) > 0 && (
              <span className="bg-destructive text-destructive-foreground text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 基本信息 */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            {/* 群头像 */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={group?.group_avatar_url ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {group?.group_name?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadAvatar}
                    />
                    <button
                      className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                  </>
                )}
              </div>
              <div className="flex-1">
                {editingName ? (
                  <div className="flex gap-2">
                    <Input
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleUpdateName}>{t('shell.contacts.save')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>{t('chat.groupList.cancel')}</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold">{group?.group_name}</h2>
                    {isAdmin && (
                      <button onClick={() => setEditingName(true)}>
                        <Edit3 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {t('chat.groupList.memberCount', { count: group?.member_count ?? '' })} · {group?.status === 'active' ? t('groupManage.info.statusActive') : t('groupManage.info.statusDisbanded')}
                </p>
              </div>
            </div>

            {/* 群简介 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  {t('groupManage.info.description')}
                  {isAdmin && !editingDescription && (
                    <button onClick={() => setEditingDescription(true)}>
                      <Edit3 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editingDescription ? (
                  <div className="space-y-2">
                    <textarea
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      className="w-full p-2 border rounded-lg resize-none h-24"
                      placeholder={t('groupManage.info.descriptionPlaceholder')}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleUpdateDescription}>{t('shell.contacts.save')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>{t('chat.groupList.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {group?.group_description || t('groupManage.info.noDescription')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 入群策略：八个字段各自独立，`PUT /{id}/join-policy` 仅群主可用（doc:477）。
                旧代码这里是一个五档 `join_mode` 下拉框，那套模型连同它写的数据库列
                一起被 migration 043 删掉了（doc:442-468）。 */}
            {isOwner && group && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t('groupManage.policy.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-join-approval" className="text-sm">
                        {t('groupManage.policy.requireApproval')}
                        <span className="block text-xs text-muted-foreground">
                          {t('groupManage.policy.requireApprovalHint')}
                        </span>
                      </label>
                      <Switch
                        id="policy-join-approval"
                        checked={group.join_approval_required}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ join_approval_required: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-admin-approve" className="text-sm">
                        {t('groupManage.policy.adminCanApprove')}
                        <span className="block text-xs text-muted-foreground">
                          {t('groupManage.policy.adminCanApproveHint')}
                        </span>
                      </label>
                      <Switch
                        id="policy-admin-approve"
                        checked={group.admin_can_approve}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ admin_can_approve: checked })}
                      />
                    </div>
                  </div>

                  {/* 三档范围：管「看得到 / 拿得到」。与下面三个开关正交（doc:498-507）。 */}
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs text-muted-foreground">{t('groupManage.policy.scopesTitle')}</p>

                    <div className="space-y-1">
                      <label htmlFor="policy-card-share-scope" className="text-sm">{t('groupManage.policy.cardShareScope')}</label>
                      <select
                        id="policy-card-share-scope"
                        value={group.card_share_scope}
                        disabled={savingPolicy}
                        onChange={e => handleUpdateJoinPolicy({ card_share_scope: e.target.value as ShareScope })}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="all_members">{t('groupManage.policy.scopeAllMembers')}</option>
                        <option value="admins">{t('groupManage.policy.scopeAdmins')}</option>
                        <option value="owner_only">{t('groupManage.policy.scopeOwnerOnly')}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="policy-qr-show-scope" className="text-sm">{t('groupManage.policy.qrShowScope')}</label>
                      <select
                        id="policy-qr-show-scope"
                        value={group.qr_show_scope}
                        disabled={savingPolicy}
                        onChange={e => handleUpdateJoinPolicy({ qr_show_scope: e.target.value as ShareScope })}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="all_members">{t('groupManage.policy.scopeAllMembers')}</option>
                        <option value="admins">{t('groupManage.policy.scopeAdmins')}</option>
                        <option value="owner_only">{t('groupManage.policy.scopeOwnerOnly')}</option>
                      </select>
                    </div>

                    {/* 🔴 最松档叫 everyone（任何登录用户），不是上面两档的 all_members
                        （本群全体成员）——语义方向相反，传错会被后端 400（doc:210、:552-554）。 */}
                    <div className="space-y-1">
                      <label htmlFor="policy-search-scope" className="text-sm">{t('groupManage.policy.searchScope')}</label>
                      <select
                        id="policy-search-scope"
                        value={group.search_scope}
                        disabled={savingPolicy}
                        onChange={e => handleUpdateJoinPolicy({ search_scope: e.target.value as SearchScope })}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="everyone">{t('groupManage.policy.searchEveryone')}</option>
                        <option value="admins">{t('groupManage.policy.searchAdmins')}</option>
                        <option value="owner_only">{t('groupManage.policy.searchOwnerOnly')}</option>
                      </select>
                    </div>
                  </div>

                  {/* 三个开关：管「能不能进」。关掉搜索加群不会让群从搜索结果里消失，
                      那是上面的 search_scope 管的事（doc:498-507）。 */}
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs text-muted-foreground">{t('groupManage.policy.channelsTitle')}</p>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-allow-qr" className="text-sm">{t('groupManage.policy.allowQr')}</label>
                      <Switch
                        id="policy-allow-qr"
                        checked={group.allow_join_via_qr}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ allow_join_via_qr: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-allow-search" className="text-sm">{t('groupManage.policy.allowSearch')}</label>
                      <Switch
                        id="policy-allow-search"
                        checked={group.allow_join_via_search}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ allow_join_via_search: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-allow-referral" className="text-sm">
                        {t('groupManage.policy.allowReferral')}
                        <span className="block text-xs text-muted-foreground">
                          {t('groupManage.policy.allowReferralHint')}
                        </span>
                      </label>
                      <Switch
                        id="policy-allow-referral"
                        checked={group.allow_join_via_referral}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ allow_join_via_referral: checked })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 群信息 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('groupManage.info.detailsTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('groupManage.info.groupId')}</span>
                  <span className="font-mono text-xs">{group?.group_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('groupManage.info.createdAt')}</span>
                  <span>{group?.created_at ? new Date(group.created_at).toLocaleDateString() : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('groupManage.info.joinMethod')}</span>
                  <span>{group ? (group.join_approval_required ? t('groupManage.info.joinNeedsApproval') : t('groupManage.info.joinDirect')) : '-'}</span>
                </div>
              </CardContent>
            </Card>

            {/* 危险操作 */}
            <Card className="border-destructive/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">{t('groupManage.danger.title')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* 普通成员可以退出群聊 */}
                {!isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                        <UserMinus className="h-4 w-4" />
                        {t('groupManage.danger.leave')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('groupManage.danger.leaveTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('groupManage.danger.leaveDesc')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('chat.groupList.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            // 本文件之前唯一没有 try/catch 的调用点：抛错会变成
                            // 未处理的 promise rejection，toast 和 onClose 都不
                            // 执行，用户只会看到弹窗自己关掉、什么反馈都没有。
                            try {
                              await groupsApi.leaveGroup(groupId)
                              toast({ title: t('chat.groupList.success'), description: t('groupManage.danger.left') })
                              onClose?.()
                            } catch (err) {
                              toast({
                                title: t('chat.groupList.error'),
                                description: err instanceof Error ? err.message : t('groupManage.errors.leave'),
                                variant: 'destructive',
                              })
                            }
                          }}
                        >
                          {t('groupManage.danger.leaveConfirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {/* 群主可以解散群聊 */}
                {isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full gap-2">
                        <Trash2 className="h-4 w-4" />
                        {t('groupManage.danger.disband')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('groupManage.danger.disbandTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('groupManage.danger.disbandDesc')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('chat.groupList.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            // 同上一个弹窗：补 try/catch，失败要有可见反馈。
                            try {
                              await groupsApi.disbandGroup(groupId)
                              toast({ title: t('chat.groupList.success'), description: t('groupManage.danger.disbanded') })
                              onClose?.()
                            } catch (err) {
                              toast({
                                title: t('chat.groupList.error'),
                                description: err instanceof Error ? err.message : t('groupManage.errors.disband'),
                                variant: 'destructive',
                              })
                            }
                          }}
                        >
                          {t('groupManage.danger.disbandConfirm')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 成员管理 */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            {/*
             * ⚠️ 已知漂移，本批不碰：doc:719 记录 2026-08-17 起「邀请成员」
             * 已经**去掉**了角色门槛（普通成员也能邀请，受 doc:743-752 的
             * allow_join_via_referral 前置行约束，不是 isAdmin），这里的
             * `isAdmin` 门是没跟上的一处。批 4 复核过权限总表
             * （doc:2247-2268）确认这是**单独一处**漂移，不是一整族——本文件
             * 其它角色门（转让群主、设管理员、移除成员等）逐条对过表格都是
             * 对的。
             *
             * 复核者的意见：修复大概率不是直接去掉这道门变成无条件展示——
             * 一个在 `allow_join_via_referral=false` 的群里的普通成员点了会
             * 拿到一屏全失败的 toast（doc:743-752 的前置行：非群主/管理员在
             * 这个开关关着时，逐个被邀请人必然失败）。更贴近文档语义的方向是
             * `isAdmin || group?.allow_join_via_referral`——按钮的可见性
             * 跟着"点了是否至少有机会成功"走，而不是跟着角色走。留给下一批。
             */}
            {isAdmin && (
              <Button className="w-full gap-2" onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="h-4 w-4" />
                {t('groupManage.members.invite')}
              </Button>
            )}

            {loadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : membersError ? (
              // 失败态必须和"这个群真的没有成员"长得不一样——同一句"暂无成员"
              // 曾经在信封化之前把网络故障和真实空列表渲染成同一个画面。
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-destructive">{t('groupManage.members.loadFailedWith', { error: membersError })}</p>
                <Button variant="outline" size="sm" onClick={loadMembers}>{t('chat.groupList.retry')}</Button>
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t('groupManage.members.empty')}</p>
            ) : (
              <div className="space-y-2">
                {members.map(member => {
                  // user_nickname 可为 null（users JOIN 缺失，同文档同族推断——
                  // 参见 groups.ts 里 GroupMember 接口上方的注释）。展示名统一走
                  // 这条链，取到的第一个非空值兜到 user_id，保证非空传给
                  // getAvatarColor / [0] 索引，这是展示层的兜底，不是 api 解包层的。
                  const displayName = member.group_nickname || member.user_nickname || member.user_id
                  return (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.user_avatar_url ?? undefined} />
                      <AvatarFallback className={getAvatarColor(displayName) + ' text-primary-foreground'}>
                        {displayName[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {displayName}
                        </span>
                        {getRoleIcon(member.role)}
                        {member.muted_until && new Date(member.muted_until) > new Date() && (
                          <VolumeX className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {member.role === 'owner'
                          ? t('shell.contacts.roleOwner')
                          : member.role === 'admin'
                            ? t('shell.contacts.roleAdmin')
                            : t('shell.contacts.roleMember')}
                      </span>
                    </div>

                    {/* 成员操作。
                        旧条件 `isAdmin && !self && role !== 'owner'` 漏了一档：
                        管理员**不能动另一个管理员**——移除成员「管理员：只能移除普通成员」
                        （doc:840-842）、禁言「管理员：只能禁言普通成员」（doc:976-978），
                        权限总表 :2262-2263 也是这么写的。漏这一档的后果是给管理员渲染
                        一排点下去必然 403 的按钮。群主不受此限（可动任何成员）。 */}
                    {isAdmin
                      && member.user_id !== user?.user_id
                      && member.role !== 'owner'
                      && (isOwner || member.role !== 'admin') && (
                      <div className="flex gap-1">
                        {member.muted_until && new Date(member.muted_until) > new Date() ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnmuteMember(member.user_id)}
                            disabled={operating}
                          >
                            <Volume2 className="h-4 w-4 text-primary" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedMember(member)
                              setShowMuteDialog(true)
                            }}
                            disabled={operating}
                          >
                            <VolumeX className="h-4 w-4 text-primary" />
                          </Button>
                        )}

                        {isOwner && (
                          <>
                            {member.role === 'admin' ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAdmin(member.user_id)}
                                disabled={operating}
                              >
                                <Shield className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSetAdmin(member.user_id)}
                                disabled={operating}
                              >
                                <Shield className="h-4 w-4 text-primary" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleTransferOwner(member.user_id, displayName)}
                              disabled={operating}
                            >
                              <Crown className="h-4 w-4 text-primary" />
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.user_id, displayName)}
                          disabled={operating}
                        >
                          <UserMinus className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 群公告 */}
        {activeTab === 'notices' && (
          <div className="space-y-4">
            {isAdmin && (
              <Button className="w-full gap-2" onClick={() => setShowNoticeDialog(true)}>
                <Plus className="h-4 w-4" />
                {t('groupManage.notices.create')}
              </Button>
            )}

            {loadingNotices ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : noticesError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-destructive">{t('groupManage.notices.loadFailedWith', { error: noticesError })}</p>
                <Button variant="outline" size="sm" onClick={loadNotices}>{t('chat.groupList.retry')}</Button>
              </div>
            ) : notices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t('groupManage.notices.empty')}</p>
            ) : (
              <div className="space-y-4">
                {notices.map(notice => (
                  <Card key={notice.id} className={notice.is_pinned ? 'border-primary' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {notice.is_pinned && (
                            <span className="text-xs text-primary font-medium">{t('groupManage.notices.pinned')}</span>
                          )}
                          <h4 className="font-medium">{notice.title}</h4>
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            {notice.content}
                          </p>
                          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                            <span>{notice.publisher_nickname}</span>
                            <span>·</span>
                            <span>{new Date(notice.published_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteNotice(notice.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 加入请求审批 */}
        {activeTab === 'requests' && canApproveJoinRequests && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('groupManage.requests.pendingTitle')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadJoinRequests}
                disabled={loadingRequests}
              >
                {loadingRequests ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('chat.groupList.refresh')
                )}
              </Button>
            </div>

            {loadingRequests ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : requestsError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-destructive">{t('groupManage.requests.loadFailedWith', { error: requestsError })}</p>
                <Button variant="outline" size="sm" onClick={loadJoinRequests}>{t('chat.groupList.retry')}</Button>
              </div>
            ) : joinRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t('groupManage.requests.empty')}</p>
            ) : (
              <div className="space-y-2">
                {joinRequests.map(request => {
                  // 昵称可为 null（users JOIN 缺失）——展示层退到 user_id，
                  // 不在解包层兜底成空串。旧代码的 `user_nickname[0]` 在
                  // 这种行上直接 TypeError。
                  const displayName = request.user_nickname ?? request.user_id
                  return (
                  <Card key={request.request_id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.user_avatar_url ?? undefined} />
                          <AvatarFallback className={getAvatarColor(displayName) + ' text-primary-foreground'}>
                            {displayName[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{displayName}</div>
                          <div className="text-xs text-muted-foreground">{request.user_id}</div>
                          {/* 申请附言的字段名是 message，不是 reason——后端从来
                              没有过一个叫 reason 的响应字段（doc:1051 apply 请求体、
                              doc:1367 SentJoinRequestInfo 都是 message；reason 只是
                              `POST …/reject` 的请求体字段）。旧代码读 reason ⇒ 恒
                              undefined ⇒ 整块附言不渲染，审批人是在盲批。 */}
                          {request.message && (
                            <div className="mt-1 rounded bg-muted p-2 text-sm text-muted-foreground">
                              {request.message}
                            </div>
                          )}
                          {/* 2026-08-17 起这个列表里混着邀请类的行（doc:1258-1260、
                              doc:2301-2302）：全部渲染成「申请入群」会让审批人以为
                              对方主动要进来，而实际可能是我们的人邀请的、对方还没
                              点同意（user_accepted=false）。四类都能批，所以两类行
                              的按钮都照常渲染，只有说明文案不同。 */}
                          <div className="text-xs text-muted-foreground mt-1">
                            {request.request_type === 'search_apply'
                              ? t('groupManage.requests.appliedAt', { time: new Date(request.created_at).toLocaleString() })
                              : t('groupManage.requests.invitedAt', {
                                status: request.user_accepted
                                  ? t('groupManage.requests.invitedAccepted')
                                  : t('groupManage.requests.invitedPending'),
                                time: new Date(request.created_at).toLocaleString(),
                              })}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => handleApproveRequest(request.request_id)}
                            disabled={processingRequest === request.request_id}
                          >
                            {processingRequest === request.request_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRejectRequest(request.request_id)}
                            disabled={processingRequest === request.request_id}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 邀请成员弹窗 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('groupManage.members.invite')}</DialogTitle>
            <DialogDescription className="sr-only">{t('groupManage.invite.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">{t('groupManage.invite.userIdsLabel')}</label>
              <Input
                value={inviteUserIds}
                onChange={e => setInviteUserIds(e.target.value)}
                placeholder="user1, user2, user3"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowInviteDialog(false)}>{t('chat.groupList.cancel')}</Button>
              <Button onClick={handleInviteMembers} disabled={inviting}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : t('groupManage.invite.submit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 发布公告弹窗 */}
      <Dialog open={showNoticeDialog} onOpenChange={setShowNoticeDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('groupManage.notices.dialogTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('groupManage.notices.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">{t('groupManage.notices.titleLabel')}</label>
              <Input
                value={noticeTitle}
                onChange={e => setNoticeTitle(e.target.value)}
                placeholder={t('groupManage.notices.titlePlaceholder')}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">{t('groupManage.notices.contentLabel')}</label>
              <textarea
                value={noticeContent}
                onChange={e => setNoticeContent(e.target.value)}
                placeholder={t('groupManage.notices.contentPlaceholder')}
                className="mt-1 w-full p-2 border rounded-lg resize-none h-32"
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noticePinned}
                onChange={e => setNoticePinned(e.target.checked)}
              />
              <span className="text-sm">{t('groupManage.notices.pinLabel')}</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNoticeDialog(false)}>{t('chat.groupList.cancel')}</Button>
              <Button onClick={handleCreateNotice} disabled={creatingNotice}>
                {creatingNotice ? <Loader2 className="h-4 w-4 animate-spin" /> : t('groupManage.notices.submit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 禁言弹窗 */}
      <Dialog open={showMuteDialog} onOpenChange={setShowMuteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('groupManage.mute.title', { name: selectedMember ? selectedMember.group_nickname || selectedMember.user_nickname || selectedMember.user_id : '' })}</DialogTitle>
            <DialogDescription className="sr-only">{t('groupManage.mute.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">{t('groupManage.mute.durationLabel')}</label>
              <Input
                type="number"
                value={muteDuration}
                onChange={e => setMuteDuration(parseInt(e.target.value) || 1)}
                min={1}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[10, 30, 60, 360, 1440].map(mins => (
                <Button
                  key={mins}
                  variant="outline"
                  size="sm"
                  onClick={() => setMuteDuration(mins)}
                >
                  {mins < 60
                    ? t('groupManage.mute.presetMinutes', { n: mins })
                    : t('groupManage.mute.presetHours', { n: mins / 60 })}
                </Button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowMuteDialog(false)}>{t('chat.groupList.cancel')}</Button>
              <Button onClick={handleMuteMember} disabled={operating}>
                {operating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('groupManage.mute.confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
