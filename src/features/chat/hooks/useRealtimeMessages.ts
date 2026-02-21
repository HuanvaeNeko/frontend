import { useEffect, useCallback, useRef } from 'react'
import { useWSStore, type WSNewMessage, type WSMessageRecalled, type WSSystemNotification } from '@/store/wsStore'
import { useChatStore, type UnreadSummary } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '@/features/auth/store/authStore'
import { notifyMessage } from '@/hooks/useNotification'
import { playMessage } from '@/hooks/useSound'
import type { Message } from '../api/messages'

/**
 * 实时消息 Hook
 * 
 * 功能：
 * - 自动连接 WebSocket
 * - 处理 connected 消息（未读摘要）
 * - 处理 new_message（统一好友/群聊新消息格式）
 * - 处理消息撤回
 * - 处理系统通知（好友请求/群事件等）
 * - 活跃聊天检测（不增加未读/不触发通知）
 * - 浏览器通知 + 音效
 * - 应用启动时自动同步增量消息
 */
export function useRealtimeMessages() {
  const { accessToken } = useAuthStore()
  const { connect, disconnect, connected, registerHandler, sendMarkRead } = useWSStore()
  const chatStore = useChatStore()
  const { loadPendingRequests, loadFriends } = useFriendsStore()
  const { loadMyGroups } = useGroupStore()
  
  // 标记是否已执行过初始同步
  const hasSyncedRef = useRef(false)

  // 自动连接
  useEffect(() => {
    if (accessToken) {
      connect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])
  
  // 连接成功后自动同步消息
  useEffect(() => {
    if (connected && chatStore.conversations.length > 0 && !hasSyncedRef.current) {
      hasSyncedRef.current = true
      console.log('🔄 应用启动，开始同步消息...')
      chatStore.syncMessages().catch(error => {
        console.error('消息同步失败:', error)
      })
    }
  }, [connected, chatStore.conversations.length, chatStore])

  // =============================================
  // 处理 connected 消息（未读摘要）
  // =============================================
  const handleConnected = useCallback((data: { unread_summary: UnreadSummary }) => {
    console.log('📡 WebSocket 已连接，收到未读摘要:', data.unread_summary)
    useChatStore.getState().setUnreadSummary(data.unread_summary)
  }, [])

  // =============================================
  // 处理 new_message（统一格式）
  // =============================================
  const handleNewMessage = useCallback((data: Omit<WSNewMessage, 'type'>) => {
    console.log('📨 收到新消息:', data.source_type, data.source_id)
    const store = useChatStore.getState()
    const currentUser = useAuthStore.getState().user

    // 生成消息预览文本
    const previewText = getMessagePreviewText(data.message_type, data.content)

    // 检查是否是活跃聊天
    const isActiveChat = store.activeChat &&
      store.activeChat.type === data.source_type &&
      store.activeChat.id === data.source_id

    // 更新未读计数（非活跃聊天才增加）
    if (data.source_type === 'friend') {
      store.updateFriendUnread(data.source_id, previewText, data.timestamp, !isActiveChat)
    } else {
      store.updateGroupUnread(data.source_id, previewText, data.timestamp, !isActiveChat)
    }

    // 转换为 Message 格式并添加到当前会话
    const selected = store.selectedConversation
    const shouldAddToChat = selected &&
      selected.type === data.source_type &&
      selected.id === data.source_id

    if (shouldAddToChat) {
      const msgType = data.message_type === 'system' ? 'text' : data.message_type
      const message: Message = {
        message_uuid: data.message_uuid,
        sender_id: data.sender_id,
        receiver_id: data.source_id,
        message_content: data.content,
        message_type: msgType as Message['message_type'],
        file_uuid: data.file_uuid ?? null,
        file_url: data.file_url ?? null,
        file_size: data.file_size ?? null,
        file_hash: data.file_hash ?? null,
        filename: null,
        content_type: null,
        image_width: data.image_width ?? null,
        image_height: data.image_height ?? null,
        seq: data.seq,
        send_time: data.timestamp,
      }
      store.addMessage(message)
    }

    // 发送通知（非自己发送、非活跃聊天）
    if (data.sender_id !== currentUser?.user_id && !isActiveChat) {
      const title = data.source_type === 'friend'
        ? data.sender_nickname
        : `群聊 · ${data.sender_nickname}`

      notifyMessage(title, previewText, { native: true })
      playMessage()
    }
  }, [])

  // =============================================
  // 处理消息撤回
  // =============================================
  const handleMessageRecalled = useCallback((data: Omit<WSMessageRecalled, 'type'>) => {
    console.log('🔙 消息已撤回:', data)
    const store = useChatStore.getState()
    // 标记为已撤回而不是删除
    const updatedMessages = store.messages.map(m =>
      m.message_uuid === data.message_uuid
        ? { ...m, message_content: '此消息已被撤回', message_type: 'text' as const, is_recalled: true }
        : m
    )
    store.setMessages(updatedMessages)
  }, [])

  // =============================================
  // 处理系统通知
  // =============================================
  const handleSystemNotification = useCallback((data: Omit<WSSystemNotification, 'type'>) => {
    console.log('🔔 系统通知:', data.notification_type, data.data)
    const notifData = data.data as Record<string, string>

    switch (data.notification_type) {
      case 'friend_request':
        loadPendingRequests().catch(console.error)
        notifyMessage('好友请求', `${notifData.from_nickname || '某人'} 请求添加你为好友`, { native: true })
        break

      case 'friend_request_approved':
        loadFriends().catch(console.error)
        notifyMessage('好友请求已通过', `${notifData.friend_nickname || '某人'} 已通过你的好友请求`, { native: true })
        break

      case 'friend_request_rejected':
        notifyMessage('好友请求被拒绝', `${notifData.user_nickname || '某人'} 拒绝了你的好友请求`)
        break

      case 'friend_deleted': {
        loadFriends().catch(console.error)
        // 从会话列表移除
        const deletedFriendId = notifData.friend_id
        if (deletedFriendId) {
          useChatStore.getState().removeConversation(deletedFriendId)
        }
        break
      }

      case 'group_invite':
        notifyMessage('群邀请', `${notifData.inviter_nickname || '某人'} 邀请你加入群聊 ${notifData.group_name || ''}`, { native: true })
        loadMyGroups().catch(console.error)
        break

      case 'group_join_request':
        notifyMessage('入群申请', `${notifData.applicant_nickname || notifData.user_nickname || '某人'} 申请加入群聊 ${notifData.group_name || ''}`)
        break

      case 'group_join_approved':
        loadMyGroups().catch(console.error)
        notifyMessage('入群申请已通过', `你已加入群聊 ${notifData.group_name || ''}`, { native: true })
        break

      case 'group_removed':
        loadMyGroups().catch(console.error)
        if (notifData.group_id) {
          useChatStore.getState().removeConversation(notifData.group_id)
        }
        notifyMessage('已被移出群聊', `你已被移出群聊 ${notifData.group_name || ''}`)
        break

      case 'group_disbanded':
        loadMyGroups().catch(console.error)
        if (notifData.group_id) {
          useChatStore.getState().removeConversation(notifData.group_id)
        }
        notifyMessage('群聊已解散', `群聊 ${notifData.group_name || ''} 已解散`)
        break

      case 'group_notice_updated':
        notifyMessage('群公告更新', `群聊 ${notifData.group_name || ''} 的公告已更新`)
        break

      case 'owner_transferred':
        loadMyGroups().catch(console.error)
        notifyMessage('群主已转让', `群聊 ${notifData.group_name || ''} 的群主已转让给 ${notifData.new_owner_nickname || '某人'}`)
        break

      case 'admin_set':
      case 'admin_removed':
        loadMyGroups().catch(console.error)
        break

      case 'member_muted':
      case 'member_unmuted':
        // 如果是当前用户被禁言/解禁，可以更新 UI
        break

      default:
        console.log('未处理的系统通知类型:', data.notification_type)
    }
  }, [loadPendingRequests, loadFriends, loadMyGroups])

  // =============================================
  // 处理正在输入状态
  // =============================================
  const handleTyping = useCallback((data: {
    user_id: string
    conversation_type: 'private' | 'group'
    conversation_id: string
    is_typing: boolean
  }) => {
    useChatStore.getState().setTypingStatus({
      conversationId: data.conversation_id,
      conversationType: data.conversation_type,
      userId: data.user_id,
      isTyping: data.is_typing,
      timestamp: Date.now(),
    })
  }, [])

  // =============================================
  // 注册消息处理器
  // =============================================
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    // 新格式：connected + new_message + system_notification
    unsubscribers.push(registerHandler<{ unread_summary: UnreadSummary }>('connected', handleConnected))
    unsubscribers.push(registerHandler<Omit<WSNewMessage, 'type'>>('new_message', handleNewMessage))
    unsubscribers.push(registerHandler<Omit<WSMessageRecalled, 'type'>>('message_recalled', handleMessageRecalled))
    unsubscribers.push(registerHandler<Omit<WSSystemNotification, 'type'>>('system_notification', handleSystemNotification))
    unsubscribers.push(registerHandler<{
      user_id: string
      conversation_type: 'private' | 'group'
      conversation_id: string
      is_typing: boolean
    }>('typing', handleTyping))

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [
    registerHandler,
    handleConnected,
    handleNewMessage,
    handleMessageRecalled,
    handleSystemNotification,
    handleTyping,
  ])

  // =============================================
  // Mark Read 功能
  // =============================================
  const markRead = useCallback((targetType: 'friend' | 'group', targetId: string) => {
    // 发送 WebSocket 消息
    sendMarkRead(targetType, targetId)
    // 本地清零
    useChatStore.getState().markRead(targetType, targetId)
  }, [sendMarkRead])

  // 设置活跃聊天
  const setActiveChat = useCallback((type: 'friend' | 'group' | null, id: string | null) => {
    if (type && id) {
      useChatStore.getState().setActiveChat({ type, id })
      // 设置活跃聊天时自动 markRead
      markRead(type, id)
    } else {
      useChatStore.getState().setActiveChat(null)
    }
  }, [markRead])

  return { connected, disconnect, markRead, setActiveChat }
}

