import ChatPageClient from './client'

export function generateStaticParams() {
  return []
}

export const dynamicParams = true

export default function ChatGroupPage() {
  return <ChatPageClient />
}
