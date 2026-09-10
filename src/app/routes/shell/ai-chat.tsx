import AiChat from '@/features/ai/components/AiChatPage'

/** AI 助手是内容区整栏页（不是模态框）：列表栏保持当前 tab */
export default function AiChatRoute() {
  return <div className="h-full min-h-0 overflow-hidden p-3"><AiChat /></div>
}
