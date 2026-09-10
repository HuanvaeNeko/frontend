import { useEffect } from 'react'
import { useRouter } from '@/lib/navigation'
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'

export default function WebAppEntry() {
  const router = useRouter()

  useEffect(() => {
    // Try to restore last visited path
    const lastPath = localStorage.getItem('last_visited_path')

    // 只接受新壳的 URL（/app/chat、/app/contacts、/app/settings）；其余一律回默认路由——
    // 旧分页路由（/app/friends 等）第 11 步删除后不再是合法落点，继续放行会把用户
    // 送进一个即将消失的页面。
    if (lastPath && (lastPath.startsWith('/app/chat') || lastPath.startsWith('/app/contacts') || lastPath.startsWith('/app/settings'))) {
      router.replace(lastPath)
    } else {
      router.replace(DEFAULT_AUTHENTICATED_ROUTE)
    }
  }, [router])

  return null
}
