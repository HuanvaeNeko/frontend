import { redirect } from 'next/navigation'
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'

export default function RootPage() {
  redirect(DEFAULT_AUTHENTICATED_ROUTE)
}
