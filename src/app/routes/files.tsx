import { dynamic } from '@/lib/dynamic'

const ChatPage = dynamic(() => import('@/features/chat/components/ChatPage'))

export default function FilesPage() {
  return <ChatPage />
}
