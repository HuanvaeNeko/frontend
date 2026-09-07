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
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/features/auth/store/authStore'

interface GroupManagementProps {
  groupId: string
  onClose?: () => void
}

export default function GroupManagement({ groupId, onClose }: GroupManagementProps) {
  const { toast } = useToast()
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
  //
  // ⚠️ 已知 bug，本批不碰：`isAdmin` 在这里是挂载那一刻的闭包值，那时
  // `members` 还是空数组 ⇒ 恒为 `false` ⇒ 这个自动加载从不发生，只有
  // 页签里的「刷新」按钮能触发（第 4 节有完整分析）。留给下一个人修的陷阱：
  // 页签的可见性已经改用 `canApproveJoinRequests`（群主，或
  // `admin_can_approve=true` 的管理员），如果照搬同一个量把这里的
  // `isAdmin` 也换掉，会变成对着一个「有审批权限」的量做闭包修复——
  // 一个 `admin_can_approve=false` 的管理员本来就不该看到这个页签，也就不该
  // 触发这次加载；`isAdmin` 换成 `canApproveJoinRequests` 才是对的方向，
  // 不是随手把 `isAdmin` 从依赖数组里加进去就完事。
  useEffect(() => {
    loadGroupInfo()
    loadMembers()
    loadNotices()
    if (isAdmin) {
      loadJoinRequests()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

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
        title: '错误',
        description: err instanceof Error ? err.message : '加载群信息失败',
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
      setMembersError(err instanceof Error ? err.message : '加载成员失败')
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
      setNoticesError(err instanceof Error ? err.message : '加载公告失败')
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
      setRequestsError(err instanceof Error ? err.message : '加载加入请求失败')
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
      return '无权操作：本群未开放管理员审批，仅群主可处理入群申请'
    }
    return err instanceof Error ? err.message : fallback
  }

  const handleApproveRequest = async (requestId: string) => {
    setProcessingRequest(requestId)
    try {
      await groupsApi.approveJoinRequest(groupId, requestId)
      toast({ title: '成功', description: '已通过加入申请' })
      setJoinRequests(prev => prev.filter(r => r.request_id !== requestId))
      loadMembers()
    } catch (err) {
      toast({ title: '错误', description: describeApprovalError(err, '操作失败'), variant: 'destructive' })
    } finally {
      setProcessingRequest(null)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    setProcessingRequest(requestId)
    try {
      await groupsApi.rejectJoinRequest(groupId, requestId)
      toast({ title: '已拒绝', description: '已拒绝加入申请' })
      setJoinRequests(prev => prev.filter(r => r.request_id !== requestId))
    } catch (err) {
      toast({ title: '错误', description: describeApprovalError(err, '操作失败'), variant: 'destructive' })
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
      toast({ title: '成功', description: '群名称已更新' })
    } catch {
      toast({ title: '错误', description: '更新群名称失败', variant: 'destructive' })
    }
  }

  const handleUpdateDescription = async () => {
    try {
      await groupsApi.updateGroup(groupId, { group_description: newDescription })
      setGroup(prev => prev ? { ...prev, group_description: newDescription } : null)
      setEditingDescription(false)
      toast({ title: '成功', description: '群简介已更新' })
    } catch {
      toast({ title: '错误', description: '更新群简介失败', variant: 'destructive' })
    }
  }

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      const result = await groupsApi.uploadGroupAvatar(groupId, file)
      setGroup(prev => prev ? { ...prev, group_avatar_url: result.avatar_url } : null)
      toast({ title: '成功', description: '群头像已更新' })
    } catch (err) {
      toast({ title: '错误', description: err instanceof Error ? err.message : '上传失败', variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
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
      toast({ title: '成功', description: '入群策略已更新' })
    } catch (err) {
      toast({
        title: '错误',
        description: err instanceof Error ? err.message : '更新入群策略失败',
        variant: 'destructive',
      })
    } finally {
      setSavingPolicy(false)
    }
  }

  // 成员操作

  /** 逐条结果拼成一行行「谁：后端怎么说」，文案照抄后端（doc:2299-2300）。 */
  const describeInviteResults = (rows: InviteResult[]): string =>
    rows.map(row => `${row.user_id}：${row.message}`).join('；')

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
        toast({ title: '成功', description: describeInviteResults(results) })
        setShowInviteDialog(false)
        setInviteUserIds('')
      } else if (failed.length === results.length) {
        toast({
          title: '邀请失败',
          description: describeInviteResults(failed),
          variant: 'destructive',
        })
      } else {
        toast({
          title: `${results.length - failed.length} 人已邀请，${failed.length} 人失败`,
          description: describeInviteResults(failed),
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: '错误',
        description: err instanceof Error ? err.message : '邀请失败',
        variant: 'destructive',
      })
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('确定要移除该成员吗？')) return
    setOperating(true)
    try {
      await groupsApi.removeMember(groupId, userId)
      setMembers(prev => prev.filter(m => m.user_id !== userId))
      toast({ title: '成功', description: '成员已移除' })
    } catch {
      toast({ title: '错误', description: '移除失败', variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleSetAdmin = async (userId: string) => {
    setOperating(true)
    try {
      await groupsApi.setAdmin(groupId, userId)
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: 'admin' } : m))
      toast({ title: '成功', description: '已设为管理员' })
    } catch {
      toast({ title: '错误', description: '操作失败', variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleRemoveAdmin = async (userId: string) => {
    setOperating(true)
    try {
      await groupsApi.removeAdmin(groupId, userId)
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: 'member' } : m))
      toast({ title: '成功', description: '已取消管理员' })
    } catch {
      toast({ title: '错误', description: '操作失败', variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleMuteMember = async () => {
    if (!selectedMember) return
    setOperating(true)
    try {
      await groupsApi.muteMember(groupId, selectedMember.user_id, muteDuration)
      toast({ title: '成功', description: `已禁言 ${muteDuration} 分钟` })
      setShowMuteDialog(false)
      loadMembers()
    } catch {
      toast({ title: '错误', description: '禁言失败', variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleUnmuteMember = async (userId: string) => {
    setOperating(true)
    try {
      await groupsApi.unmuteMember(groupId, userId)
      loadMembers()
      toast({ title: '成功', description: '已解除禁言' })
    } catch {
      toast({ title: '错误', description: '操作失败', variant: 'destructive' })
    } finally {
      setOperating(false)
    }
  }

  const handleTransferOwner = async (userId: string) => {
    if (!confirm('确定要转让群主吗？此操作不可撤销！')) return
    setOperating(true)
    try {
      await groupsApi.transferOwner(groupId, userId)
      toast({ title: '成功', description: '群主已转让' })
      loadMembers()
    } catch {
      toast({ title: '错误', description: '转让失败', variant: 'destructive' })
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
      toast({ title: '成功', description: '公告已发布' })
      setShowNoticeDialog(false)
      setNoticeTitle('')
      setNoticeContent('')
      setNoticePinned(false)
      loadNotices()
    } catch {
      toast({ title: '错误', description: '发布失败', variant: 'destructive' })
    } finally {
      setCreatingNotice(false)
    }
  }

  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm('确定要删除该公告吗？')) return
    try {
      await groupsApi.deleteNotice(groupId, noticeId)
      setNotices(prev => prev.filter(n => n.id !== noticeId))
      toast({ title: '成功', description: '公告已删除' })
    } catch {
      toast({ title: '错误', description: '删除失败', variant: 'destructive' })
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
          { key: 'info', label: '基本信息', icon: Settings, show: true },
          { key: 'members', label: '成员管理', icon: Users, show: true },
          { key: 'notices', label: '群公告', icon: Bell, show: true },
          { key: 'requests', label: '加入申请', icon: UserPlus, show: canApproveJoinRequests, badge: joinRequests.length }
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
            {tab.badge && tab.badge > 0 && (
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
                    <Button size="sm" onClick={handleUpdateName}>保存</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>取消</Button>
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
                  {group?.member_count} 成员 · {group?.status === 'active' ? '正常' : '已解散'}
                </p>
              </div>
            </div>

            {/* 群简介 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  群简介
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
                      placeholder="输入群简介..."
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleUpdateDescription}>保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {group?.group_description || '暂无简介'}
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
                  <CardTitle className="text-sm">入群策略</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-join-approval" className="text-sm">
                        需要入群审核
                        <span className="block text-xs text-muted-foreground">
                          开启后申请落待审；关闭则符合条件的人直接入群
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
                        允许管理员参与审核
                        <span className="block text-xs text-muted-foreground">
                          关闭后只有群主能列出、通过或拒绝入群申请
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
                    <p className="text-xs text-muted-foreground">谁能把这个群传播出去</p>

                    <div className="space-y-1">
                      <label htmlFor="policy-card-share-scope" className="text-sm">谁能分享群卡片</label>
                      <select
                        id="policy-card-share-scope"
                        value={group.card_share_scope}
                        disabled={savingPolicy}
                        onChange={e => handleUpdateJoinPolicy({ card_share_scope: e.target.value as ShareScope })}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="all_members">全体成员</option>
                        <option value="admins">群主与管理员</option>
                        <option value="owner_only">仅群主</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="policy-qr-show-scope" className="text-sm">谁能展示群二维码</label>
                      <select
                        id="policy-qr-show-scope"
                        value={group.qr_show_scope}
                        disabled={savingPolicy}
                        onChange={e => handleUpdateJoinPolicy({ qr_show_scope: e.target.value as ShareScope })}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="all_members">全体成员</option>
                        <option value="admins">群主与管理员</option>
                        <option value="owner_only">仅群主</option>
                      </select>
                    </div>

                    {/* 🔴 最松档叫 everyone（任何登录用户），不是上面两档的 all_members
                        （本群全体成员）——语义方向相反，传错会被后端 400（doc:210、:552-554）。 */}
                    <div className="space-y-1">
                      <label htmlFor="policy-search-scope" className="text-sm">谁能搜到这个群</label>
                      <select
                        id="policy-search-scope"
                        value={group.search_scope}
                        disabled={savingPolicy}
                        onChange={e => handleUpdateJoinPolicy({ search_scope: e.target.value as SearchScope })}
                        className="w-full p-2 border rounded-lg"
                      >
                        <option value="everyone">任何登录用户</option>
                        <option value="admins">群主与管理员</option>
                        <option value="owner_only">仅群主</option>
                      </select>
                    </div>
                  </div>

                  {/* 三个开关：管「能不能进」。关掉搜索加群不会让群从搜索结果里消失，
                      那是上面的 search_scope 管的事（doc:498-507）。 */}
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-xs text-muted-foreground">哪几条加群通道是开的</p>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-allow-qr" className="text-sm">允许扫码加群</label>
                      <Switch
                        id="policy-allow-qr"
                        checked={group.allow_join_via_qr}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ allow_join_via_qr: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-allow-search" className="text-sm">允许搜索群 ID 加群</label>
                      <Switch
                        id="policy-allow-search"
                        checked={group.allow_join_via_search}
                        disabled={savingPolicy}
                        onCheckedChange={checked => handleUpdateJoinPolicy({ allow_join_via_search: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <label htmlFor="policy-allow-referral" className="text-sm">
                        允许好友推荐加群
                        <span className="block text-xs text-muted-foreground">
                          同时管住普通成员发起的邀请；群主与管理员的邀请不受它约束
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
                <CardTitle className="text-sm">群信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">群ID</span>
                  <span className="font-mono text-xs">{group?.group_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">创建时间</span>
                  <span>{group?.created_at ? new Date(group.created_at).toLocaleDateString() : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">入群审核</span>
                  <span>{group ? (group.join_approval_required ? '需要审核' : '无需审核') : '-'}</span>
                </div>
              </CardContent>
            </Card>

            {/* 危险操作 */}
            <Card className="border-destructive/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-destructive">危险操作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* 普通成员可以退出群聊 */}
                {!isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                        <UserMinus className="h-4 w-4" />
                        退出群聊
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认退出群聊？</AlertDialogTitle>
                        <AlertDialogDescription>
                          退出后将不再接收群消息，需要重新申请或被邀请才能再次加入。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            // 本文件之前唯一没有 try/catch 的调用点：抛错会变成
                            // 未处理的 promise rejection，toast 和 onClose 都不
                            // 执行，用户只会看到弹窗自己关掉、什么反馈都没有。
                            try {
                              await groupsApi.leaveGroup(groupId)
                              toast({ title: '成功', description: '已退出群聊' })
                              onClose?.()
                            } catch (err) {
                              toast({
                                title: '错误',
                                description: err instanceof Error ? err.message : '退出群聊失败',
                                variant: 'destructive',
                              })
                            }
                          }}
                        >
                          确认退出
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
                        解散群聊
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认解散群聊？</AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作不可撤销，群聊将被永久删除。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            // 同上一个弹窗：补 try/catch，失败要有可见反馈。
                            try {
                              await groupsApi.disbandGroup(groupId)
                              toast({ title: '成功', description: '群聊已解散' })
                              onClose?.()
                            } catch (err) {
                              toast({
                                title: '错误',
                                description: err instanceof Error ? err.message : '解散群聊失败',
                                variant: 'destructive',
                              })
                            }
                          }}
                        >
                          确认解散
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
            {isAdmin && (
              <Button className="w-full gap-2" onClick={() => setShowInviteDialog(true)}>
                <UserPlus className="h-4 w-4" />
                邀请成员
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
                <p className="text-sm text-destructive">加载成员失败：{membersError}</p>
                <Button variant="outline" size="sm" onClick={loadMembers}>重试</Button>
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无成员</p>
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
                        {member.role === 'owner' ? '群主' : member.role === 'admin' ? '管理员' : '成员'}
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
                              onClick={() => handleTransferOwner(member.user_id)}
                              disabled={operating}
                            >
                              <Crown className="h-4 w-4 text-primary" />
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveMember(member.user_id)}
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
                发布公告
              </Button>
            )}

            {loadingNotices ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : noticesError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-destructive">加载公告失败：{noticesError}</p>
                <Button variant="outline" size="sm" onClick={loadNotices}>重试</Button>
              </div>
            ) : notices.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无公告</p>
            ) : (
              <div className="space-y-4">
                {notices.map(notice => (
                  <Card key={notice.id} className={notice.is_pinned ? 'border-primary' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {notice.is_pinned && (
                            <span className="text-xs text-primary font-medium">📌 置顶</span>
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
                待处理的加入申请
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
                  '刷新'
                )}
              </Button>
            </div>

            {loadingRequests ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : requestsError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <p className="text-sm text-destructive">加载加入申请失败：{requestsError}</p>
                <Button variant="outline" size="sm" onClick={loadJoinRequests}>重试</Button>
              </div>
            ) : joinRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无加入申请</p>
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
                              ? `主动申请入群 · 申请时间: ${new Date(request.created_at).toLocaleString()}`
                              : `${request.user_accepted ? '由群成员邀请，对方已同意，待你审批' : '由群成员邀请，等待对方确认'} · 邀请时间: ${new Date(request.created_at).toLocaleString()}`}
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
            <DialogTitle>邀请成员</DialogTitle>
            <DialogDescription className="sr-only">通过用户ID邀请成员加入群聊</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">用户ID（多个用逗号分隔）</label>
              <Input
                value={inviteUserIds}
                onChange={e => setInviteUserIds(e.target.value)}
                placeholder="user1, user2, user3"
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowInviteDialog(false)}>取消</Button>
              <Button onClick={handleInviteMembers} disabled={inviting}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : '邀请'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 发布公告弹窗 */}
      <Dialog open={showNoticeDialog} onOpenChange={setShowNoticeDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>发布公告</DialogTitle>
            <DialogDescription className="sr-only">编写并发布群公告</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">标题</label>
              <Input
                value={noticeTitle}
                onChange={e => setNoticeTitle(e.target.value)}
                placeholder="公告标题"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">内容</label>
              <textarea
                value={noticeContent}
                onChange={e => setNoticeContent(e.target.value)}
                placeholder="公告内容"
                className="mt-1 w-full p-2 border rounded-lg resize-none h-32"
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noticePinned}
                onChange={e => setNoticePinned(e.target.checked)}
              />
              <span className="text-sm">置顶公告</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNoticeDialog(false)}>取消</Button>
              <Button onClick={handleCreateNotice} disabled={creatingNotice}>
                {creatingNotice ? <Loader2 className="h-4 w-4 animate-spin" /> : '发布'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 禁言弹窗 */}
      <Dialog open={showMuteDialog} onOpenChange={setShowMuteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>禁言成员: {selectedMember?.user_nickname}</DialogTitle>
            <DialogDescription className="sr-only">设置禁言时长</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">禁言时长（分钟）</label>
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
                  {mins < 60 ? `${mins}分钟` : `${mins / 60}小时`}
                </Button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowMuteDialog(false)}>取消</Button>
              <Button onClick={handleMuteMember} disabled={operating}>
                {operating ? <Loader2 className="h-4 w-4 animate-spin" /> : '确认禁言'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
