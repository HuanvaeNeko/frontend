import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Send, 
  Users,
  LogIn,
  LogOut,
  Zap,
  Hash,
  MoreVertical
} from 'lucide-react'
import type { GroupChatMessage, OnlineUser } from '../types'

const mockUsers: OnlineUser[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Charlie' },
  { id: '4', name: 'David' },
  { id: '5', name: 'Eva' }
]

const mockMessages: GroupChatMessage[] = [
  {
    userName: 'Alice',
    content: '大家好！欢迎加入我们的讨论组',
    timestamp: Date.now() - 3600000
  },
  {
    userName: 'Bob',
    content: '你好 Alice！很高兴加入',
    timestamp: Date.now() - 3500000
  },
  {
    userName: 'Charlie',
    content: '大家好，有什么有趣的话题吗？',
    timestamp: Date.now() - 3400000
  }
]

export default function GroupChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<GroupChatMessage[]>(mockMessages)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>(mockUsers)
  const [inputMessage, setInputMessage] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
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
      setMessages(prev => [...prev, {
        userName: '系统',
        content: `${userName} 离开了房间`,
        timestamp: Date.now()
      }])
    } else {
      setIsConnected(true)
      setOnlineUsers([...mockUsers, { id: 'current', name: userName }])
      setMessages(prev => [...prev, {
        userName: '系统',
        content: `${userName} 加入了房间 🎉`,
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

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-red-500',
      'bg-orange-500',
      'bg-amber-500',
      'bg-yellow-500',
      'bg-lime-500',
      'bg-green-500',
      'bg-emerald-500',
      'bg-teal-500',
      'bg-cyan-500',
      'bg-sky-500',
      'bg-blue-500',
      'bg-indigo-500',
      'bg-violet-500',
      'bg-purple-500',
      'bg-fuchsia-500',
      'bg-pink-500',
      'bg-rose-500'
    ]
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-base-200 via-base-100 to-base-200 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="navbar bg-base-100/80 backdrop-blur-xl border-b border-base-300 shadow-lg sticky top-0 z-50">
        <div className="flex-1">
          <button 
            onClick={() => navigate('/')}
            className="btn btn-ghost gap-2"
          >
            <ArrowLeft size={20} />
            返回
          </button>
          <div className="flex items-center gap-3 ml-4">
            <div className="avatar online">
              <div className="w-10 rounded-full bg-gradient-to-br from-secondary to-accent">
                <div className="w-full h-full flex items-center justify-center text-white">
                  <Hash size={24} />
                </div>
              </div>
            </div>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                群聊室
                <div className="badge badge-sm badge-ghost">{roomId}</div>
              </h1>
              <p className="text-xs text-base-content/60">{onlineUsers.length} 人在线</p>
        </div>
          </div>
        </div>
        <div className="flex-none gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="btn btn-ghost btn-sm gap-2"
          >
            <Users size={20} />
            成员
          </button>
          <button
            onClick={toggleConnection}
            className={`btn btn-sm gap-2 ${isConnected ? 'btn-error' : 'btn-success'}`}
          >
            {isConnected ? <LogOut size={20} /> : <LogIn size={20} />}
            {isConnected ? '断开' : '连接'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 聊天区域 */}
        <div className="flex-1 flex flex-col">
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="container mx-auto max-w-4xl space-y-4">
              {messages.map((message, index) => {
                const isSystem = message.userName === '系统'
                const avatarColor = getAvatarColor(message.userName)
                
                if (isSystem) {
                  return (
                    <div key={index} className="flex justify-center">
                      <div className="badge badge-ghost gap-2 py-3">
                        <Zap size={16} className="text-warning" />
                        {message.content}
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={index} className="chat chat-start animate-fadeIn">
                    <div className="chat-image avatar">
                      <div className="w-10 rounded-full">
                        <div className={`w-full h-full flex items-center justify-center ${avatarColor} text-white font-bold`}>
                          {message.userName[0].toUpperCase()}
                      </div>
                      </div>
                    </div>
                    <div className="chat-header mb-1 flex items-center gap-2">
                      <span className="font-semibold">{message.userName}</span>
                      <time className="text-xs opacity-50">{formatTime(message.timestamp)}</time>
                    </div>
                    <div className="chat-bubble bg-base-200 text-base-content shadow-lg">
                      {message.content}
                    </div>
                    <div className="chat-footer opacity-50">
                      <button className="btn btn-ghost btn-xs">回复</button>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* 输入区域 */}
          <div className="bg-base-100/80 backdrop-blur-xl border-t border-base-300 p-6 shadow-2xl">
            <div className="container mx-auto max-w-4xl">
              {!isConnected && (
                <div className="alert alert-warning mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>请先连接到房间才能发送消息</span>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
                <div className="join w-full shadow-xl">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={isConnected ? "输入消息..." : "请先连接到房间..."}
                    className="input input-bordered input-lg join-item flex-1"
                disabled={!isConnected}
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || !isConnected}
                    className="btn btn-primary btn-lg join-item px-8 gap-2"
              >
                    <Send size={20} />
                发送
              </button>
                </div>
            </form>
            </div>
          </div>
        </div>

        {/* 右侧边栏 - 在线用户 */}
        {showSidebar && (
          <aside className="w-80 bg-base-100 border-l border-base-300 overflow-y-auto animate-slideIn">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-xl flex items-center gap-2">
                  <Users size={20} className="text-primary" />
                  在线成员
                </h2>
                <div className="badge badge-primary">{onlineUsers.length}</div>
              </div>
              
              <div className="space-y-2">
                {onlineUsers.map((user) => {
                  const avatarColor = getAvatarColor(user.name)
                  return (
                    <div
                      key={user.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 transition-all cursor-pointer group"
                    >
                      <div className="avatar online">
                        <div className="w-12 rounded-full">
                          <div className={`w-full h-full flex items-center justify-center ${avatarColor} text-white font-bold text-lg`}>
                            {user.name[0].toUpperCase()}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold group-hover:text-primary transition-colors">
                          {user.name}
                        </p>
                        <p className="text-xs text-success flex items-center gap-1">
                          <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
                          在线
                        </p>
                      </div>
                      <div className="dropdown dropdown-end">
                        <label tabIndex={0} className="btn btn-ghost btn-sm btn-circle opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical size={16} />
                        </label>
                        <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                          <li><a>查看资料</a></li>
                          <li><a>发送私信</a></li>
                        </ul>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 房间信息 */}
              <div className="mt-8 card bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
                <div className="card-body p-4">
                  <h3 className="font-bold text-sm mb-2">房间信息</h3>
                  <div className="space-y-2 text-xs text-base-content/70">
                    <p>房间ID: {roomId}</p>
                    <p>创建时间: 2024-01-01</p>
                    <p>消息数: {messages.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
