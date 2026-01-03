'use client'

import { Home, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center px-4 animate-fadeIn">
        <div className="text-9xl font-black gradient-text mb-4">
          404
        </div>
        
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          页面未找到
        </h1>
        <p className="text-gray-600 mb-8">
          抱歉，您访问的页面不存在或已被移除
        </p>
        
        <div className="flex gap-4 justify-center">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft size={18} />
            返回上页
          </Button>
          <Link href="/chat">
            <Button className="gap-2">
              <Home size={18} />
              返回首页
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
