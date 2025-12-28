import { useEffect, useCallback, useRef } from 'react'
import { useWSStore, type WSPrivateMessage, type WSGroupMessage, type WSMessageRecalled } from '../store/wsStore'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { useAuthStore } from '../store/authStore'
import type { Message } from '../api/messages'

/**
 * 实时消息 Hook
 * 
 * 功能：
 * - 自动连接 WebSocket
 * - 处理新私聊消息
 * - 处理新群聊消息
 * - 处理消息撤回
 * - 处理好友请求通知
 * - 处理群邀请通知
 * - 应用启动时自动同步增量消息
 */
export function useRealtimeMessages() {
  const { accessToken } = useAuthStore()
  const { connect, disconnect, connected, registerHandler } = useWSStore()
  const { selectedConversation, addMessage, setMessages, messages, syncMessages, conversations } = useChatStore()
  const { loadPendingRequests } = useFriendsStore()
  const { loadMyGroups } = useGroupStore()
  
  // 标记是否已执行过初始同步
  const hasSyncedRef = useRef(false)

  // 自动连接
  useEffect(() => {
    if (accessToken && !connected) {
      connect()
    }

    return () => {
      // 组件卸载时不断开连接，让应用全局保持连接
    }
  }, [accessToken, connect, connected])
  
  // 连接成功后自动同步消息
  useEffect(() => {
    if (connected && conversations.length > 0 && !hasSyncedRef.current) {
      hasSyncedRef.current = true
      console.log('🔄 应用启动，开始同步消息...')
      syncMessages().catch(error => {
        console.error('消息同步失败:', error)
      })
    }
  }, [connected, conversations.length, syncMessages])

  // 处理新私聊消息
  const handlePrivateMessage = useCallback((data: WSPrivateMessage['data']) => {
    console.log('📨 收到私聊消息:', data)

    // 转换为 Message 格式
    const message: Message = {
      message_uuid: data.message_uuid,
      sender_id: data.sender_id,
      receiver_id: data.receiver_id,
      message_content: data.message_content,
      message_type: data.message_type,
      file_uuid: data.file_uuid,
      file_url: data.file_url,
      file_size: data.file_size,
      file_hash: data.file_hash,
      seq: data.seq,
      send_time: data.send_time,
    }

    // 如果当前正在查看这个对话，添加消息
    if (
      selectedConversation?.type === 'friend' &&
      (selectedConversation.id === data.sender_id || selectedConversation.id === data.receiver_id)
    ) {
      addMessage(message)
    }

    // TODO: 更新未读计数
  }, [selectedConversation, addMessage])

  // 处理新群聊消息
  const handleGroupMessage = useCallback((data: WSGroupMessage['data']) => {
    console.log('📨 收到群聊消息:', data)

    // 如果当前正在查看这个群聊，添加消息
    if (selectedConversation?.type === 'group' && selectedConversation.id === data.group_id) {
      // 群消息类型包含 'system'，但需要转换为私聊消息类型
      const msgType = data.message_type === 'system' ? 'text' : data.message_type
      const message: Message = {
        message_uuid: data.message_uuid,
        sender_id: data.sender_id,
        receiver_id: data.group_id,
        message_content: data.message_content,
        message_type: msgType as Message['message_type'],
        file_uuid: data.file_uuid,
        file_url: data.file_url,
        file_size: data.file_size,
        file_hash: data.file_hash,
        seq: data.seq,
        send_time: data.send_time,
      }
      addMessage(message)
    }

    // TODO: 更新未读计数
  }, [selectedConversation, addMessage])

  // 处理消息撤回
  const handleMessageRecalled = useCallback((data: WSMessageRecalled['data']) => {
    console.log('🔙 消息已撤回:', data)

    // 从当前消息列表中移除
    setMessages(messages.filter(m => m.message_uuid !== data.message_uuid))
  }, [messages, setMessages])

  // 处理好友请求
  const handleFriendRequest = useCallback(() => {
    console.log('👋 收到新的好友请求')
    loadPendingRequests().catch(console.error)
  }, [loadPendingRequests])

  // 处理好友请求结果
  const handleFriendRequestResult = useCallback((data: { target_user_id: string; result: 'approved' | 'rejected' }) => {
    console.log('📋 好友请求结果:', data)
    // 如果通过了，刷新好友列表
    if (data.result === 'approved') {
      useFriendsStore.getState().loadFriends().catch(console.error)
    }
  }, [])

  // 处理群邀请
  const handleGroupInvitation = useCallback(() => {
    console.log('📩 收到群邀请')
    // 可以在这里更新群邀请计数或刷新邀请列表
  }, [])

  // 处理群成员变化
  const handleGroupMemberChange = useCallback((data: { group_id: string }) => {
    console.log('👥 群成员变化:', data)
    // 刷新群组列表
    loadMyGroups().catch(console.error)
  }, [loadMyGroups])

  // 注册消息处理器
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    unsubscribers.push(registerHandler<WSPrivateMessage['data']>('private_message', handlePrivateMessage))
    unsubscribers.push(registerHandler<WSGroupMessage['data']>('group_message', handleGroupMessage))
    unsubscribers.push(registerHandler<WSMessageRecalled['data']>('message_recalled', handleMessageRecalled))
    unsubscribers.push(registerHandler('friend_request', handleFriendRequest))
    unsubscribers.push(registerHandler('friend_request_result', handleFriendRequestResult))
    unsubscribers.push(registerHandler('group_invitation', handleGroupInvitation))
    unsubscribers.push(registerHandler('group_member_joined', handleGroupMemberChange))
    unsubscribers.push(registerHandler('group_member_left', handleGroupMemberChange))
    unsubscribers.push(registerHandler('group_member_removed', handleGroupMemberChange))

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [
    registerHandler,
    handlePrivateMessage,
    handleGroupMessage,
    handleMessageRecalled,
    handleFriendRequest,
    handleFriendRequestResult,
    handleGroupInvitation,
    handleGroupMemberChange,
  ])

  return { connected, disconnect }
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
        // TODO: 更新正在输入状态
        console.log(`${data.user_id} ${data.is_typing ? '正在输入...' : '停止输入'}`)
      }
    })

    return unsub
  }, [registerHandler, conversationType, conversationId])
}
