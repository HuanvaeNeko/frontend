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
  Link,
  Copy,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import {
  groupsApi,
  type Group,
  type GroupMember,
  type GroupNotice,
  type InviteCode,
  type JoinMode,
  type JoinRequest
} from '../../api/groups'
import { useToast } from '../../hooks/use-toast'
import { useAuthStore } from '../../store/authStore'

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

  // 公告
  const [notices, setNotices] = useState<GroupNotice[]>([])
  const [loadingNotices, setLoadingNotices] = useState(false)

  // 邀请码
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [loadingCodes, setLoadingCodes] = useState(false)

  // 加入请求
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)

  // UI 状态
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'notices' | 'codes' | 'requests'>('info')
  const [editingName, setEditingName] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingDescription, setEditingDescription] = useState(false)
  const [newDescription, setNewDescription] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // 弹窗状态
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteUserIds, setInviteUserIds] = useState('')
  const [inviting, setInviting] = useState(false)

  const [showNoticeDialog, setShowNoticeDialog] = useState(false)
  const [noticeTitle, setNoticeTitle] = useState('')
  const [noticeContent, setNoticeContent] = useState('')
  const [noticePinned, setNoticePinned] = useState(false)
  const [creatingNotice, setCreatingNotice] = useState(false)

  const [showCodeDialog, setShowCodeDialog] = useState(false)
  const [codeMaxUses, setCodeMaxUses] = useState(10)
  const [codeExpireHours, setCodeExpireHours] = useState(24)
  const [generatingCode, setGeneratingCode] = useState(false)

  // 成员操作
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null)
  const [showMuteDialog, setShowMuteDialog] = useState(false)
  const [muteDuration, setMuteDuration] = useState(60)
  const [operating, setOperating] = useState(false)

  // 我的角色
  const myMember = members.find(m => m.user_id === user?.user_id)
  const isOwner = myMember?.role === 'owner'
  const isAdmin = myMember?.role === 'owner' || myMember?.role === 'admin'

  // 加载数据
  useEffect(() => {
    loadGroupInfo()
    loadMembers()
    loadNotices()
    if (isAdmin) {
      loadInviteCodes()
      loadJoinRequests()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  const loadGroupInfo = async () => {
    setLoading(true)
    try {
      const data = await groupsApi.getGroupDetail(groupId)
      setGroup(data)
      setNewGroupName(data.group_name)
      setNewDescription(data.group_description || '')
    } catch {
      toast({ title: '错误', description: '加载群信息失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    setLoadingMembers(true)
    try {
      const { members } = await groupsApi.getMembers(groupId)
      setMembers(members)
    } catch (err) {
      console.error('加载成员失败:', err)
    } finally {
      setLoadingMembers(false)
    }
  }

  const loadNotices = async () => {
    setLoadingNotices(true)
    try {
      const data = await groupsApi.getNotices(groupId)
      setNotices(data)
    } catch (err) {
      console.error('加载公告失败:', err)
    } finally {
      setLoadingNotices(false)
    }
  }

  const loadInviteCodes = async () => {
    setLoadingCodes(true)
    try {
      const data = await groupsApi.getInviteCodes(groupId)
      setInviteCodes(data)
    } catch (err) {
      console.error('加载邀请码失败:', err)
    } finally {
      setLoadingCodes(false)
    }
  }

  const loadJoinRequests = async () => {
    setLoadingRequests(true)
    try {
      const data = await groupsApi.getJoinRequests(groupId)
      setJoinRequests(data)
    } catch (err) {
      console.error('加载加入请求失败:', err)
    } finally {
      setLoadingRequests(false)
    }
  }

  const handleApproveRequest = async (requestId: string) => {
    setProcessingRequest(requestId)
    try {
      await groupsApi.approveJoinRequest(groupId, requestId)
      toast({ title: '成功', description: '已通过加入申请' })
      setJoinRequests(prev => prev.filter(r => r.request_id !== requestId))
      loadMembers()
    } catch {
      toast({ title: '错误', description: '操作失败', variant: 'destructive' })
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
    } catch {
      toast({ title: '错误', description: '操作失败', variant: 'destructive' })
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

  const handleUpdateJoinMode = async (mode: JoinMode) => {
    try {
      await groupsApi.updateJoinMode(groupId, mode)
      setGroup(prev => prev ? { ...prev, join_mode: mode } : null)
      toast({ title: '成功', description: '入群模式已更新' })
    } catch {
      toast({ title: '错误', description: '更新失败', variant: 'destructive' })
    }
  }

  // 成员操作
  const handleInviteMembers = async () => {
    if (!inviteUserIds.trim()) return
    setInviting(true)
    try {
      const userIds = inviteUserIds.split(',').map(id => id.trim()).filter(Boolean)
      await groupsApi.inviteMembers(groupId, userIds)
      toast({ title: '成功', description: '邀请已发送' })
      setShowInviteDialog(false)
      setInviteUserIds('')
    } catch {
      toast({ title: '错误', description: '邀请失败', variant: 'destructive' })
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

  // 邀请码操作
  const handleGenerateCode = async () => {
    setGeneratingCode(true)
    try {
      const code = await groupsApi.createInviteCode(groupId, {
        max_uses: codeMaxUses,
        expires_in_hours: codeExpireHours
      })
      setInviteCodes(prev => [code, ...prev])
      toast({ title: '成功', description: `邀请码: ${code.code}` })
      setShowCodeDialog(false)
    } catch {
      toast({ title: '错误', description: '生成失败', variant: 'destructive' })
    } finally {
      setGeneratingCode(false)
    }
  }

  const handleRevokeCode = async (codeId: string) => {
    try {
      await groupsApi.revokeInviteCode(groupId, codeId)
      setInviteCodes(prev => prev.filter(c => c.id !== codeId))
      toast({ title: '成功', description: '邀请码已撤销' })
    } catch {
      toast({ title: '错误', description: '撤销失败', variant: 'destructive' })
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
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

  const getJoinModeName = (mode?: JoinMode) => {
    const modes: Record<JoinMode, string> = {
      open: '开放入群',
      approval_required: '需要审核',
      invite_only: '仅邀请',
      admin_invite_only: '仅管理员邀请',
      closed: '禁止入群'
    }
    return modes[mode || 'approval_required']
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
          { key: 'codes', label: '邀请码', icon: Link, show: true },
          { key: 'requests', label: '加入申请', icon: UserPlus, show: isAdmin, badge: joinRequests.length }
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
                  <AvatarImage src={group?.group_avatar_url} />
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

            {/* 入群模式 */}
            {isOwner && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">入群模式</CardTitle>
                </CardHeader>
                <CardContent>
                  <select
                    value={group?.join_mode || 'approval_required'}
                    onChange={e => handleUpdateJoinMode(e.target.value as JoinMode)}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="open">开放入群（任何人可直接加入）</option>
                    <option value="approval_required">需要审核（默认）</option>
                    <option value="invite_only">仅邀请（只能通过邀请加入）</option>
                    <option value="admin_invite_only">仅管理员邀请</option>
                    <option value="closed">禁止入群</option>
                  </select>
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
                  <span className="text-muted-foreground">入群模式</span>
                  <span>{getJoinModeName(group?.join_mode)}</span>
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
                            await groupsApi.leaveGroup(groupId)
                            toast({ title: '成功', description: '已退出群聊' })
                            onClose?.()
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
                            await groupsApi.disbandGroup(groupId)
                            toast({ title: '成功', description: '群聊已解散' })
                            onClose?.()
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
            ) : (
              <div className="space-y-2">
                {members.map(member => (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.user_avatar_url} />
                      <AvatarFallback className={getAvatarColor(member.user_nickname) + ' text-primary-foreground'}>
                        {member.user_nickname[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {member.group_nickname || member.user_nickname}
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

                    {/* 成员操作 */}
                    {isAdmin && member.user_id !== user?.user_id && member.role !== 'owner' && (
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
                ))}
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

        {/* 邀请码 */}
        {activeTab === 'codes' && (
          <div className="space-y-4">
            <Button className="w-full gap-2" onClick={() => setShowCodeDialog(true)}>
              <Plus className="h-4 w-4" />
              生成邀请码
            </Button>

            {loadingCodes ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : inviteCodes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无邀请码</p>
            ) : (
              <div className="space-y-2">
                {inviteCodes.map(code => (
                  <Card key={code.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-lg font-bold">{code.code}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              code.code_type === 'direct' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                            }`}>
                              {code.code_type === 'direct' ? '直接入群' : '需审核'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            有效期至: {new Date(code.expires_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyCode(code.code)}
                          >
                            {copiedCode === code.code ? (
                              <Check className="h-4 w-4 text-primary" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRevokeCode(code.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 加入请求审批 */}
        {activeTab === 'requests' && isAdmin && (
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
            ) : joinRequests.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无加入申请</p>
            ) : (
              <div className="space-y-2">
                {joinRequests.map(request => (
                  <Card key={request.request_id}>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={request.user_avatar_url} />
                          <AvatarFallback className={getAvatarColor(request.user_nickname) + ' text-primary-foreground'}>
                            {request.user_nickname[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{request.user_nickname}</div>
                          <div className="text-xs text-muted-foreground">{request.user_id}</div>
                          {request.reason && (
                            <div className="mt-1 rounded bg-muted p-2 text-sm text-muted-foreground">
                              {request.reason}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            申请时间: {new Date(request.created_at).toLocaleString()}
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
                ))}
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

      {/* 生成邀请码弹窗 */}
      <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>生成邀请码</DialogTitle>
            <DialogDescription className="sr-only">设置邀请码的使用次数和有效期</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground">最大使用次数</label>
              <Input
                type="number"
                value={codeMaxUses}
                onChange={e => setCodeMaxUses(parseInt(e.target.value) || 1)}
                min={1}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">有效期（小时）</label>
              <Input
                type="number"
                value={codeExpireHours}
                onChange={e => setCodeExpireHours(parseInt(e.target.value) || 1)}
                min={1}
                max={168}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCodeDialog(false)}>取消</Button>
              <Button onClick={handleGenerateCode} disabled={generatingCode}>
                {generatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : '生成'}
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
