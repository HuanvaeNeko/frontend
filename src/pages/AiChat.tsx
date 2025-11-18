import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faArrowLeft, 
  faPaperPlane, 
  faCog,
  faUser
} from '@fortawesome/free-solid-svg-icons'
import type { ChatMessage } from '../types'
import { useApiConfigStore } from '../store/apiConfig'

// 预览数据 - 模拟 AI 响应
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
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const apiConfigStore = useApiConfigStore()
  const userName = `用户${Math.floor(Math.random() * 1000)}`

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

    // 模拟 API 调用延迟
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
          <h1 className="text-2xl font-bold text-gray-800">AI 聊天助手</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            <FontAwesomeIcon icon={faUser} className="mr-1" />
            用户: {userName}
          </span>
          <button
            onClick={() => setShowSettings(true)}
            className="text-gray-600 hover:text-gray-800"
          >
            <FontAwesomeIcon icon={faCog} />
          </button>
        </div>
      </header>

      {/* 聊天消息区域 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="container mx-auto">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex mb-4 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-800 shadow-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div
                  className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}
                >
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-lg px-4 py-3 shadow-sm">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
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
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="mr-2" />
            发送
          </button>
        </form>
      </div>

      {/* API 设置模态框 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">API 配置</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  使用自定义 API
                </label>
                <input
                  type="checkbox"
                  checked={apiConfigStore.useCustomApi}
                  onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                  className="w-4 h-4"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI API URL
                </label>
                <input
                  type="text"
                  value={apiConfigStore.aiApiUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                  placeholder="http://localhost:8000/api/chat"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI API Key (可选)
                </label>
                <input
                  type="password"
                  value={apiConfigStore.aiApiKey}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                  placeholder="输入 API Key"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WebSocket URL
                </label>
                <input
                  type="text"
                  value={apiConfigStore.wsUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ wsUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => apiConfigStore.resetToDefault()}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              >
                重置为默认
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
