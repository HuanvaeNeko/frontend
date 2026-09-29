import { useEffect, useCallback, useRef } from 'react'
import { messagePreviewText } from '@/features/chat/lib/messagePreview'
import { useWSStore, type WSNewMessage, type WSMessageRecalled, type WSSystemNotification } from '@/store/wsStore'
import { useChatStore, type UnreadSummary } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '@/features/auth/store/authStore'
import { notifyMessage } from '@/hooks/useNotification'
import { playMessage } from '@/hooks/useSound'
import { translate } from '@/i18n/translate'
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
/**
 * 标记会话已读：先发 WS `mark_read`（后端真值），再清本地未读摘要——只清本地的话，
 * 下一次 `unread_summary` 推送或刷新会把角标打回来。不依赖任何 hook 状态，
 * 列表右键「标记已读」和聊天窗口打开会话都走这里。
 */
export function markConversationRead(targetType: 'friend' | 'group', targetId: string) {
  useWSStore.getState().sendMarkRead(targetType, targetId)
  useChatStore.getState().markRead(targetType, targetId)
}

/** 设置当前活跃会话（打开即已读；null 表示没有打开任何会话） */
export function setActiveChat(type: 'friend' | 'group' | null, id: string | null) {
  if (type && id) {
    useChatStore.getState().setActiveChat({ type, id })
    markConversationRead(type, id)
  } else {
    useChatStore.getState().setActiveChat(null)
  }
}

/**
 * 整个 /app/* 只能挂**一次**（由壳层的 `RealtimeBridge` 挂）：它注册全部 WS 处理器，
 * 挂两次就是双重注册；而只挂在聊天窗口里（历史做法）又意味着停在会话列表/联系人/
 * 设置页时，连接时的 `unread_summary` 与之后的新消息全部无人处理、被静默丢弃。
 *
 * 订阅一律用 selector：整店订阅会让挂载点在每次心跳（`lastPingTime`）和每条消息时重渲染。
 */
