import { useState } from 'react'
import { Users, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGroupStore } from '../../store/groupStore'
import { useChatStore } from '../../store/chatStore'
import { useToast } from '@/hooks/use-toast'

interface GroupListProps {
  subTab: 'main' | 'invites'
  searchQuery: string
}

export default function GroupList({ subTab, searchQuery }: GroupListProps) {
  const { toast } = useToast()
  const {
    myGroups,
    isLoading,
    createGroup,
    selectGroup,
  } = useGroupStore()
  
  const { setSelectedConversation, selectedConversation } = useChatStore()
  
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [joinMode, setJoinMode] = useState<'open' | 'approval_required' | 'invite_only'>('open')
  const [submitting, setSubmitting] = useState(false)

  // 确保 myGroups 是数组
  const groupsArray = Array.isArray(myGroups) ? myGroups : []

  // 筛选群聊
  const filteredGroups = groupsArray.filter((group) =>
    group.group_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    group.group_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

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

  // 主列表 - 我的群聊
  if (subTab === 'main') {
    return (
      <div className="flex flex-col h-full">
        {/* 创建群聊按钮 */}
        <div className="p-4 border-b">
          <Button
            className="w-full gap-2"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="h-4 w-4" />
            创建群聊
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
                  <AvatarFallback className="bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{group.group_name}</span>
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
              </button>
            ))
          )}
        </div>

        {/* 创建群聊对话框 */}
        {showCreateDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg p-6 w-96 max-w-[90vw]">
              <h3 className="text-lg font-semibold mb-4">创建群聊</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="groupName">群名称</Label>
                  <Input
                    id="groupName"
                    placeholder="输入群名称"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                  />
                </div>
                
                <div>
                  <Label htmlFor="groupDescription">群描述（可选）</Label>
                  <Input
                    id="groupDescription"
                    placeholder="简单介绍一下这个群..."
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
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
                    <option value="open">开放加入</option>
                    <option value="approval_required">需要审批</option>
                    <option value="invite_only">仅邀请</option>
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
                  disabled={submitting}
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

  // 群邀请
  if (subTab === 'invites') {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <p className="text-sm">暂无群邀请</p>
          <p className="text-xs mt-1">群邀请功能即将上线</p>
        </div>
      </div>
    )
  }

  return null
}