// =============================================
// 辅助函数
// =============================================

function getMessagePreviewText(messageType: string, content: string): string {
  switch (messageType) {
    case 'text': return content.length > 50 ? content.slice(0, 50) + '...' : content
    case 'image': return '[图片]'
    case 'video': return '[视频]'
    case 'file': return '[文件]'
    default: return content
  }
}

/**
 * 发送正在输入状态
 */
export function useSendTyping() {
  const { sendTyping, connected } = useWSStore()

  return useCallback((conversationType: 'private' | 'group', conversationId: string, isTyping: boolean) => {
    if (connected) {
      sendTyping(conversationType, conversationId, isTyping)
    }
  }, [connected, sendTyping])
}

/**
 * 监听正在输入状态
 */
export function useTypingIndicator(conversationType: 'private' | 'group', conversationId: string) {
  const { registerHandler } = useWSStore()

  useEffect(() => {
    const unsub = registerHandler<{
      user_id: string
      conversation_type: 'private' | 'group'
      conversation_id: string
      is_typing: boolean
    }>('typing', (data) => {
      if (data.conversation_type === conversationType && data.conversation_id === conversationId) {
        useChatStore.getState().setTypingStatus({
          conversationId: data.conversation_id,
          conversationType: data.conversation_type,
          userId: data.user_id,
          isTyping: data.is_typing,
          timestamp: Date.now(),
        })
      }
    })

    return unsub
  }, [registerHandler, conversationType, conversationId])
}
