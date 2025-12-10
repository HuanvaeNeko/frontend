import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useFriendsStore } from '@/store/friendsStore'
import { useChatStore } from '@/store/chatStore'

interface FriendsListProps {
  searchQuery: string
}

type SubTab = 'list' | 'requests' | 'sent'

export default function FriendsList({ searchQuery }: FriendsListProps) {
  const [subTab, setSubTab] = useState<SubTab>('list')
  const { friends, pendingRequests } = useFriendsStore()
  const { setSelectedConversation } = useChatStore()

  const filteredFriends = friends.filter((friend) =>
    friend.nickname.toLowerCase().includes(searchQuery.toLowerCase()) ||
    friend.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelectFriend = (friend: typeof friends[0]) => {
    setSelectedConversation({
      id: friend.user_id,
      type: 'friend',
      name: friend.nickname,
      avatar: friend.avatar_url,
      unreadCount: 0,
      online: false, // Friend 类型中没有 online 属性，使用默认值
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* 子标签切换 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setSubTab('list')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            subTab === 'list'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          好友
        </button>
        <button
          onClick={() => setSubTab('requests')}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            subTab === 'requests'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          新朋友
          {pendingRequests.length > 0 && (
            <span className="absolute top-2 right-1/4 bg-red-500 text-white text-xs rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
              {pendingRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('sent')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            subTab === 'sent'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          已发送
        </button>
      </div>

      {/* 好友列表 */}
      {subTab === 'list' && (
        <div className="flex-1 overflow-y-auto">
          {filteredFriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p className="text-sm">
                {searchQuery ? '未找到匹配的好友' : '暂无好友'}
              </p>
              <p className="text-xs mt-1">点击右上角添加好友</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredFriends.map((friend) => (
                <div
                  key={friend.user_id}
                  onClick={() => handleSelectFriend(friend)}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={friend.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-400 text-white">
                          {friend.nickname[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {/* 在线状态 - Friend 类型暂不支持 online 属性，暂时隐藏 */}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-gray-800 truncate">
                          {friend.nickname}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {friend.signature || friend.user_id}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 新朋友请求 */}
      {subTab === 'requests' && (
        <div className="flex-1 overflow-y-auto">
          {pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p className="text-sm">暂无好友请求</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingRequests.map((request) => (
                <div key={request.applicant_user_id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-gradient-to-br from-green-400 to-blue-400 text-white">
                        {request.nickname[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-800">{request.nickname}</h3>
                      <p className="text-sm text-gray-500 mb-2">{request.reason || '请求添加你为好友'}</p>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1">
                          同意
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1">
                          拒绝
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 已发送的请求 */}
      {subTab === 'sent' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <p className="text-sm">暂无已发送的好友请求</p>
          </div>
        </div>
      )}
    </div>
  )
}
