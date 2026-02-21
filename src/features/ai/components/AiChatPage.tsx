'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Download,
  Loader2,
  Send,
  Settings,
  Sparkles,
  Trash,
  User,
  Wand2,
  X,
} from 'lucide-react'
import type { ChatMessage } from '@/types'
import { useApiConfigStore } from '@/store/apiConfig'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ROUTES } from '@/lib/routes'

export default function AiChat() {
  const router = useRouter()
  const { toast } = useToast()
  const { accessToken } = useAuthStore()
  const apiConfigStore = useApiConfigStore()

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: '您好！我是 AI 聊天助手。有什么可以帮助您的吗？',
      timestamp: Date.now(),
    },
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const sendToAI = async (userMessage: string): Promise<string> => {
    const apiUrl = apiConfigStore.useCustomApi ? apiConfigStore.aiApiUrl : `${apiConfigStore.aiApiUrl}`

    abortControllerRef.current = new AbortController()

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (accessToken) headers.Authorization = `Bearer ${accessToken}`
      if (apiConfigStore.useCustomApi && apiConfigStore.aiApiKey) headers['X-API-Key'] = apiConfigStore.aiApiKey

      const messageHistory = messages.map((msg) => ({ role: msg.role, content: msg.content }))
      messageHistory.push({ role: 'user', content: userMessage })

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: messageHistory, message: userMessage, stream: false }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || `请求失败 (${response.status})`)
      }

      const data = await response.json()
      return (
        data.content ||
        data.message ||
        data.response ||
        data.reply ||
        data.choices?.[0]?.message?.content ||
        '收到您的消息，但我暂时无法回复。'
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('请求已取消', { cause: err })
      }
      throw err
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    const currentInput = inputMessage
    setInputMessage('')
    setIsLoading(true)
    setError(null)

    try {
      const aiResponse = await sendToAI(currentInput)
      setMessages((prev) => [...prev, { role: 'assistant', content: aiResponse, timestamp: Date.now() }])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发送失败，请稍后重试'
      setError(errorMessage)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `抱歉，发生了错误：${errorMessage}\n\n您可以尝试：\n1. 检查网络连接\n2. 在设置中配置正确的 API 地址\n3. 稍后重试`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsLoading(false)
    }
  }

  const clearChat = () => {
    if (confirm('确定要清空聊天记录吗？')) {
      setMessages([
        {
          role: 'assistant',
          content: '聊天记录已清空。有什么可以帮助您的吗？',
          timestamp: Date.now(),
        },
      ])
      setError(null)
    }
  }

  const exportChat = () => {
    const chatContent = messages
      .map((msg) => {
        const role = msg.role === 'user' ? '我' : 'AI'
        const time = formatTime(msg.timestamp)
        return `[${time}] ${role}: ${msg.content}`
      })
      .join('\n\n')

    const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ai-chat-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast({ title: '导出成功', description: '聊天记录已保存' })
  }

  const quickPrompts = [
    { label: '介绍自己', text: '你好，请介绍一下自己' },
    { label: '功能说明', text: '你能帮我做什么？' },
    { label: '话题推荐', text: '推荐一些有趣的话题' },
    { label: '写代码', text: '帮我写一段代码' },
  ]

  return (
    <div className="relative h-full overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-3 pb-20 md:p-5">
        <Card className="flex h-full flex-col overflow-hidden border-border/80">
          <CardHeader className="space-y-3 border-b pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => router.push(ROUTES.app.chat)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-muted text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">AI 聊天助手</CardTitle>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="h-5 px-2">在线</Badge>
                    <span>上下文对话模式</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportChat} className="gap-1.5"><Download className="h-4 w-4" />导出</Button>
                <Button variant="outline" size="sm" onClick={clearChat} className="gap-1.5"><Trash className="h-4 w-4" />清空</Button>
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5"><Settings className="h-4 w-4" />设置</Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:p-4">
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4" />
                  <span className="flex-1">{error}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setError(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto rounded-xl border bg-muted/30 p-3 md:p-4">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : ''}`}
                >
                  {message.role !== 'user' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-card text-primary">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  )}

                  <div className={`max-w-[88%] space-y-1 ${message.role === 'user' ? 'items-end' : ''}`}>
                    <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${message.role === 'user' ? 'justify-end' : ''}`}>
                      {message.role === 'assistant' ? <Wand2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      <span>{message.role === 'user' ? '我' : 'AI 助手'}</span>
                      <span>{formatTime(message.timestamp)}</span>
                    </div>
                    <div className={`rounded-xl border px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${message.role === 'user' ? 'bg-primary text-primary-foreground border-primary/30' : 'bg-card'}`}>
                      {message.content}
                    </div>
                  </div>

                  {message.role === 'user' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    思考中...
                    <Button variant="ghost" size="sm" onClick={cancelRequest} className="h-6 px-2 text-xs text-destructive">取消</Button>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendMessage() }} className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="输入你的问题..."
                    disabled={isLoading}
                    maxLength={2000}
                    className="pr-16"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                    {inputMessage.length}/2000
                  </span>
                </div>
                <Button type="submit" disabled={!inputMessage.trim() || isLoading} className="gap-1.5">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  发送
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <Button key={prompt.label} type="button" variant="outline" size="sm" disabled={isLoading} onClick={() => setInputMessage(prompt.text)}>
                    {prompt.label}
                  </Button>
                ))}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API 配置</DialogTitle>
            <DialogDescription>配置 AI 接口地址和密钥</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">使用自定义 API</div>
                <div className="text-xs text-muted-foreground">启用后使用你配置的接口</div>
              </div>
              <Switch checked={apiConfigStore.useCustomApi} onCheckedChange={(checked) => apiConfigStore.setApiConfig({ useCustomApi: checked })} />
            </div>

            <div className="space-y-2">
              <Label>AI API URL</Label>
              <Input
                type="text"
                value={apiConfigStore.aiApiUrl}
                onChange={(e) => apiConfigStore.setApiConfig({ aiApiUrl: e.target.value })}
                placeholder="https://api.huanvae.cn/api/chat"
                disabled={!apiConfigStore.useCustomApi}
              />
            </div>

            <div className="space-y-2">
              <Label>AI API Key</Label>
              <Input
                type="password"
                value={apiConfigStore.aiApiKey}
                onChange={(e) => apiConfigStore.setApiConfig({ aiApiKey: e.target.value })}
                placeholder="输入 API Key（可选）"
                disabled={!apiConfigStore.useCustomApi}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => apiConfigStore.resetToDefault()}>重置</Button>
            <Button onClick={() => setShowSettings(false)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}