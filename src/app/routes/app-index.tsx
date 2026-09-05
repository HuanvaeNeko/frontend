import { useEffect } from 'react'
import { useRouter } from '@/lib/navigation'
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'

export default function WebAppEntry() {
  const router = useRouter()

  useEffect(() => {
    // Try to restore last visited path
    const lastPath = localStorage.getItem('last_visited_path')

    // Validate lastPath - ensure it's not the deleted home page or other invalid paths
    if (lastPath && lastPath.startsWith('/app') && !lastPath.includes('/app/home')) {
      router.replace(lastPath)
    } else {
      router.replace(DEFAULT_AUTHENTICATED_ROUTE)
    }
  }, [router])

  return null
}
