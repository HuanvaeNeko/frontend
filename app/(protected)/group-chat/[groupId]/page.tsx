import GroupChatClient from './client'

export function generateStaticParams() {
  return []
}

export const dynamicParams = true

export default function GroupChatPage() {
  return <GroupChatClient />
}
