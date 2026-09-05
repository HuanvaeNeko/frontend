import { dynamic } from '@/lib/dynamic'

const AiChatPage = dynamic(() => import('@/features/ai/components/AiChatPage'))

export default function AiChat() {
  return <AiChatPage />
}
