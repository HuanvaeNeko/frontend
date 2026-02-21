'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, ServerCrash, WifiOff } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface MaintenancePageProps {
  error: {
    message: string
    details?: string
    status?: number
    url?: string
    timestamp?: string
  }
  onRetry: () => void
  isRetrying?: boolean
}

export default function MaintenancePage({ error, onRetry, isRetrying }: MaintenancePageProps) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="relative flex app-min-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_15%_15%,hsl(25_95%_53%/0.12),transparent_32%),radial-gradient(circle_at_85%_10%,hsl(0_84%_60%/0.10),transparent_34%),radial-gradient(circle_at_50%_100%,hsl(222_80%_45%/0.07),transparent_40%)]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-xl"
      >
        <Card className="border-border/80 bg-card shadow-lg ">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="gap-1.5">
                <WifiOff className="h-3.5 w-3.5" />
                服务异常
              </Badge>
              {typeof error.status === 'number' && <Badge variant="outline">HTTP {error.status}</Badge>}
            </div>

            <div className="flex items-start gap-3">
              <div className="rounded-xl border bg-muted p-2.5">
                <ServerCrash className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-xl">服务暂时不可用</CardTitle>
                <CardDescription className="mt-1">无法连接后端服务，请稍后重试。</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>错误信息</AlertTitle>
              <AlertDescription>{error.message || '连接失败'}</AlertDescription>
            </Alert>

            <Button onClick={onRetry} disabled={isRetrying} className="w-full gap-2">
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? '正在重试...' : '重新连接'}
            </Button>

            {(error.details || error.url) && (
              <>
                <Separator />

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  查看诊断信息
                  {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                <AnimatePresence initial={false}>
                  {showDetails && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      {error.url && (
                        <div className="rounded-lg border bg-muted/50 p-3 text-xs">
                          <div className="mb-1 font-medium">请求地址</div>
                          <code className="break-all text-muted-foreground">{error.url}</code>
                        </div>
                      )}
                      {error.timestamp && (
                        <div className="rounded-lg border bg-muted/50 p-3 text-xs">
                          <div className="mb-1 font-medium">发生时间</div>
                          <code className="text-muted-foreground">{error.timestamp}</code>
                        </div>
                      )}
                      {error.details && (
                        <div className="rounded-lg border bg-muted/50 p-3 text-xs">
                          <div className="mb-1 font-medium">详细信息</div>
                          <pre className="whitespace-pre-wrap break-all text-muted-foreground">{error.details}</pre>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
