import { redirect } from 'next/navigation'
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'

export default function WebAppEntryPage() {
  redirect(DEFAULT_AUTHENTICATED_ROUTE)
}
