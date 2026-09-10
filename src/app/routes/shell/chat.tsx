import { useOutlet } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'

export default function ChatIndex() {
  const outlet = useOutlet()
  return outlet ?? <EmptyContent hint="chat" />
}
