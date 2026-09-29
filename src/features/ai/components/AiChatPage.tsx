'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
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
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { aiChatApi } from '@/features/ai/api/aiChat'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/I18nProvider'

export default function AiChat() {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const apiConfigStore = useApiConfigStore()

  // 开场白只存「哪一句 + 时间」，文字渲染时按当前语言取：I18nProvider 首帧还是默认中文，
  // 直接打开本页时首帧就会跑到这里——把译文存进 state，英文界面就会被钉上一句中文开场白。
  const [intro, setIntro] = useState(() => ({ cleared: false, timestamp: Date.now() }))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const allMessages: ChatMessage[] = [
    { role: 'assistant', content: intro.cleared ? t('aiChat.cleared') : t('aiChat.greeting'), timestamp: intro.timestamp },
    ...messages,
  ]
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // 后端按会话保存上下文：第一句不带、之后都带上它返回的 conversation_id；清空聊天即新会话
  const conversationIdRef = useRef<string | null>(null)

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
    return new Date(timestamp).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const sendToAI = async (userMessage: string): Promise<string> => {
    abortControllerRef.current = new AbortController()

    // 默认：后端 AI 助手 POST /api/ai/chat（原来打的是不存在的 /api/chat，还在信封顶层找 reply）
    if (!apiConfigStore.useCustomApi) {
      try {
        const result = await aiChatApi.send(userMessage, conversationIdRef.current, abortControllerRef.current.signal)
        conversationIdRef.current = result.conversation_id
        return result.reply
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(t('aiChat.errors.cancelled'), { cause: err })
        }
        throw err
      }
    }

    // 自定义 API：用户自备的第三方地址，形状未知，沿用宽松解析
    const apiUrl = apiConfigStore.aiApiUrl

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (apiConfigStore.useCustomApi && apiConfigStore.aiApiKey) headers['X-API-Key'] = apiConfigStore.aiApiKey

      const messageHistory = allMessages.map((msg) => ({ role: msg.role, content: msg.content }))
      messageHistory.push({ role: 'user', content: userMessage })

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        // 会话制下没有 accessToken 可读——凭证是 httpOnly cookie，同源请求
        // 浏览器自动带上。
        credentials: 'same-origin',
        body: JSON.stringify({ messages: messageHistory, message: userMessage, stream: false }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || t('aiChat.errors.requestFailed', { status: response.status }))
      }

      const data = await response.json()
      return (
        data.content ||
        data.message ||
        data.response ||
        data.reply ||
        data.choices?.[0]?.message?.content ||
        t('aiChat.errors.noReply')
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(t('aiChat.errors.cancelled'), { cause: err })
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
      const errorMessage = err instanceof Error ? err.message : t('aiChat.errors.sendFailed')
      setError(errorMessage)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: t('aiChat.errors.bubble', { message: errorMessage }),
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
    if (confirm(t('aiChat.confirmClear'))) {
      setMessages([])
      setIntro({ cleared: true, timestamp: Date.now() })
      conversationIdRef.current = null
      setError(null)
    }
  }

  const exportChat = () => {
    const chatContent = allMessages
      .map((msg) => {
        const role = msg.role === 'user' ? t('aiChat.me') : 'AI'
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

    toast({ title: t('aiChat.exportSuccess'), description: t('aiChat.exportSuccessDesc') })
  }

  const quickPrompts = [
    { label: t('aiChat.prompts.introLabel'), text: t('aiChat.prompts.introText') },
    { label: t('aiChat.prompts.featuresLabel'), text: t('aiChat.prompts.featuresText') },
    { label: t('aiChat.prompts.topicsLabel'), text: t('aiChat.prompts.topicsText') },
    { label: t('aiChat.prompts.codeLabel'), text: t('aiChat.prompts.codeText') },
  ]

  return (
    <div className="relative h-full overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-3 pb-20 md:p-5">
        <Card className="flex h-full flex-col overflow-hidden border-border/80">
          <CardHeader className="space-y-3 border-b pb-4">
            <div className="flex items-center justify-between gap-3">
              {/* 窄屏：标题区可收缩、文字不换行；右侧按钮只留图标（原来三个带字按钮把标题挤成竖排、设置按钮溢出屏幕） */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-muted text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate text-lg">{t('aiChat.assistant')}</CardTitle>
                  <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                    <Badge variant="secondary" className="h-5 px-2">{t('layout.online')}</Badge>
                    <span className="truncate">{apiConfigStore.useCustomApi ? t('aiChat.subtitleCustomApi') : t('aiChat.subtitle')}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <Button variant="outline" size="sm" onClick={exportChat} className="gap-1.5" aria-label={t('aiChat.export')} title={t('aiChat.export')}><Download className="h-4 w-4" /><span className="hidden sm:inline">{t('aiChat.export')}</span></Button>
                <Button variant="outline" size="sm" onClick={clearChat} className="gap-1.5" aria-label={t('aiChat.clear')} title={t('aiChat.clear')}><Trash className="h-4 w-4" /><span className="hidden sm:inline">{t('aiChat.clear')}</span></Button>
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5" aria-label={t('chat.page.settings')} title={t('chat.page.settings')}><Settings className="h-4 w-4" /><span className="hidden sm:inline">{t('chat.page.settings')}</span></Button>
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
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setError(null)} aria-label={t('common.close')}>
                    <X className="h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesContainerRef} className="flex-1 space-y-4 overflow-y-auto rounded-xl border bg-muted/30 p-3 md:p-4">
              {allMessages.map((message, index) => (
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
                      <span>{message.role === 'user' ? t('aiChat.me') : t('aiChat.assistant')}</span>
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
                    {t('aiChat.thinking')}
                    <Button variant="ghost" size="sm" onClick={cancelRequest} className="h-6 px-2 text-xs text-destructive">{t('chat.window.cancel')}</Button>
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
                    placeholder={t('aiChat.placeholder')}
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
                  {t('chat.window.send')}
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
            <DialogTitle>{t('aiChat.config.title')}</DialogTitle>
            <DialogDescription>{t('aiChat.config.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{t('aiChat.config.useCustom')}</div>
                <div className="text-xs text-muted-foreground">{t('aiChat.config.useCustomDesc')}</div>
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
                placeholder={t('aiChat.config.keyPlaceholder')}
                disabled={!apiConfigStore.useCustomApi}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => apiConfigStore.resetToDefault()}>{t('aiChat.config.reset')}</Button>
            <Button onClick={() => setShowSettings(false)}>{t('aiChat.config.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}