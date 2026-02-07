'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
      <div className="text-center px-6 py-12 max-w-sm">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-slate-300/80 flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-slate-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-700 mb-2">当前处于离线状态</h1>
        <p className="text-slate-500 text-sm mb-8">
          请检查网络连接后重试
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-white bg-slate-600 hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={18} />
          重新加载
        </Link>
      </div>
    </div>
  )
}