export function useRealtimeMessages() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const connect = useWSStore((s) => s.connect)
  const connected = useWSStore((s) => s.connected)
  const registerHandler = useWSStore((s) => s.registerHandler)
  const conversationCount = useChatStore((s) => s.conversations.length)
  const loadPendingRequests = useFriendsStore((s) => s.loadPendingRequests)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const loadMyGroups = useGroupStore((s) => s.loadMyGroups)

  // 标记是否已执行过初始同步
  const hasSyncedRef = useRef(false)

  // 自动连接
  useEffect(() => {
    if (isAuthenticated) {
      connect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])
  
  // 连接成功后自动同步消息
  useEffect(() => {
    if (connected && conversationCount > 0 && !hasSyncedRef.current) {
      hasSyncedRef.current = true
      console.log('🔄 应用启动，开始同步消息...')
      useChatStore.getState().syncMessages().catch(error => {
        console.error('消息同步失败:', error)
      })
    }
  }, [connected, conversationCount])

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
    const previewText = messagePreviewText(data.message_type, data.content)

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
      // 群消息气泡按 sender_nickname / sender_avatar_url 显示名字与头像（MessageItem 把群消息当
      // GroupMessage 读）；只按私聊形状落库的话，实时插入的那一行没有名字、头像是「U」，刷新才正常
      store.addMessage(data.source_type === 'group'
        ? { ...message, sender_nickname: data.sender_nickname, sender_avatar_url: data.sender_avatar_url } as Message
        : message)
    }

    // 发送通知（非自己发送、非活跃聊天）
    if (data.sender_id !== currentUser?.user_id && !isActiveChat) {
      const title = data.source_type === 'friend'
        ? data.sender_nickname
        : translate('notify.groupMessageTitle', { name: data.sender_nickname })

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
        ? { ...m, message_content: translate('notify.messageRecalled'), message_type: 'text' as const, is_recalled: true }
        : m
    )
    store.setMessages(updatedMessages)
  }, [])

  // =============================================
  // 卡片改版（bot patch-card）：WS message_updated 带整份新内容与 rev，只接受更大的 rev
  // （backend-docs messages/好友消息.md:790-821）；乱序到达的旧版本不能把卡片改回去
  // =============================================
  const handleMessageUpdated = useCallback((data: { message_uuid: string; content: string; message_type: string; rev: number }) => {
    const store = useChatStore.getState()
    let changed = false
    const next = store.messages.map((m) => {
      if (m.message_uuid !== data.message_uuid || (m.rev ?? 0) >= data.rev) return m
      changed = true
      return { ...m, message_content: data.content, message_type: data.message_type as typeof m.message_type, rev: data.rev }
    })
    if (changed) store.setMessages(next)
  }, [])

  // =============================================
  // 处理系统通知
  // =============================================
  const handleSystemNotification = useCallback((data: Omit<WSSystemNotification, 'type'>) => {
    console.log('🔔 系统通知:', data.notification_type, data.data)
    const notifData = data.data as Record<string, string>
    // 文案在收到通知的这一刻按当前语言取（不是模块加载时），切换语言后立刻生效
    const someone = translate('notify.someone')
    const group = notifData.group_name || ''

    switch (data.notification_type) {
      case 'friend_request':
        loadPendingRequests().catch(console.error)
        notifyMessage(translate('notify.friendRequest.title'), translate('notify.friendRequest.body', { name: notifData.from_nickname || someone }), { native: true })
        break

      case 'friend_request_approved':
        loadFriends().catch(console.error)
        notifyMessage(translate('notify.friendRequestApproved.title'), translate('notify.friendRequestApproved.body', { name: notifData.friend_nickname || someone }), { native: true })
        break

      case 'friend_request_rejected':
        notifyMessage(translate('notify.friendRequestRejected.title'), translate('notify.friendRequestRejected.body', { name: notifData.user_nickname || someone }))
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
        notifyMessage(translate('notify.groupInvite.title'), translate('notify.groupInvite.body', { name: notifData.inviter_nickname || someone, group }), { native: true })
        loadMyGroups().catch(console.error)
        break

      case 'group_join_request':
        notifyMessage(translate('notify.groupJoinRequest.title'), translate('notify.groupJoinRequest.body', { name: notifData.applicant_nickname || notifData.user_nickname || someone, group }))
        break

      case 'group_join_approved':
        loadMyGroups().catch(console.error)
        notifyMessage(translate('notify.groupJoinApproved.title'), translate('notify.groupJoinApproved.body', { group }), { native: true })
        break

      case 'group_removed':
        loadMyGroups().catch(console.error)
        if (notifData.group_id) {
          useChatStore.getState().removeConversation(notifData.group_id)
        }
        notifyMessage(translate('notify.groupRemoved.title'), translate('notify.groupRemoved.body', { group }))
        break

      case 'group_disbanded':
        loadMyGroups().catch(console.error)
        if (notifData.group_id) {
          useChatStore.getState().removeConversation(notifData.group_id)
        }
        notifyMessage(translate('notify.groupDisbanded.title'), translate('notify.groupDisbanded.body', { group }))
        break

      case 'group_notice_updated':
        notifyMessage(translate('notify.groupNoticeUpdated.title'), translate('notify.groupNoticeUpdated.body', { group }))
        break

      case 'owner_transferred':
        loadMyGroups().catch(console.error)
        notifyMessage(translate('notify.ownerTransferred.title'), translate('notify.ownerTransferred.body', { group, name: notifData.new_owner_nickname || someone }))
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
    unsubscribers.push(registerHandler<{ message_uuid: string; content: string; message_type: string; rev: number }>('message_updated', handleMessageUpdated))
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
    handleMessageUpdated,
    handleSystemNotification,
    handleTyping,
  ])

  return { connected }
}

// =============================================
// 辅助函数
// =============================================


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
