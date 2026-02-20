'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, MessageCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/lib/routes'

export default function GroupChat() {
  const router = useRouter()

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 pb-8 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2 text-2xl">
              <Users className="h-6 w-6 text-primary" />
              群聊工作台已升级
            </CardTitle>
            <CardDescription>
              群聊入口已统一到新聊天页面，包含新的会话列表、消息窗口和群管理布局。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => router.push(ROUTES.app.chatGroups)} className="gap-2">
              <MessageCircle className="h-4 w-4" />
              进入新群聊页
            </Button>
            <Button variant="outline" onClick={() => router.push(ROUTES.app.chat)} className="gap-2">
              返回聊天首页
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
