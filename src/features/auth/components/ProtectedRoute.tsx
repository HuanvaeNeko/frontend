'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/navigation'
import { useAuthStore } from '../store/authStore'
import SimpleLoading from '@/components/common/SimpleLoading'
import { DEFAULT_UNAUTHENTICATED_ROUTE } from '@/lib/routes'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    const hasHydrated = useAuthStore.persist.hasHydrated()
    if (hasHydrated) {
      setIsHydrated(true)
      return
    }

    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setIsHydrated(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(DEFAULT_UNAUTHENTICATED_ROUTE)
    }
  }, [isAuthenticated, isHydrated, router])

  if (!isHydrated) {
    return <SimpleLoading />
  }

  if (!isAuthenticated) {
    return null
  }

  return <div className="h-full overflow-hidden">{children}</div>
}
