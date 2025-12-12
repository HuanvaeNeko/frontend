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
  Download,
  Loader2,
  AlertCircle
} from 'lucide-react'
import type { ChatMessage } from '../types'
import { useApiConfigStore } from '../store/apiConfig'
import { useAuthStore } from '../store/authStore'
import { Button } from '@/components/ui/button'
import { useToast } from '../hooks/use-toast'

export default function AiChat() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { accessToken } = useAuthStore()
  const apiConfigStore = useApiConfigStore()
  
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '您好！我是 AI 聊天助手。有什么可以帮助您的吗？',
      timestamp: Date.now()
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

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

  // 发送消息到 AI API
  const sendToAI = async (userMessage: string): Promise<string> => {
    const apiUrl = apiConfigStore.useCustomApi 
      ? apiConfigStore.aiApiUrl 
      : `${apiConfigStore.aiApiUrl}`

    // 创建 AbortController 用于取消请求
    abortControllerRef.current = new AbortController()

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // 添加认证头
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`
      }

      // 如果配置了 API Key
      if (apiConfigStore.useCustomApi && apiConfigStore.aiApiKey) {
        headers['X-API-Key'] = apiConfigStore.aiApiKey
      }

      // 构建消息历史
      const messageHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      messageHistory.push({ role: 'user', content: userMessage })

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: messageHistory,
          message: userMessage,
          stream: false,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || `请求失败 (${response.status})`)
      }

      const data = await response.json()
      
      // 支持多种响应格式
      return data.content || data.message || data.response || data.reply || 
             (data.choices?.[0]?.message?.content) || '收到您的消息，但我暂时无法回复。'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('请求已取消')
      }
      throw err
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMessage])
    const currentInput = inputMessage
    setInputMessage('')
    setIsLoading(true)
    setError(null)

    try {
      const aiResponse = await sendToAI(currentInput)
      
      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, aiMessage])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发送失败，请稍后重试'
      setError(errorMessage)
      
      // 添加错误消息
      const errorAiMessage: ChatMessage = {
        role: 'assistant',
        content: `抱歉，发生了错误：${errorMessage}\n\n您可以尝试：\n1. 检查网络连接\n2. 在设置中配置正确的 API 地址\n3. 稍后重试`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorAiMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // 取消正在进行的请求
  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsLoading(false)
    }
  }

  const clearChat = () => {
    if (confirm('确定要清空聊天记录吗？')) {
      setMessages([{
        role: 'assistant',
        content: '聊天记录已清空。有什么可以帮助您的吗？',
        timestamp: Date.now()
      }])
      setError(null)
    }
  }

  // 导出聊天记录
  const exportChat = () => {
    const chatContent = messages.map(msg => {
      const role = msg.role === 'user' ? '我' : 'AI'
      const time = formatTime(msg.timestamp)
      return `[${time}] ${role}: ${msg.content}`
    }).join('\n\n')

    const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-chat-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({
      title: '导出成功',
      description: '聊天记录已保存',
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                <Bot size={24} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg">AI 聊天助手</h1>
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  在线
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={exportChat}
              className="gap-2"
            >
              <Download size={18} />
              导出
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="gap-2"
            >
              <Trash size={18} />
              清空
            </Button>
            <label htmlFor="settings-modal">
              <Button variant="ghost" size="sm" className="gap-2" asChild>
                <span>
                  <Settings size={18} />
                  设置
                </span>
              </Button>
            </label>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="max-w-4xl mx-auto w-full px-4 py-2">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle size={16} />
            {error}
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 聊天消息区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                  message.role === 'user' 
                    ? 'bg-gradient-to-br from-blue-500 to-purple-500' 
                    : 'bg-gradient-to-br from-primary to-purple-600'
                }`}>
                  {message.role === 'user' ? (
                    <User size={20} className="text-white" />
                  ) : (
                    <Bot size={24} className="text-white" />
                  )}
                </div>
                <div>
                  <div className={`flex items-center gap-2 mb-1 ${message.role === 'user' ? 'justify-end' : ''}`}>
                    {message.role === 'assistant' && (
                      <Wand2 size={12} className="text-primary" />
                    )}
                    <span className="text-sm font-medium">
                      {message.role === 'user' ? '我' : 'AI 助手'}
                    </span>
                    <time className="text-xs text-gray-400">{formatTime(message.timestamp)}</time>
                  </div>
                  <div className={`rounded-2xl px-4 py-3 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-white border border-gray-200'
                  }`}>
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center animate-pulse">
                  <Bot size={24} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Wand2 size={12} className="text-primary" />
                    <span className="text-sm font-medium">AI 助手</span>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-gray-500">AI 正在思考...</span>
                      <button 
                        onClick={cancelRequest}
                        className="text-xs text-red-500 hover:text-red-600 ml-2"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 输入区域 */}
      <div className="bg-white/80 backdrop-blur-xl border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="输入您的问题..."
                  className="w-full px-4 py-3 pr-20 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={isLoading}
                  maxLength={2000}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {inputMessage.length}/2000
                </div>
              </div>
              <Button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="px-6 gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    发送
                  </>
                )}
              </Button>
            </div>
          </form>
          
          {/* 快捷提示 */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button 
              onClick={() => setInputMessage('你好，请介绍一下自己')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isLoading}
            >
              介绍自己
            </button>
            <button 
              onClick={() => setInputMessage('你能帮我做什么？')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isLoading}
            >
              功能说明
            </button>
            <button 
              onClick={() => setInputMessage('推荐一些有趣的话题')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isLoading}
            >
              话题推荐
            </button>
            <button 
              onClick={() => setInputMessage('帮我写一段代码')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              disabled={isLoading}
            >
              写代码
            </button>
          </div>
        </div>
      </div>

      {/* API 设置模态框 */}
      <input type="checkbox" id="settings-modal" className="modal-toggle hidden" />
      <div className="modal hidden peer-checked:flex fixed inset-0 z-50 items-center justify-center bg-black/50" id="modal-backdrop">
        <label htmlFor="settings-modal" className="absolute inset-0"></label>
        <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 relative z-10 shadow-xl">
          <h3 className="font-bold text-xl mb-6 flex items-center gap-2">
            <Settings size={20} className="text-primary" />
            API 配置
          </h3>
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-medium">使用自定义 API</label>
                <p className="text-xs text-gray-500">启用后可配置自己的 AI 服务</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={apiConfigStore.useCustomApi}
                  onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">AI API URL</label>
                <input
                  type="text"
                  value={apiConfigStore.aiApiUrl}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                  placeholder="http://localhost:8080/api/chat"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">AI API Key</label>
                <input
                  type="password"
                  value={apiConfigStore.aiApiKey}
                  onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                  placeholder="输入 API Key（可选）"
                  disabled={!apiConfigStore.useCustomApi}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => apiConfigStore.resetToDefault()}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              重置
            </button>
            <label 
              htmlFor="settings-modal" 
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-center cursor-pointer"
            >
              完成
            </label>
          </div>
        </div>
      </div>

      <style>{`
        .modal-toggle:checked ~ .modal {
          display: flex !important;
        }
      `}</style>
    </div>
  )
}
