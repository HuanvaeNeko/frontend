import { useState, useEffect } from 'react'
import { Search, UserPlus, Users as UsersIcon, Upload, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/store/chatStore'
import { useFriendsStore } from '@/store/friendsStore'
import FriendsList from './FriendsList'
import GroupsList from './GroupsList'
import FilesList from './FilesList'
import WebRTCPanel from './WebRTCPanel'

export default function ConversationList() {
  const { activeTab } = useChatStore()
  const { fetchFriends, fetchFriendRequests } = useFriendsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  // 加载好友数据
  useEffect(() => {
    if (activeTab === 'friends') {
      fetchFriends().catch(console.error)
      fetchFriendRequests().catch(console.error)
    }
  }, [activeTab, fetchFriends, fetchFriendRequests])

  const getTitle = () => {
    switch (activeTab) {
      case 'friends':
        return '好友'
      case 'groups':
        return '群聊'
      case 'files':
        return '文件'
      case 'webrtc':
        return '视频通话'
      default:
        return '消息'
    }
  }

  const getActionButton = () => {
    switch (activeTab) {
      case 'friends':
        return (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => setShowAddFriend(true)}
          >
            <UserPlus size={16} />
            添加好友
          </Button>
        )
      case 'groups':
        return (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => setShowCreateGroup(true)}
          >
            <Plus size={16} />
            创建群聊
          </Button>
        )
      case 'files':
        return (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
          >
            <Upload size={16} />
            上传文件
          </Button>
        )
      default:
        return null
    }
  }

  return (
    <>
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800">{getTitle()}</h2>
          {getActionButton()}
        </div>
        
        {/* 搜索框 */}
        {activeTab !== 'webrtc' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input
              type="text"
              placeholder={`搜索${getTitle()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-50 border-gray-200"
            />
          </div>
        )}
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'friends' && <FriendsList searchQuery={searchQuery} />}
        {activeTab === 'groups' && <GroupsList searchQuery={searchQuery} />}
        {activeTab === 'files' && <FilesList searchQuery={searchQuery} />}
        {activeTab === 'webrtc' && <WebRTCPanel />}
      </div>

      {/* 添加好友弹窗 */}
      {/* TODO: 实现添加好友弹窗 */}
      
      {/* 创建群聊弹窗 */}
      {/* TODO: 实现创建群聊弹窗 */}
    </>
  )
}
