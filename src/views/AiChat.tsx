'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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
  AlertCircle,
  Sparkles,
  X
} from 'lucide-react'
import type { ChatMessage } from '../types'
import { useApiConfigStore } from '../store/apiConfig'
import { useAuthStore } from '../store/authStore'
import { useToast } from '../hooks/use-toast'
import { BackgroundOrbs } from '@/components/ui/glass'

export default function AiChat() {
  const router = useRouter()
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
  const [showSettings, setShowSettings] = useState(false)
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

  const quickPrompts = [
    { label: '介绍自己', text: '你好，请介绍一下自己' },
    { label: '功能说明', text: '你能帮我做什么？' },
    { label: '话题推荐', text: '推荐一些有趣的话题' },
    { label: '写代码', text: '帮我写一段代码' },
  ]

  return (
    <div className="w-full min-h-screen flex flex-col relative overflow-x-hidden bg-gradient-to-br from-blue-100 via-blue-50 via-25% via-white via-50% via-purple-50 via-75% to-purple-100">
      {/* 背景装饰球 */}
      <BackgroundOrbs count={3} />

      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 bg-white/70 backdrop-blur-xl border-b border-blue-200/30">
        <div className="flex items-center gap-3">
          <motion.button 
            className="w-9 h-9 rounded-[10px] bg-white/60 border border-blue-200/30 flex items-center justify-center cursor-pointer text-slate-600 transition-all hover:bg-white/90 hover:-translate-x-0.5"
            onClick={() => router.push('/chat')}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={20} />
          </motion.button>
          <div className="w-11 h-11 rounded-[14px] bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Bot size={24} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-800">AI 聊天助手</h1>
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              在线
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white/50 border border-blue-200/30 cursor-pointer text-sm text-slate-600 transition-all hover:bg-white/90 hover:border-blue-500/50 hover:text-blue-500"
            onClick={exportChat}
            title="导出聊天"
          >
            <Download size={18} />
            <span className="hidden sm:inline">导出</span>
          </button>
          <button 
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white/50 border border-blue-200/30 cursor-pointer text-sm text-slate-600 transition-all hover:bg-white/90 hover:border-blue-500/50 hover:text-blue-500"
            onClick={clearChat}
            title="清空聊天"
          >
            <Trash size={18} />
            <span className="hidden sm:inline">清空</span>
          </button>
          <button 
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] bg-white/50 border border-blue-200/30 cursor-pointer text-sm text-slate-600 transition-all hover:bg-white/90 hover:border-blue-500/50 hover:text-blue-500"
            onClick={() => setShowSettings(true)}
            title="设置"
          >
            <Settings size={18} />
            <span className="hidden sm:inline">设置</span>
          </button>
        </div>
      </header>

      {/* 错误提示 */}
      <AnimatePresence>
        {error && (
          <motion.div 
            className="sticky top-[65px] z-40 mx-5 my-3 px-4 py-3 bg-red-100/90 backdrop-blur-lg border border-red-300 rounded-xl flex items-center gap-2.5 text-red-600 text-sm"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
            <button 
              className="ml-auto p-1 bg-transparent border-none cursor-pointer text-red-600 opacity-70 hover:opacity-100"
              onClick={() => setError(null)}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 聊天消息区域 */}
      <main className="flex-1 overflow-y-auto p-5 pt-20 flex flex-col gap-4 z-[1]">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse ml-auto' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                message.role === 'user' 
                  ? 'bg-gradient-to-br from-blue-500 to-blue-400 text-white' 
                  : 'bg-gradient-to-br from-purple-500 to-purple-400 text-white'
              }`}>
                {message.role === 'user' ? <User size={18} /> : <Sparkles size={18} />}
              </div>
              <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-1.5 text-xs text-slate-500 ${message.role === 'user' ? 'justify-end' : ''}`}>
                  {message.role === 'assistant' && <Wand2 size={12} className="text-purple-500" />}
                  <span className="font-medium text-slate-600">
                    {message.role === 'user' ? '我' : 'AI 助手'}
                  </span>
                  <time>{formatTime(message.timestamp)}</time>
                </div>
                <div className={`py-3.5 px-4 rounded-2xl max-w-full shadow-sm ${
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-[6px] shadow-lg shadow-blue-500/30'
                    : 'bg-white/[0.88] backdrop-blur-xl border-[1.5px] border-white/90 rounded-bl-[6px] text-slate-800 shadow-blue-200/10'
                }`}>
                  <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
          
        {/* 加载状态 */}
        {isLoading && (
          <motion.div 
            className="flex gap-3 max-w-[85%]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-purple-500 to-purple-400 text-white">
              <Sparkles size={18} className="animate-pulse" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Wand2 size={12} className="text-purple-500" />
                <span className="font-medium text-slate-600">AI 助手</span>
              </div>
              <div className="py-3.5 px-4 rounded-2xl bg-white/[0.88] backdrop-blur-xl border-[1.5px] border-white/90 rounded-bl-[6px] flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>思考中...</span>
                <button 
                  onClick={cancelRequest} 
                  className="ml-2 text-xs text-red-500 bg-transparent border-none cursor-pointer hover:underline"
                >
                  取消
                </button>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* 输入区域 */}
      <footer className="sticky bottom-0 z-50 px-6 pt-5 pb-6 bg-gradient-to-t from-white/[0.85] to-white/75 backdrop-blur-2xl border-t border-blue-200/20 shadow-[0_-4px_20px_rgba(147,197,253,0.08)]">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-3 max-w-[800px] mx-auto">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="输入您的问题..."
              disabled={isLoading}
              maxLength={2000}
              className="w-full py-3.5 pl-4 pr-20 rounded-[14px] border border-blue-200/40 bg-white/70 text-[15px] outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] focus:bg-white disabled:bg-slate-100/80 disabled:cursor-not-allowed"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              {inputMessage.length}/2000
            </span>
          </div>
          <motion.button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="flex items-center gap-2 px-6 py-3.5 rounded-[14px] bg-gradient-to-br from-blue-500 to-blue-400 text-white border-none cursor-pointer text-[15px] font-medium transition-all shadow-lg shadow-blue-500/30 hover:enabled:-translate-y-0.5 hover:enabled:shadow-xl hover:enabled:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: isLoading ? 1 : 1.02 }}
            whileTap={{ scale: isLoading ? 1 : 0.98 }}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send size={18} />}
            <span>发送</span>
          </motion.button>
        </form>
          
        {/* 快捷提示 */}
        <div className="flex flex-wrap gap-2.5 mt-3.5 max-w-[800px] mx-auto">
          {quickPrompts.map((prompt, index) => (
            <motion.button 
              key={index}
              onClick={() => setInputMessage(prompt.text)}
              disabled={isLoading}
              className="py-2.5 px-4 rounded-full bg-white/75 border-[1.5px] border-blue-200/35 text-[13px] font-medium text-slate-600 cursor-pointer transition-all shadow-sm hover:enabled:bg-white hover:enabled:border-blue-500 hover:enabled:text-blue-500 hover:enabled:-translate-y-0.5 hover:enabled:shadow-md hover:enabled:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: isLoading ? 1 : 1.02 }}
              whileTap={{ scale: isLoading ? 1 : 0.98 }}
            >
              {prompt.label}
            </motion.button>
          ))}
        </div>
      </footer>

      {/* API 设置对话框 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div 
              className="w-full max-w-[480px] bg-white/95 backdrop-blur-xl rounded-[20px] shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-blue-200/30">
                <div className="flex items-center gap-2.5 text-lg font-semibold text-slate-800">
                  <Settings size={20} className="text-blue-500" />
                  <span>API 配置</span>
                </div>
                <button 
                  onClick={() => setShowSettings(false)} 
                  className="w-8 h-8 rounded-lg bg-slate-100/80 border-none flex items-center justify-center cursor-pointer text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="px-6 py-5 flex flex-col gap-4">
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-slate-800">使用自定义 API</span>
                    <span className="text-xs text-slate-500">启用后可配置自己的 AI 服务</span>
                  </div>
                  <label className="relative inline-block w-11 h-6">
                    <input
                      type="checkbox"
                      checked={apiConfigStore.useCustomApi}
                      onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                      className="opacity-0 w-0 h-0 peer"
                    />
                    <span className="absolute cursor-pointer inset-0 bg-slate-300 transition-all rounded-full peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-blue-400 before:content-[''] before:absolute before:h-[18px] before:w-[18px] before:left-[3px] before:bottom-[3px] before:bg-white before:transition-all before:rounded-full before:shadow-md peer-checked:before:translate-x-5"></span>
                  </label>
                </div>

                <div className="h-px bg-blue-200/30"></div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-600">AI API URL</label>
                  <input
                    type="text"
                    value={apiConfigStore.aiApiUrl}
                    onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                    placeholder="http://localhost:8080/api/chat"
                    disabled={!apiConfigStore.useCustomApi}
                    className="py-2.5 px-3.5 rounded-[10px] border border-blue-200/40 bg-white/80 text-sm outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-600">AI API Key</label>
                  <input
                    type="password"
                    value={apiConfigStore.aiApiKey}
                    onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                    placeholder="输入 API Key（可选）"
                    disabled={!apiConfigStore.useCustomApi}
                    className="py-2.5 px-3.5 rounded-[10px] border border-blue-200/40 bg-white/80 text-sm outline-none transition-all focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-blue-200/30">
                <button
                  onClick={() => apiConfigStore.resetToDefault()}
                  className="flex-1 py-3 rounded-xl border border-blue-200/40 bg-white text-slate-600 cursor-pointer transition-all hover:bg-slate-50"
                >
                  重置
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-3 rounded-xl border-none bg-gradient-to-r from-blue-500 to-blue-400 text-white cursor-pointer font-medium transition-all hover:-translate-y-px hover:shadow-lg hover:shadow-blue-500/30"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
