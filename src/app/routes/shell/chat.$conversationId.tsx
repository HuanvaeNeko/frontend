import { useEffect } from 'react'
import { useParams } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { ListLoading } from '@/components/shell/ListStates'
import { useRouteConversation } from '@/features/chat/hooks/useRouteConversation'
import { dynamic } from '@/lib/dynamic'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

// `ChatWindow` 静态导入 `FilePreview`（`@/components/ui/file-preview`），它在模块
// 顶层引入 `react-pdf`，而 pdf.js 的 `canvas.js` 在模块求值时直接引用浏览器专属的
// `DOMMatrix`——Node 下不存在，SSR 会立即抛 `DOMMatrix is not defined`（已实测：
// 只要这个路由模块被 React Router 的 server build 图静态引到，连 `/` 首页都会
// 500，不只是聊天路由本身）。旧的 `routes/chat.tsx` 一直靠 `dynamic()`
// （`ssr:false`，全仓 13 处同款）把 `ChatPage`/`ChatWindow` 挡在 SSR 图外；
// 这里换成同一个适配层，行为不变（仍然只在客户端水合后挂载），只是不再把
// pdf.js 带进服务端模块图。
const ChatWindow = dynamic<{ hideMobileHeader?: boolean }>(() => import('@/features/chat/components/ChatWindow'))

export default function ChatConversation() {
  const { conversationId } = useParams()
  const router = useRouter()
  const status = useRouteConversation(conversationId)
  useEffect(() => {
    // 加载完仍找不到（被删的好友 / 已退的群 / 手打的错 id）：回到列表，不停在一个空聊天窗口
    if (status === 'missing') router.replace(ROUTES.app.chat)
  }, [status, router])
  if (status === 'loading') return <ListLoading />
  if (status !== 'ready') return <EmptyContent hint="chat" />
  return <ChatWindow hideMobileHeader />
}
