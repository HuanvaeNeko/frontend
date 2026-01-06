'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Send,
  Users,
  Settings,
  MoreVertical,
  Paperclip,
  Image as ImageIcon,
  Video,
  FileText,
  Download,
  Loader2,
  Trash2,
  RotateCcw,
  X,
  Bell,
  UserPlus,
  LogOut,
  Crown,
  Shield,
  MessageCircle
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import { groupMessagesApi, type GroupMessage } from '../api/groupMessages'
import { groupsApi, type GroupMember, type GroupNotice } from '../api/groups'
import { storageApi, type FileType } from '../api/storage'
import { useToast } from '../hooks/use-toast'

export default function GroupChat() {
  const router = useRouter()
  const { groupId } = useParams<{ groupId?: string }>()
  const { toast } = useToast()
  const { myGroups, loadMyGroups } = useGroupStore()
  const { user } = useAuthStore()

  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [notices, setNotices] = useState<GroupNotice[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<'members' | 'notices' | 'settings'>('members')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentGroup = groupId ? myGroups.find(g => g.group_id === groupId) : null
  const myMember = members.find(m => m.user_id === user?.user_id)
  const isAdmin = myMember?.role === 'owner' || myMember?.role === 'admin'

  useEffect(() => {
    loadMyGroups().catch(console.error)
  }, [loadMyGroups])

  useEffect(() => {
    if (groupId && currentGroup) {
      loadMessages()
      loadMembers()
      loadNotices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, currentGroup])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const loadMessages = async () => {
    if (!groupId || loading) return
    setLoading(true)
    try {
      const response = await groupMessagesApi.getMessages(groupId, undefined, 50)
      setMessages(response.messages)
      setHasMore(response.has_more)
    } catch (error) {
      console.error('加载消息失败:', error)
      toast({ title: '错误', description: '加载消息失败', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const loadMoreMessages = async () => {
    if (!groupId || loading || !hasMore || messages.length === 0) return
    setLoading(true)
    try {
      const oldestTime = messages[0].send_time
      const response = await groupMessagesApi.getMessages(groupId, oldestTime, 50)
      setMessages(prev => [...response.messages, ...prev])
      setHasMore(response.has_more)
    } catch (error) {
      console.error('加载更多消息失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    if (!groupId) return
    setLoadingMembers(true)
    try {
      const response = await groupsApi.getMembers(groupId)
      setMembers(response.members)
    } catch (error) {
      console.error('加载成员失败:', error)
    } finally {
      setLoadingMembers(false)
    }
  }

  const loadNotices = async () => {
    if (!groupId) return
    try {
      const response = await groupsApi.getNotices(groupId)
      setNotices(response)
    } catch (error) {
      console.error('加载公告失败:', error)
    }
  }

  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (container && container.scrollTop === 0 && hasMore && !loading) {
      loadMoreMessages()
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const sendMessage = async () => {
    if (!groupId || !inputMessage.trim() || sending) return
    const content = inputMessage.trim()
    setInputMessage('')
    setSending(true)

    try {
      const response = await groupMessagesApi.sendMessage({
        group_id: groupId,
        message_content: content,
        message_type: 'text',
      })

      const message: GroupMessage = {
        message_uuid: response.message_uuid,
        group_id: groupId,
        sender_id: user?.user_id || '',
        sender_nickname: user?.nickname || '',
        sender_avatar_url: '',
        message_content: content,
        message_type: 'text',
        file_uuid: null,
        file_url: null,
        file_size: null,
        file_hash: null,
        image_width: null,
        image_height: null,
        seq: response.seq,
        reply_to: null,
        send_time: response.send_time,
        is_recalled: false,
      }
      setMessages(prev => [...prev, message])
    } catch (error) {
      console.error('发送消息失败:', error)
      toast({
        title: '发送失败',
        description: error instanceof Error ? error.message : '发送消息失败',
        variant: 'destructive',
      })
      setInputMessage(content)
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (selectedFile) {
        handleSendFile()
      } else {
        sendMessage()
      }
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 100 * 1024 * 1024 * 1024) {
        toast({ title: '文件太大', description: '文件大小不能超过 100GB', variant: 'destructive' })
        return
      }
      setSelectedFile(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCancelFile = () => {
    setSelectedFile(null)
    setUploadProgress(null)
  }

  const getFileType = (file: File): { type: FileType; messageType: 'image' | 'video' | 'file' } => {
    const mimeType = file.type
    if (mimeType.startsWith('image/')) return { type: 'group_image', messageType: 'image' }
    if (mimeType.startsWith('video/')) return { type: 'group_video', messageType: 'video' }
    return { type: 'group_document', messageType: 'file' }
  }

  const handleSendFile = async () => {
    if (!groupId || !selectedFile || sending) return
    const file = selectedFile
    setSelectedFile(null)
    setSending(true)
    setUploadProgress(0)

    try {
      const { type, messageType } = getFileType(file)
      const uploadResult = await storageApi.uploadFile(file, type, 'group_files', groupId, (progress) => {
        setUploadProgress(progress.percent)
      })

      if (uploadResult.isInstant && uploadResult.messageUuid) {
        await loadMessages()
        toast({ title: '发送成功', description: '文件秒传成功' })
      } else {
        const response = await groupMessagesApi.sendMessage({
          group_id: groupId,
          message_content: file.name,
          message_type: messageType,
          file_url: uploadResult.fileUrl,
          file_size: file.size,
        })

        const message: GroupMessage = {
          message_uuid: response.message_uuid,
          group_id: groupId,
          sender_id: user?.user_id || '',
          sender_nickname: user?.nickname || '',
          sender_avatar_url: '',
          message_content: file.name,
          message_type: messageType,
          file_uuid: null,
          file_url: uploadResult.fileUrl,
          file_size: file.size,
          file_hash: null,
          image_width: null,
          image_height: null,
          seq: response.seq,
          reply_to: null,
          send_time: response.send_time,
          is_recalled: false,
        }
        setMessages(prev => [...prev, message])
        toast({ title: '发送成功', description: '文件发送成功' })
      }
    } catch (error) {
      console.error('发送文件失败:', error)
      toast({
        title: '发送失败',
        description: error instanceof Error ? error.message : '文件发送失败',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
      setUploadProgress(null)
    }
  }

  const handleDeleteMessage = async (messageUuid: string) => {
    try {
      await groupMessagesApi.deleteMessage(messageUuid)
      setMessages(prev => prev.filter(m => m.message_uuid !== messageUuid))
      toast({ title: '成功', description: '消息已删除' })
    } catch (error) {
      toast({
        title: '删除失败',
        description: error instanceof Error ? error.message : '删除消息失败',
        variant: 'destructive',
      })
    }
  }

  const handleRecallMessage = async (messageUuid: string) => {
    try {
      await groupMessagesApi.recallMessage(messageUuid)
      setMessages(prev => prev.filter(m => m.message_uuid !== messageUuid))
      toast({ title: '成功', description: '消息已撤回' })
    } catch (error) {
      toast({
        title: '撤回失败',
        description: error instanceof Error ? error.message : '撤回消息失败',
        variant: 'destructive',
      })
    }
  }

  const canRecallMessage = (sendTime: string, senderId: string) => {
    const messageTime = new Date(sendTime).getTime()
    const now = Date.now()
    const isWithinTime = (now - messageTime) <= 2 * 60 * 1000
    const isOwnMessage = senderId === user?.user_id
    return (isOwnMessage && isWithinTime) || isAdmin
  }

  const handleLeaveGroup = async () => {
    if (!groupId) return
    if (!confirm('确定要退出该群聊吗？')) return
    try {
      await groupsApi.leaveGroup(groupId)
      toast({ title: '成功', description: '已退出群聊' })
      router.push('/chat')
    } catch (error) {
      toast({
        title: '退出失败',
        description: error instanceof Error ? error.message : '退出群聊失败',
        variant: 'destructive',
      })
    }
  }

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
  }

  const getAvatarGradient = (name: string) => {
    const gradients = [
      'from-rose-400 to-pink-500', 'from-orange-400 to-amber-500', 'from-emerald-400 to-teal-500',
      'from-cyan-400 to-sky-500', 'from-blue-400 to-indigo-500', 'from-violet-400 to-purple-500',
      'from-fuchsia-400 to-pink-500', 'from-lime-400 to-green-500'
    ]
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length
    return gradients[index]
  }

  const getRoleIcon = (role: string) => {
    if (role === 'owner') return <Crown className="h-3.5 w-3.5 text-yellow-500" />
    if (role === 'admin') return <Shield className="h-3.5 w-3.5 text-blue-500" />
    return null
  }

  const getRoleName = (role: string) => {
    if (role === 'owner') return '群主'
    if (role === 'admin') return '管理员'
    return '成员'
  }

  const renderMessageContent = (message: GroupMessage) => {
    if (message.is_recalled) {
      return <p className="text-sm italic opacity-60">[消息已撤回]</p>
    }

    switch (message.message_type) {
      case 'text':
        return <p className="whitespace-pre-wrap break-words">{message.message_content}</p>
      case 'image':
        return message.file_url ? (
          <img
            src={message.file_url}
            alt="图片"
            className="max-w-xs rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(message.file_url!, '_blank')}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm opacity-70">
            <ImageIcon className="h-4 w-4" />
            <span>[图片]</span>
          </div>
        )
      case 'video':
        return message.file_url ? (
          <video src={message.file_url} controls className="max-w-xs rounded-xl" />
        ) : (
          <div className="flex items-center gap-2 text-sm opacity-70">
            <Video className="h-4 w-4" />
            <span>[视频]</span>
          </div>
        )
      case 'file':
        return (
          <div className="flex items-center gap-3 p-3 bg-white/30 backdrop-blur rounded-xl">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.message_content || '文件'}</p>
              {message.file_size && (
                <p className="text-xs opacity-60">{formatFileSize(message.file_size)}</p>
              )}
            </div>
            {message.file_url && (
              <button
                className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                onClick={() => window.open(message.file_url!, '_blank')}
              >
                <Download className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      case 'system':
        return <p className="text-sm text-center opacity-70">{message.message_content}</p>
      default:
        return <p className="text-sm">[不支持的消息类型]</p>
    }
  }

  // 空状态渲染
  if (!groupId || (!currentGroup && !loading)) {
    return (
      <div className="gc-page">
        <div className="gc-bg-orb orb-1" />
        <div className="gc-bg-orb orb-2" />
        <div className="gc-bg-orb orb-3" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="gc-empty"
        >
          <div className="gc-empty-icon">
            <Users size={32} />
          </div>
          <h2>{groupId ? '群聊不存在' : '请选择一个群聊'}</h2>
          <p>{groupId ? '该群聊可能已被解散或您已退出' : '从侧边栏选择一个群聊开始对话'}</p>
          <button className="gc-back-btn" onClick={() => router.push('/chat')}>
            <ArrowLeft size={16} />
            返回聊天
          </button>
        </motion.div>
        <style>{styles}</style>
      </div>
    )
  }

  return (
    <div className="gc-page">
      <div className="gc-bg-orb orb-1" />
      <div className="gc-bg-orb orb-2" />
      <div className="gc-bg-orb orb-3" />

      {/* 顶部导航 */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="gc-header"
      >
        <div className="gc-header-left">
          <button className="gc-icon-btn" onClick={() => router.push('/chat')}>
            <ArrowLeft size={20} />
          </button>
          <Avatar className="h-10 w-10 ring-2 ring-white/50">
            <AvatarImage src={currentGroup?.group_avatar_url} />
            <AvatarFallback className={`bg-gradient-to-br ${getAvatarGradient(currentGroup?.group_name || 'G')} text-white`}>
              {currentGroup?.group_name?.[0]?.toUpperCase() || 'G'}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="gc-header-title">{currentGroup?.group_name || '群聊'}</h1>
            <p className="gc-header-subtitle">{members.length} 位成员</p>
          </div>
        </div>

        <div className="gc-header-actions">
          <button className="gc-icon-btn" onClick={() => setShowSidebar(!showSidebar)}>
            <Users size={20} />
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="gc-icon-btn">
                <MoreVertical size={20} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="gc-dropdown" sideOffset={8}>
                <DropdownMenu.Item className="gc-dropdown-item" onSelect={() => { setShowSidebar(true); setSidebarTab('settings') }}>
                  <Settings size={16} />群设置
                </DropdownMenu.Item>
                <DropdownMenu.Item className="gc-dropdown-item" onSelect={() => { setShowSidebar(true); setSidebarTab('notices') }}>
                  <Bell size={16} />群公告
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="gc-dropdown-sep" />
                <DropdownMenu.Item className="gc-dropdown-item danger" onSelect={handleLeaveGroup}>
                  <LogOut size={16} />退出群聊
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </motion.header>

      <div className="gc-main">
        {/* 消息区域 */}
        <div className="gc-chat">
          <div ref={messagesContainerRef} className="gc-messages" onScroll={handleScroll}>
            {loading && messages.length === 0 ? (
              <div className="gc-loading">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="gc-no-messages">
                <MessageCircle size={32} className="opacity-40" />
                <p>暂无消息，开始聊天吧！</p>
              </div>
            ) : (
              <>
                {hasMore && (
                  <div className="gc-load-more">
                    <button onClick={loadMoreMessages} disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      加载更多
                    </button>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((message) => {
                    const isOwn = message.sender_id === user?.user_id
                    const gradient = getAvatarGradient(message.sender_nickname)
                    const canRecall = canRecallMessage(message.send_time, message.sender_id)

                    if (message.message_type === 'system') {
                      return (
                        <motion.div
                          key={message.message_uuid}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="gc-system-msg"
                        >
                          {message.message_content}
                        </motion.div>
                      )
                    }

                    return (
                      <motion.div
                        key={message.message_uuid}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`gc-msg ${isOwn ? 'own' : ''}`}
                      >
                        <Avatar className="gc-msg-avatar">
                          <AvatarImage src={message.sender_avatar_url} />
                          <AvatarFallback className={`bg-gradient-to-br ${gradient} text-white text-sm`}>
                            {message.sender_nickname[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="gc-msg-content">
                          {!isOwn && <span className="gc-msg-name">{message.sender_nickname}</span>}
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <div className={`gc-msg-bubble ${isOwn ? 'own' : ''}`}>
                                {renderMessageContent(message)}
                              </div>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content className="gc-dropdown" sideOffset={5}>
                                {canRecall && !message.is_recalled && (
                                  <DropdownMenu.Item className="gc-dropdown-item" onSelect={() => handleRecallMessage(message.message_uuid)}>
                                    <RotateCcw size={14} />撤回
                                  </DropdownMenu.Item>
                                )}
                                <DropdownMenu.Item className="gc-dropdown-item danger" onSelect={() => handleDeleteMessage(message.message_uuid)}>
                                  <Trash2 size={14} />删除
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                          <span className="gc-msg-time">{formatTime(message.send_time)}</span>
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入区域 */}
          <div className="gc-input-area">
            {selectedFile && (
              <div className="gc-file-preview">
                {selectedFile.type.startsWith('image/') ? <ImageIcon size={24} className="text-blue-500" /> :
                 selectedFile.type.startsWith('video/') ? <Video size={24} className="text-purple-500" /> :
                 <FileText size={24} className="text-gray-500" />}
                <div className="gc-file-info">
                  <p className="gc-file-name">{selectedFile.name}</p>
                  <p className="gc-file-size">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button className="gc-file-cancel" onClick={handleCancelFile} disabled={sending}>
                  <X size={16} />
                </button>
              </div>
            )}

            {uploadProgress !== null && (
              <div className="gc-upload-progress">
                <div className="gc-progress-bar" style={{ width: `${uploadProgress}%` }} />
                <span>{uploadProgress.toFixed(0)}%</span>
              </div>
            )}

            <div className="gc-input-row">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
              <button className="gc-icon-btn" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                <Paperclip size={20} />
              </button>
              <input
                type="text"
                className="gc-input"
                placeholder="输入消息..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={sending}
              />
              <button
                className="gc-send-btn"
                onClick={selectedFile ? handleSendFile : sendMessage}
                disabled={(!inputMessage.trim() && !selectedFile) || sending}
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* 右侧边栏 */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="gc-sidebar"
            >
              <div className="gc-sidebar-tabs">
                {(['members', 'notices', 'settings'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`gc-sidebar-tab ${sidebarTab === tab ? 'active' : ''}`}
                    onClick={() => setSidebarTab(tab)}
                  >
                    {tab === 'members' ? '成员' : tab === 'notices' ? '公告' : '设置'}
                  </button>
                ))}
              </div>

              <div className="gc-sidebar-content">
                {sidebarTab === 'members' && (
                  <div className="gc-members">
                    {isAdmin && (
                      <button className="gc-invite-btn">
                        <UserPlus size={16} />邀请成员
                      </button>
                    )}
                    {loadingMembers ? (
                      <div className="gc-loading"><Loader2 className="animate-spin" /></div>
                    ) : (
                      members.map((member) => (
                        <div key={member.user_id} className="gc-member">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.user_avatar_url} />
                            <AvatarFallback className={`bg-gradient-to-br ${getAvatarGradient(member.user_nickname)} text-white text-sm`}>
                              {member.user_nickname[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="gc-member-info">
                            <div className="gc-member-name">
                              {member.group_nickname || member.user_nickname}
                              {getRoleIcon(member.role)}
                            </div>
                            <span className="gc-member-role">{getRoleName(member.role)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {sidebarTab === 'notices' && (
                  <div className="gc-notices">
                    {notices.length === 0 ? (
                      <p className="gc-empty-text">暂无公告</p>
                    ) : (
                      notices.map((notice) => (
                        <div key={notice.id} className={`gc-notice ${notice.is_pinned ? 'pinned' : ''}`}>
                          {notice.is_pinned && <span className="gc-notice-pin">📌 置顶</span>}
                          <h4>{notice.title}</h4>
                          <p>{notice.content}</p>
                          <div className="gc-notice-meta">
                            <span>{notice.publisher_nickname}</span>
                            <span>·</span>
                            <span>{new Date(notice.published_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {sidebarTab === 'settings' && (
                  <div className="gc-settings">
                    <div className="gc-setting-section">
                      <h4>群信息</h4>
                      <div className="gc-setting-row">
                        <span>群名称</span>
                        <span>{currentGroup?.group_name}</span>
                      </div>
                      <div className="gc-setting-row">
                        <span>群ID</span>
                        <span className="gc-mono">{currentGroup?.group_id?.slice(0, 8)}...</span>
                      </div>
                      <div className="gc-setting-row">
                        <span>我的角色</span>
                        <span>{getRoleName(myMember?.role || 'member')}</span>
                      </div>
                    </div>
                    <button className="gc-leave-btn" onClick={handleLeaveGroup}>
                      <LogOut size={16} />退出群聊
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <style>{styles}</style>
    </div>
  )
}

const styles = `
  .gc-page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 25%, #ffffff 50%, #f5f3ff 75%, #ede9fe 100%);
  }

  .gc-bg-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(100px);
    opacity: 0.4;
    pointer-events: none;
    z-index: 0;
  }
  .gc-bg-orb.orb-1 { width: 400px; height: 400px; background: linear-gradient(135deg, #93c5fd, #60a5fa); top: -100px; right: -50px; }
  .gc-bg-orb.orb-2 { width: 300px; height: 300px; background: linear-gradient(135deg, #c4b5fd, #a78bfa); bottom: -50px; left: 10%; }
  .gc-bg-orb.orb-3 { width: 200px; height: 200px; background: linear-gradient(135deg, #a5b4fc, #818cf8); top: 50%; left: -50px; }

  .gc-header {
    position: relative;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(147, 197, 253, 0.2);
  }
  .gc-header-left { display: flex; align-items: center; gap: 12px; }
  .gc-header-title { font-size: 16px; font-weight: 600; color: #1e3a5f; }
  .gc-header-subtitle { font-size: 12px; color: #64748b; }
  .gc-header-actions { display: flex; gap: 8px; }

  .gc-icon-btn {
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 12px;
    background: rgba(255,255,255,0.5);
    border: 1px solid rgba(147, 197, 253, 0.2);
    color: #475569;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .gc-icon-btn:hover { background: rgba(255,255,255,0.9); border-color: #3b82f6; color: #3b82f6; }

  .gc-dropdown {
    min-width: 150px;
    background: rgba(255,255,255,0.95);
    backdrop-filter: blur(20px);
    border-radius: 14px;
    border: 1px solid rgba(147, 197, 253, 0.3);
    box-shadow: 0 10px 40px rgba(59, 130, 246, 0.15);
    padding: 6px;
    z-index: 100;
  }
  .gc-dropdown-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px; font-size: 14px; color: #475569;
    border-radius: 10px; cursor: pointer; outline: none;
    transition: all 0.15s ease;
  }
  .gc-dropdown-item:hover { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .gc-dropdown-item.danger { color: #dc2626; }
  .gc-dropdown-item.danger:hover { background: rgba(220, 38, 38, 0.1); }
  .gc-dropdown-sep { height: 1px; background: rgba(147, 197, 253, 0.3); margin: 6px 0; }

  .gc-main { flex: 1; display: flex; overflow: hidden; position: relative; z-index: 1; }

  .gc-chat { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  .gc-messages {
    flex: 1; overflow-y: auto; padding: 20px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .gc-loading, .gc-no-messages {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: #64748b; gap: 12px;
  }
  .gc-load-more { text-align: center; }
  .gc-load-more button {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 10px;
    background: rgba(255,255,255,0.6); border: 1px solid rgba(147, 197, 253, 0.3);
    color: #475569; font-size: 13px; cursor: pointer;
    transition: all 0.2s ease;
  }
  .gc-load-more button:hover { background: rgba(255,255,255,0.9); }

  .gc-system-msg {
    text-align: center; font-size: 12px; color: #64748b;
    background: rgba(0,0,0,0.05); padding: 6px 16px;
    border-radius: 20px; align-self: center;
  }

  .gc-msg { display: flex; gap: 10px; max-width: 75%; }
  .gc-msg.own { flex-direction: row-reverse; margin-left: auto; }
  .gc-msg-avatar { width: 36px; height: 36px; flex-shrink: 0; }
  .gc-msg-content { display: flex; flex-direction: column; gap: 4px; }
  .gc-msg.own .gc-msg-content { align-items: flex-end; }
  .gc-msg-name { font-size: 12px; color: #64748b; padding: 0 8px; }
  .gc-msg-bubble {
    padding: 12px 16px; border-radius: 18px;
    background: rgba(255,255,255,0.8); backdrop-filter: blur(10px);
    border: 1px solid rgba(147, 197, 253, 0.2);
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    cursor: pointer; transition: all 0.2s ease;
    font-size: 14px; color: #1e3a5f;
  }
  .gc-msg-bubble:hover { box-shadow: 0 4px 16px rgba(59, 130, 246, 0.1); }
  .gc-msg-bubble.own {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white; border: none;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
  }
  .gc-msg-time { font-size: 11px; color: #94a3b8; padding: 0 8px; }

  .gc-input-area {
    padding: 16px 20px;
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border-top: 1px solid rgba(147, 197, 253, 0.2);
  }
  .gc-file-preview {
    display: flex; align-items: center; gap: 12px;
    padding: 12px; margin-bottom: 12px;
    background: rgba(255,255,255,0.6); border-radius: 14px;
    border: 1px solid rgba(147, 197, 253, 0.2);
  }
  .gc-file-info { flex: 1; min-width: 0; }
  .gc-file-name { font-size: 14px; font-weight: 500; color: #1e3a5f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gc-file-size { font-size: 12px; color: #64748b; }
  .gc-file-cancel { padding: 6px; border-radius: 8px; background: transparent; border: none; cursor: pointer; color: #64748b; }
  .gc-file-cancel:hover { background: rgba(0,0,0,0.05); }

  .gc-upload-progress {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 12px; margin-bottom: 12px;
    background: rgba(59, 130, 246, 0.1); border-radius: 10px;
    font-size: 12px; color: #3b82f6;
  }
  .gc-progress-bar { height: 4px; background: #3b82f6; border-radius: 2px; transition: width 0.2s ease; }

  .gc-input-row { display: flex; align-items: center; gap: 12px; }
  .gc-input {
    flex: 1; padding: 12px 16px;
    border-radius: 14px; border: 1px solid rgba(147, 197, 253, 0.3);
    background: rgba(255,255,255,0.6);
    font-size: 14px; color: #1e3a5f;
    outline: none; transition: all 0.2s ease;
  }
  .gc-input:focus { border-color: #3b82f6; background: rgba(255,255,255,0.9); }
  .gc-input::placeholder { color: #94a3b8; }

  .gc-send-btn {
    width: 44px; height: 44px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 14px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border: none; color: white; cursor: pointer;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    transition: all 0.2s ease;
  }
  .gc-send-btn:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4); transform: translateY(-2px); }
  .gc-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .gc-sidebar {
    width: 300px; flex-shrink: 0;
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(20px);
    border-left: 1px solid rgba(147, 197, 253, 0.2);
    display: flex; flex-direction: column;
  }
  .gc-sidebar-tabs { display: flex; border-bottom: 1px solid rgba(147, 197, 253, 0.2); }
  .gc-sidebar-tab {
    flex: 1; padding: 14px;
    font-size: 13px; font-weight: 500;
    color: #64748b; background: transparent;
    border: none; border-bottom: 2px solid transparent;
    cursor: pointer; transition: all 0.2s ease;
  }
  .gc-sidebar-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
  .gc-sidebar-tab:hover:not(.active) { color: #475569; }
  .gc-sidebar-content { flex: 1; overflow-y: auto; padding: 16px; }

  .gc-members { display: flex; flex-direction: column; gap: 8px; }
  .gc-invite-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px; margin-bottom: 12px;
    border-radius: 12px; border: 1px dashed rgba(59, 130, 246, 0.4);
    background: rgba(59, 130, 246, 0.05);
    color: #3b82f6; font-size: 14px; cursor: pointer;
    transition: all 0.2s ease;
  }
  .gc-invite-btn:hover { background: rgba(59, 130, 246, 0.1); }
  .gc-member {
    display: flex; align-items: center; gap: 12px;
    padding: 10px; border-radius: 12px;
    transition: all 0.2s ease;
  }
  .gc-member:hover { background: rgba(255,255,255,0.6); }
  .gc-member-info { flex: 1; min-width: 0; }
  .gc-member-name { display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: #1e3a5f; }
  .gc-member-role { font-size: 12px; color: #64748b; }

  .gc-notices { display: flex; flex-direction: column; gap: 12px; }
  .gc-notice {
    padding: 14px; border-radius: 14px;
    background: rgba(255,255,255,0.5);
    border: 1px solid rgba(147, 197, 253, 0.2);
  }
  .gc-notice.pinned { border-color: #3b82f6; background: rgba(59, 130, 246, 0.05); }
  .gc-notice-pin { font-size: 12px; color: #3b82f6; font-weight: 500; }
  .gc-notice h4 { font-size: 14px; font-weight: 600; color: #1e3a5f; margin: 6px 0; }
  .gc-notice p { font-size: 13px; color: #475569; line-height: 1.5; }
  .gc-notice-meta { display: flex; gap: 6px; margin-top: 10px; font-size: 12px; color: #94a3b8; }

  .gc-settings { display: flex; flex-direction: column; gap: 20px; }
  .gc-setting-section h4 { font-size: 13px; font-weight: 600; color: #64748b; margin-bottom: 12px; text-transform: uppercase; }
  .gc-setting-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(147, 197, 253, 0.15); font-size: 14px; }
  .gc-setting-row span:first-child { color: #64748b; }
  .gc-setting-row span:last-child { color: #1e3a5f; font-weight: 500; }
  .gc-mono { font-family: monospace; font-size: 12px; }
  .gc-leave-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 14px; margin-top: auto;
    border-radius: 14px; border: none;
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.2s ease;
  }
  .gc-leave-btn:hover { background: rgba(220, 38, 38, 0.2); }

  .gc-empty {
    position: relative; z-index: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 40px;
    flex: 1;
  }
  .gc-empty-icon {
    width: 80px; height: 80px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 24px;
    background: linear-gradient(135deg, rgba(147, 197, 253, 0.3), rgba(96, 165, 250, 0.2));
    color: #3b82f6; margin-bottom: 24px;
  }
  .gc-empty h2 { font-size: 20px; font-weight: 600; color: #1e3a5f; margin-bottom: 8px; }
  .gc-empty p { font-size: 14px; color: #64748b; margin-bottom: 24px; }
  .gc-back-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 24px; border-radius: 14px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border: none; color: white; font-size: 14px; font-weight: 500;
    cursor: pointer; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    transition: all 0.2s ease;
  }
  .gc-back-btn:hover { box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4); transform: translateY(-2px); }

  .gc-empty-text { text-align: center; color: #64748b; padding: 40px 0; }

  @media (max-width: 768px) {
    .gc-sidebar { position: absolute; right: 0; top: 0; bottom: 0; width: 280px; z-index: 20; }
  }
`
