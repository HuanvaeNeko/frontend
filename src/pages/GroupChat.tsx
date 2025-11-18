import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faArrowLeft, 
  faPaperPlane, 
  faUsers,
  faUser,
  faSignInAlt,
  faSignOutAlt
} from '@fortawesome/free-solid-svg-icons'
import type { GroupChatMessage, OnlineUser } from '../types'
import { useApiConfigStore } from '../store/apiConfig'

// 预览数据
const mockUsers: OnlineUser[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' }
]

const mockMessages: GroupChatMessage[] = [
  {
    userName: 'Alice',
    content: '大家好！',
    timestamp: Date.now() - 3600000
  },
  {
    userName: 'Bob',
    content: '你好 Alice！',
    timestamp: Date.now() - 3500000
  },
  {
    userName: 'Charlie',
    content: '欢迎加入群聊！',
    timestamp: Date.now() - 3400000
  }
]

export default function GroupChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<GroupChatMessage[]>(mockMessages)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>(mockUsers)
  const [inputMessage, setInputMessage] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const apiConfigStore = useApiConfigStore()
  const roomId = 'room-1'
  const userName = `用户${Math.floor(Math.random() * 1000)}`

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const toggleConnection = () => {
    if (isConnected) {
      setIsConnected(false)
    } else {
      setIsConnected(true)
      // 模拟用户加入
      setOnlineUsers([...mockUsers, { id: 'current', name: userName }])
      setMessages(prev => [...prev, {
        userName: '系统',
        content: `${userName} 加入了房间`,
        timestamp: Date.now()
      }])
    }
  }

  const sendMessage = () => {
    if (!inputMessage.trim() || !isConnected) return

    const message: GroupChatMessage = {
      userName,
      content: inputMessage,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, message])
    setInputMessage('')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-gray-800"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
            返回首页
          </button>
          <h1 className="text-2xl font-bold text-gray-800">群聊</h1>
          <span className="text-sm text-gray-500">房间: {roomId}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            <FontAwesomeIcon icon={faUsers} className="mr-1" />
            在线: {onlineUsers.length} 人
          </div>
          <button
            onClick={toggleConnection}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isConnected 
                ? 'bg-red-500 text-white hover:bg-red-600' 
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            <FontAwesomeIcon 
              icon={isConnected ? faSignOutAlt : faSignInAlt} 
              className="mr-2" 
            />
            {isConnected ? '断开连接' : '连接'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 在线用户列表 */}
        <aside className="w-64 bg-white border-r overflow-y-auto p-4">
          <h2 className="font-bold text-gray-800 mb-4">
            <FontAwesomeIcon icon={faUsers} className="mr-2" />
            在线用户
          </h2>
          <div className="space-y-2">
            {onlineUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-100"
              >
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                  <FontAwesomeIcon icon={faUser} />
                </div>
                <span className="text-sm text-gray-700">{user.name}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* 聊天区域 */}
        <div className="flex-1 flex flex-col">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="container mx-auto">
              {messages.map((message, index) => (
                <div key={index} className="flex mb-4">
                  <div className="flex gap-3 max-w-3xl">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm flex-shrink-0">
                      <FontAwesomeIcon icon={faUser} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-gray-800">{message.userName}</span>
                        <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>
                      </div>
                      <div className="bg-white rounded-lg px-4 py-2 shadow-sm">
                        <div className="whitespace-pre-wrap text-gray-800">{message.content}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 输入区域 */}
          <div className="bg-white border-t px-6 py-4">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-4">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="输入消息..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!isConnected}
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || !isConnected}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FontAwesomeIcon icon={faPaperPlane} className="mr-2" />
                发送
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
