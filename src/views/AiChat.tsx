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
    <div className="ai-chat-app">
      {/* 背景装饰球 */}
      <div className="ai-bg-orb orb-1"></div>
      <div className="ai-bg-orb orb-2"></div>
      <div className="ai-bg-orb orb-3"></div>

      {/* 顶部导航栏 */}
      <header className="ai-chat-header">
        <div className="header-left">
          <button 
            className="back-btn"
            onClick={() => router.push('/chat')}
            >
              <ArrowLeft size={20} />
          </button>
          <div className="ai-avatar">
            <Bot size={24} />
          </div>
          <div className="ai-info">
            <h1>AI 聊天助手</h1>
            <span className="online-status">
              <span className="status-dot"></span>
              在线
                </span>
          </div>
        </div>
        <div className="header-actions">
          <button className="action-btn" onClick={exportChat} title="导出聊天">
            <Download size={18} />
            <span>导出</span>
          </button>
          <button className="action-btn" onClick={clearChat} title="清空聊天">
            <Trash size={18} />
            <span>清空</span>
          </button>
          <button className="action-btn" onClick={() => setShowSettings(true)} title="设置">
            <Settings size={18} />
            <span>设置</span>
          </button>
      </div>
      </header>

      {/* 错误提示 */}
      <AnimatePresence>
      {error && (
          <motion.div 
            className="ai-error-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X size={14} />
            </button>
          </motion.div>
      )}
      </AnimatePresence>

      {/* 聊天消息区域 */}
      <main className="ai-chat-messages">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={index}
              className={`message-row ${message.role}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className={`message-avatar ${message.role}`}>
                  {message.role === 'user' ? (
                  <User size={18} />
                  ) : (
                  <Sparkles size={18} />
                  )}
                </div>
              <div className="message-content">
                <div className="message-meta">
                    {message.role === 'assistant' && (
                    <Wand2 size={12} className="ai-icon" />
                    )}
                  <span className="sender-name">
                      {message.role === 'user' ? '我' : 'AI 助手'}
                    </span>
                  <time>{formatTime(message.timestamp)}</time>
                  </div>
                <div className={`message-bubble ${message.role}`}>
                  <div className="message-text">{message.content}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
          
        {/* 加载状态 */}
          {isLoading && (
          <motion.div 
            className="message-row assistant"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="message-avatar assistant">
              <Sparkles size={18} className="animate-pulse" />
                </div>
            <div className="message-content">
              <div className="message-meta">
                <Wand2 size={12} className="ai-icon" />
                <span className="sender-name">AI 助手</span>
                  </div>
              <div className="message-bubble assistant loading">
                      <Loader2 className="h-4 w-4 animate-spin" />
                <span>思考中...</span>
                <button onClick={cancelRequest} className="cancel-btn">
                        取消
                      </button>
              </div>
            </div>
          </motion.div>
          )}
          <div ref={messagesEndRef} />
      </main>

      {/* 输入区域 */}
      <footer className="ai-chat-input">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
          <div className="input-container">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="输入您的问题..."
                  disabled={isLoading}
                  maxLength={2000}
                />
            <span className="char-count">{inputMessage.length}/2000</span>
                </div>
          <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
            className="send-btn"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <Send size={18} />
                )}
            <span>发送</span>
          </button>
          </form>
          
          {/* 快捷提示 */}
        <div className="quick-prompts">
          {quickPrompts.map((prompt, index) => (
            <button 
              key={index}
              onClick={() => setInputMessage(prompt.text)}
              disabled={isLoading}
              className="prompt-btn"
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </footer>

      {/* API 设置对话框 */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            className="settings-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSettings(false)}
          >
            <motion.div 
              className="settings-dialog"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="dialog-header">
                <div className="dialog-title">
                  <Settings size={20} className="text-blue-500" />
                  <span>API 配置</span>
                </div>
                <button onClick={() => setShowSettings(false)} className="close-btn">
                  <X size={18} />
                </button>
              </div>
              
              <div className="settings-content">
                <div className="setting-item">
                  <div className="setting-info">
                    <span className="setting-label">使用自定义 API</span>
                    <span className="setting-desc">启用后可配置自己的 AI 服务</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={apiConfigStore.useCustomApi}
                      onChange={(e) => apiConfigStore.setApiConfig({ useCustomApi: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="setting-divider"></div>

                <div className="setting-field">
                  <label>AI API URL</label>
                  <input
                    type="text"
                    value={apiConfigStore.aiApiUrl}
                    onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                    placeholder="http://localhost:8080/api/chat"
                    disabled={!apiConfigStore.useCustomApi}
                  />
                </div>

                <div className="setting-field">
                  <label>AI API Key</label>
                  <input
                    type="password"
                    value={apiConfigStore.aiApiKey}
                    onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                    placeholder="输入 API Key（可选）"
                    disabled={!apiConfigStore.useCustomApi}
                  />
                </div>
              </div>

              <div className="settings-actions">
                <button
                  onClick={() => apiConfigStore.resetToDefault()}
                  className="reset-btn"
                >
                  重置
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="confirm-btn"
                >
                  完成
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .ai-chat-app {
          width: 100%;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: linear-gradient(
            135deg,
            #e0f2fe 0%,
            #f0f9ff 25%,
            #ffffff 50%,
            #f5f3ff 75%,
            #ede9fe 100%
          );
        }

        .ai-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
          pointer-events: none;
          z-index: 0;
        }

        .ai-bg-orb.orb-1 {
          width: 400px;
          height: 400px;
          background: linear-gradient(135deg, #93c5fd, #60a5fa);
          top: -100px;
          right: -100px;
          animation: float-slow 20s ease-in-out infinite;
        }

        .ai-bg-orb.orb-2 {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #c4b5fd, #a78bfa);
          bottom: -80px;
          left: 10%;
          animation: float-slow 25s ease-in-out infinite reverse;
        }

        .ai-bg-orb.orb-3 {
          width: 200px;
          height: 200px;
          background: linear-gradient(135deg, #a5b4fc, #818cf8);
          top: 40%;
          left: -50px;
          animation: float-slow 18s ease-in-out infinite;
        }

        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.05); }
        }

        /* 顶部导航 */
        .ai-chat-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-bottom: 1px solid rgba(147, 197, 253, 0.3);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .back-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(147, 197, 253, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #475569;
        }

        .back-btn:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: translateX(-2px);
        }

        .ai-avatar {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .ai-info h1 {
          font-size: 16px;
          font-weight: 600;
          color: #1e3a5f;
          margin: 0;
        }

        .online-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #10b981;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
        }

        .header-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(147, 197, 253, 0.3);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 13px;
          color: #475569;
        }

        .action-btn:hover {
          background: rgba(255, 255, 255, 0.9);
          border-color: rgba(59, 130, 246, 0.5);
          color: #3b82f6;
        }

        .action-btn span {
          display: none;
        }

        @media (min-width: 640px) {
          .action-btn span {
            display: inline;
          }
        }

        /* 错误提示 */
        .ai-error-banner {
          position: sticky;
          top: 65px;
          z-index: 40;
          margin: 12px 20px;
          padding: 12px 16px;
          background: rgba(254, 202, 202, 0.9);
          backdrop-filter: blur(10px);
          border: 1px solid #fca5a5;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #dc2626;
          font-size: 14px;
        }

        .ai-error-banner button {
          margin-left: auto;
          padding: 4px;
          background: none;
          border: none;
          cursor: pointer;
          color: #dc2626;
          opacity: 0.7;
        }

        .ai-error-banner button:hover {
          opacity: 1;
        }

        /* 消息区域 */
        .ai-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          padding-top: 80px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          z-index: 1;
        }

        .message-row {
          display: flex;
          gap: 12px;
          max-width: 85%;
        }

        .message-row.user {
          flex-direction: row-reverse;
          margin-left: auto;
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .message-avatar.user {
          background: linear-gradient(135deg, #3b82f6, #60a5fa);
          color: white;
        }

        .message-avatar.assistant {
          background: linear-gradient(135deg, #8b5cf6, #a78bfa);
          color: white;
        }

        .message-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .message-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #64748b;
        }

        .message-row.user .message-meta {
          justify-content: flex-end;
        }

        .ai-icon {
          color: #8b5cf6;
        }

        .sender-name {
          font-weight: 500;
          color: #475569;
        }

        .message-bubble {
          padding: 14px 18px;
          border-radius: 18px;
          max-width: 100%;
          box-shadow: 0 2px 8px rgba(147, 197, 253, 0.1);
        }

        .message-bubble.user {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
          border-bottom-right-radius: 6px;
          box-shadow: 0 4px 16px rgba(59, 130, 246, 0.3);
        }

        .message-bubble.assistant {
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1.5px solid rgba(255, 255, 255, 0.9);
          border-bottom-left-radius: 6px;
          color: #1e3a5f;
          box-shadow: 0 2px 12px rgba(147, 197, 253, 0.12);
        }

        .message-bubble.loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
        }

        .cancel-btn {
          margin-left: 8px;
          font-size: 12px;
          color: #ef4444;
          background: none;
          border: none;
          cursor: pointer;
        }

        .cancel-btn:hover {
          text-decoration: underline;
        }

        .message-text {
          white-space: pre-wrap;
          line-height: 1.5;
        }

        /* 输入区域 */
        .ai-chat-input {
          position: sticky;
          bottom: 0;
          z-index: 50;
          padding: 20px 24px 24px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.75) 100%);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(147, 197, 253, 0.2);
          box-shadow: 0 -4px 20px rgba(147, 197, 253, 0.08);
        }

        .ai-chat-input form {
          display: flex;
          gap: 12px;
          max-width: 800px;
          margin: 0 auto;
        }

        .input-container {
          flex: 1;
          position: relative;
        }

        .input-container input {
          width: 100%;
          padding: 14px 80px 14px 16px;
          border-radius: 14px;
          border: 1px solid rgba(147, 197, 253, 0.4);
          background: rgba(255, 255, 255, 0.7);
          font-size: 15px;
          outline: none;
          transition: all 0.2s ease;
        }

        .input-container input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          background: white;
        }

        .input-container input:disabled {
          background: rgba(241, 245, 249, 0.8);
          cursor: not-allowed;
        }

        .char-count {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 12px;
          color: #94a3b8;
        }

        .send-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 24px;
          border-radius: 14px;
          background: linear-gradient(135deg, #3b82f6, #60a5fa);
          color: white;
          border: none;
          cursor: pointer;
          font-size: 15px;
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .send-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
        }

        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quick-prompts {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }

        .prompt-btn {
          padding: 10px 18px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.75);
          border: 1.5px solid rgba(147, 197, 253, 0.35);
          font-size: 13px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 8px rgba(147, 197, 253, 0.1);
        }

        .prompt-btn:hover:not(:disabled) {
          background: white;
          border-color: #3b82f6;
          color: #3b82f6;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
        }

        .prompt-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* 设置对话框 */
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }

        .settings-dialog {
          width: 100%;
          max-width: 480px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 20px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
          overflow: hidden;
        }

        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(147, 197, 253, 0.3);
        }

        .dialog-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 600;
          color: #1e3a5f;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(241, 245, 249, 0.8);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s ease;
        }

        .close-btn:hover {
          background: #f1f5f9;
          color: #1e3a5f;
        }

        .settings-content {
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Switch 样式 */
        .switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #cbd5e1;
          transition: 0.3s;
          border-radius: 24px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .switch input:checked + .slider {
          background: linear-gradient(135deg, #3b82f6, #60a5fa);
        }

        .switch input:checked + .slider:before {
          transform: translateX(20px);
        }

        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
        }

        .setting-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .setting-label {
          font-weight: 500;
          color: #1e3a5f;
        }

        .setting-desc {
          font-size: 12px;
          color: #64748b;
        }

        .setting-divider {
          height: 1px;
          background: rgba(147, 197, 253, 0.3);
        }

        .setting-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .setting-field label {
          font-size: 14px;
          font-weight: 500;
          color: #475569;
        }

        .setting-field input {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(147, 197, 253, 0.4);
          background: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          outline: none;
          transition: all 0.2s ease;
        }

        .setting-field input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .setting-field input:disabled {
          background: #f1f5f9;
          color: #94a3b8;
        }

        .settings-actions {
          display: flex;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid rgba(147, 197, 253, 0.3);
        }

        .reset-btn {
          flex: 1;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(147, 197, 253, 0.4);
          background: white;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .reset-btn:hover {
          background: #f8fafc;
        }

        .confirm-btn {
          flex: 1;
          padding: 12px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #3b82f6, #60a5fa);
          color: white;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .confirm-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }
      `}</style>
    </div>
  )
}
