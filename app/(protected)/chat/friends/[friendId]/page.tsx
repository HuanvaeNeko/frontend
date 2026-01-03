import ChatPageClient from './client'

export function generateStaticParams() {
  return []
}

export const dynamicParams = true

export default function ChatFriendPage() {
  return <ChatPageClient />
}
