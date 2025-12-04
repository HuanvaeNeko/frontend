import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFriendsStore } from '../store/friendsStore'
import { useAuthStore } from '../store/authStore'
import { 
  UserPlus, 
  UserMinus, 
  Check, 
  X, 
  Ban, 
  Search,
  ArrowLeft,
  Users
} from 'lucide-react'
import type { Friend } from '../api/friends'

export default function Friends() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const {
    friends,
    friendRequests,
    blockedUsers,
    isLoading,
    error,
    loadFriends,
    loadFriendRequests,
    loadBlockedUsers,
    searchUsers,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    deleteFriend,
    blockUser,
    unblockUser,
    clearError,
  } = useFriendsStore()

  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'blocked' | 'search'>('friends')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Friend[]>([])
  const [friendMessage, setFriendMessage] = useState('')
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    // 初始加载数据
    loadFriends()
    loadFriendRequests()
    loadBlockedUsers()
  }, [isAuthenticated, navigate])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      const results = await searchUsers(searchQuery)
      setSearchResults(results)
      setActiveTab('search')
    } catch (err) {
      console.error('搜索失败:', err)
    }
  }

  const handleSendRequest = (userId: string) => {
    setSelectedUserId(userId)
    setShowMessageModal(true)
  }

  const handleConfirmSendRequest = async () => {
    if (!selectedUserId) return
    try {
      await sendFriendRequest(selectedUserId, friendMessage || undefined)
      setShowMessageModal(false)
      setFriendMessage('')
      setSelectedUserId(null)
      alert('好友请求已发送！')
    } catch (err) {
      console.error('发送请求失败:', err)
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId)
      alert('已接受好友请求！')
    } catch (err) {
      console.error('接受请求失败:', err)
    }
  }

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId)
      alert('已拒绝好友请求')
    } catch (err) {
      console.error('拒绝请求失败:', err)
    }
  }

  const handleDeleteFriend = async (friendUserId: string, nickname: string) => {
    if (!confirm(`确定要删除好友 "${nickname}" 吗？`)) return
    try {
      await deleteFriend(friendUserId)
      alert('已删除好友')
    } catch (err) {
      console.error('删除好友失败:', err)
    }
  }

  const handleBlockUser = async (userId: string, nickname: string) => {
    if (!confirm(`确定要屏蔽用户 "${nickname}" 吗？`)) return
    try {
      await blockUser(userId)
      alert('已屏蔽用户')
    } catch (err) {
      console.error('屏蔽用户失败:', err)
    }
  }

  const handleUnblockUser = async (userId: string, nickname: string) => {
    if (!confirm(`确定要取消屏蔽 "${nickname}" 吗？`)) return
    try {
      await unblockUser(userId)
      alert('已取消屏蔽')
    } catch (err) {
      console.error('取消屏蔽失败:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <button onClick={() => navigate('/home')} className="btn btn-ghost">
            <ArrowLeft size={18} className="mr-2" />
            返回首页
          </button>
          <h1 className="text-2xl font-bold ml-4">
            <Users size={20} className="mr-2 text-primary" />
            好友管理
          </h1>
        </div>
        <div className="flex-none gap-2">
          <div className="form-control flex flex-row gap-2">
            <input
              type="text"
              placeholder="搜索用户..."
              className="input input-bordered w-64"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} className="btn btn-primary">
              <Search size={18} className="mr-2" />
              搜索
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6">
        {/* Error Alert */}
        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
            <button onClick={clearError} className="btn btn-sm btn-ghost">
              <X size={18} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs tabs-boxed mb-6 bg-base-100 p-2 shadow-md">
          <button
            className={`tab tab-lg ${activeTab === 'friends' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('friends')}
          >
            好友列表 ({friends.length})
          </button>
          <button
            className={`tab tab-lg ${activeTab === 'requests' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            好友请求 ({friendRequests.filter(r => r.status === 'pending').length})
          </button>
          <button
            className={`tab tab-lg ${activeTab === 'blocked' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('blocked')}
          >
            屏蔽列表 ({blockedUsers.length})
          </button>
          <button
            className={`tab tab-lg ${activeTab === 'search' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            搜索结果 ({searchResults.length})
          </button>
        </div>

        {/* Content */}
        <div className="bg-base-100 rounded-lg shadow-xl p-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : (
            <>
              {/* Friends Tab */}
              {activeTab === 'friends' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {friends.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500">
                      还没有好友，快去添加吧！
                    </div>
                  ) : (
                    friends.map((friend) => (
                      <div key={friend.user_id} className="card bg-base-200 shadow-md hover:shadow-xl transition-all">
                        <div className="card-body">
                          <div className="flex items-center gap-4">
                            <div className="avatar placeholder">
                              <div className="bg-primary text-primary-content rounded-full w-16">
                                {friend.avatar ? (
                                  <img src={friend.avatar} alt={friend.nickname} />
                                ) : (
                                  <span className="text-2xl">{friend.nickname.charAt(0)}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="card-title text-lg">{friend.nickname}</h3>
                              <p className="text-sm text-gray-500">ID: {friend.user_id}</p>
                              {friend.status && (
                                <div className="badge badge-sm mt-1">
                                  {friend.status === 'online' && '在线'}
                                  {friend.status === 'offline' && '离线'}
                                  {friend.status === 'busy' && '忙碌'}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="card-actions justify-end mt-4">
                            <button
                              onClick={() => handleBlockUser(friend.user_id, friend.nickname)}
                              className="btn btn-sm btn-warning"
                            >
                              <Ban size={16} className="mr-1" />
                              屏蔽
                            </button>
                            <button
                              onClick={() => handleDeleteFriend(friend.user_id, friend.nickname)}
                              className="btn btn-sm btn-error"
                            >
                              <UserMinus size={16} className="mr-1" />
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Requests Tab */}
              {activeTab === 'requests' && (
                <div className="space-y-4">
                  {friendRequests.filter(r => r.status === 'pending').length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      暂无好友请求
                    </div>
                  ) : (
                    friendRequests
                      .filter(r => r.status === 'pending')
                      .map((request) => (
                        <div key={request.request_id} className="card bg-base-200 shadow-md">
                          <div className="card-body">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-bold">来自: {request.from_user_id}</h3>
                                {request.message && (
                                  <p className="text-sm text-gray-600 mt-1">{request.message}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(request.created_at).toLocaleString('zh-CN')}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleAcceptRequest(request.request_id)}
                                  className="btn btn-success btn-sm"
                                >
                                  <Check size={16} className="mr-1" />
                                  接受
                                </button>
                                <button
                                  onClick={() => handleRejectRequest(request.request_id)}
                                  className="btn btn-error btn-sm"
                                >
                                  <X size={16} className="mr-1" />
                                  拒绝
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}

              {/* Blocked Tab */}
              {activeTab === 'blocked' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {blockedUsers.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500">
                      暂无屏蔽用户
                    </div>
                  ) : (
                    blockedUsers.map((user) => (
                      <div key={user.user_id} className="card bg-base-200 shadow-md">
                        <div className="card-body">
                          <div className="flex items-center gap-4">
                            <div className="avatar placeholder">
                              <div className="bg-neutral text-neutral-content rounded-full w-16">
                                {user.avatar ? (
                                  <img src={user.avatar} alt={user.nickname} />
                                ) : (
                                  <span className="text-2xl">{user.nickname.charAt(0)}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="card-title text-lg">{user.nickname}</h3>
                              <p className="text-sm text-gray-500">ID: {user.user_id}</p>
                            </div>
                          </div>
                          <div className="card-actions justify-end mt-4">
                            <button
                              onClick={() => handleUnblockUser(user.user_id, user.nickname)}
                              className="btn btn-sm btn-success"
                            >
                              <FontAwesomeIcon icon={faCheck} className="mr-1" />
                              取消屏蔽
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Search Results Tab */}
              {activeTab === 'search' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResults.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-gray-500">
                      {searchQuery ? '没有找到相关用户' : '请输入关键词进行搜索'}
                    </div>
                  ) : (
                    searchResults.map((user) => (
                      <div key={user.user_id} className="card bg-base-200 shadow-md hover:shadow-xl transition-all">
                        <div className="card-body">
                          <div className="flex items-center gap-4">
                            <div className="avatar placeholder">
                              <div className="bg-accent text-accent-content rounded-full w-16">
                                {user.avatar ? (
                                  <img src={user.avatar} alt={user.nickname} />
                                ) : (
                                  <span className="text-2xl">{user.nickname.charAt(0)}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h3 className="card-title text-lg">{user.nickname}</h3>
                              <p className="text-sm text-gray-500">ID: {user.user_id}</p>
                            </div>
                          </div>
                          <div className="card-actions justify-end mt-4">
                            <button
                              onClick={() => handleSendRequest(user.user_id)}
                              className="btn btn-sm btn-primary"
                            >
                              <UserPlus size={16} className="mr-1" />
                              添加好友
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Send Friend Request Modal */}
      {showMessageModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">发送好友请求</h3>
            <div className="form-control">
              <label className="label">
                <span className="label-text">附加消息（可选）</span>
              </label>
              <textarea
                className="textarea textarea-bordered h-24"
                placeholder="你好，我想加你为好友"
                value={friendMessage}
                onChange={(e) => setFriendMessage(e.target.value)}
              />
            </div>
            <div className="modal-action">
              <button
                onClick={() => {
                  setShowMessageModal(false)
                  setFriendMessage('')
                  setSelectedUserId(null)
                }}
                className="btn"
              >
                取消
              </button>
              <button onClick={handleConfirmSendRequest} className="btn btn-primary">
                发送请求
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

