import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Send, 
  Settings,
  User,
  Bot,
  Wand2,
  Trash,
  Download
} from 'lucide-react'
import type { ChatMessage } from '../types'
import { useApiConfigStore } from '../store/apiConfig'

const mockAiResponses = [
  '您好！我是 AI 聊天助手。有什么可以帮助您的吗？',
  '这是一个模拟响应。当您配置了真实的 API 后，这里将显示实际的 AI 回复。',
  '您可以通过设置页面配置自定义 API，或者使用默认的本地 API 服务。',
  '感谢您的使用！如有任何问题，请随时告诉我。'
]

export default function AiChat() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '您好！我是 AI 聊天助手。有什么可以帮助您的吗？',
      timestamp: Date.now()
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const apiConfigStore = useApiConfigStore()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)

    setTimeout(() => {
      const randomResponse = mockAiResponses[Math.floor(Math.random() * mockAiResponses.length)]
      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: randomResponse,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, aiMessage])
      setIsLoading(false)
    }, 1000)
  }

  const clearChat = () => {
    if (confirm('确定要清空聊天记录吗？')) {
      setMessages([{
        role: 'assistant',
        content: '聊天记录已清空。有什么可以帮助您的吗？',
        timestamp: Date.now()
      }])
    }
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
              <div className="w-10 rounded-full bg-gradient-to-br from-primary to-secondary">
                <div className="w-full h-full flex items-center justify-center text-white">
                  <Bot size={24} />
                </div>
              </div>
            </div>
            <div>
              <h1 className="font-bold text-lg">AI 聊天助手</h1>
              <p className="text-xs text-success">● 在线</p>
            </div>
          </div>
        </div>
        <div className="flex-none gap-2">
          <button
            onClick={clearChat}
            className="btn btn-ghost btn-sm gap-2"
            title="清空聊天"
          >
            <Trash size={20} />
            清空
          </button>
          <label htmlFor="settings-modal" className="btn btn-ghost btn-sm gap-2">
            <Settings size={20} />
            设置
          </label>
        </div>
      </div>

      {/* 聊天消息区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="container mx-auto max-w-4xl">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`chat ${message.role === 'user' ? 'chat-end' : 'chat-start'} animate-fadeIn`}
            >
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  {message.role === 'user' ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent to-secondary text-white">
                      <User size={20} />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary text-white">
                      <Bot size={24} />
                    </div>
                  )}
                </div>
              </div>
              <div className="chat-header mb-1 flex items-center gap-2">
                {message.role === 'user' ? '我' : (
                  <>
                    <Wand2 size={12} className="text-primary" />
                    <span>AI 助手</span>
                  </>
                )}
                <time className="text-xs opacity-50 ml-2">{formatTime(message.timestamp)}</time>
              </div>
              <div className={`chat-bubble text-base shadow-lg ${
                  message.role === 'user'
                  ? 'chat-bubble-primary' 
                  : 'chat-bubble-secondary'
              }`}>
                <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              <div className="chat-footer opacity-50 mt-1">
                {message.role === 'assistant' && (
                  <button className="btn btn-ghost btn-xs gap-1">
                    <Download size={16} />
                    保存
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="chat chat-start animate-fadeIn">
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary text-white animate-pulse">
                    <Bot size={24} />
                  </div>
                </div>
              </div>
              <div className="chat-bubble chat-bubble-secondary">
                <div className="flex gap-1">
                  <span className="loading loading-dots loading-sm"></span>
                  <span className="text-sm opacity-70">AI 正在思考...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="bg-base-100/80 backdrop-blur-xl border-t border-base-300 p-6 shadow-2xl">
        <div className="container mx-auto max-w-4xl">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
            <div className="join w-full shadow-xl">
              <div className="join-item flex-1 relative">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="输入您的问题..."
                  className="input input-bordered input-lg w-full focus:outline-none pr-20"
            disabled={isLoading}
          />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-base-content/50">
                  {inputMessage.length}/1000
                </div>
              </div>
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
                className="btn btn-primary btn-lg join-item px-8 gap-2"
          >
                {isLoading ? (
                  <span className="loading loading-spinner"></span>
                ) : (
                  <>
                    <Send size={20} />
            发送
                  </>
                )}
          </button>
            </div>
        </form>
          
          {/* 快捷提示 */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button 
              onClick={() => setInputMessage('你好，请介绍一下自己')}
              className="btn btn-sm btn-ghost"
            >
              介绍自己
            </button>
            <button 
              onClick={() => setInputMessage('你能帮我做什么？')}
              className="btn btn-sm btn-ghost"
            >
              功能说明
            </button>
            <button 
              onClick={() => setInputMessage('推荐一些有趣的话题')}
              className="btn btn-sm btn-ghost"
            >
              话题推荐
            </button>
          </div>
        </div>
      </div>

      {/* API 设置模态框 */}
      <input type="checkbox" id="settings-modal" className="modal-toggle" />
      <div className="modal">
        <div className="modal-box max-w-2xl">
          <h3 className="font-bold text-2xl mb-6 flex items-center gap-2">
            <Settings size={20} className="text-primary" />
            API 配置
          </h3>
          
          <div className="space-y-6">
            <div className="form-control">
              <label className="label cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="avatar placeholder">
                    <div className="bg-primary text-primary-content rounded-lg w-10">
                      <Wand2 size={20} />
                    </div>
                  </div>
              <div>
                    <span className="label-text font-semibold text-base">使用自定义 API</span>
                    <p className="text-xs text-base-content/60">启用后可配置自己的 AI 服务</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={apiConfigStore.useCustomApi}
                  onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                  className="toggle toggle-primary toggle-lg"
                />
              </label>
              </div>

            <div className="divider"></div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">AI API URL</span>
                </label>
                <input
                  type="text"
                  value={apiConfigStore.aiApiUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                  placeholder="http://localhost:8000/api/chat"
                  disabled={!apiConfigStore.useCustomApi}
                className="input input-bordered input-lg"
                />
              </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">AI API Key</span>
                </label>
                <input
                  type="password"
                  value={apiConfigStore.aiApiKey}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                placeholder="输入 API Key（可选）"
                  disabled={!apiConfigStore.useCustomApi}
                className="input input-bordered input-lg"
                />
              </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">WebSocket URL</span>
                </label>
                <input
                  type="text"
                  value={apiConfigStore.wsUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ wsUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                  disabled={!apiConfigStore.useCustomApi}
                className="input input-bordered input-lg"
                />
              </div>
            </div>

          <div className="modal-action">
              <button
                onClick={() => apiConfigStore.resetToDefault()}
              className="btn btn-ghost"
              >
              重置
              </button>
            <label htmlFor="settings-modal" className="btn btn-primary">
              完成
            </label>
          </div>
        </div>
        <label className="modal-backdrop" htmlFor="settings-modal"></label>
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
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
