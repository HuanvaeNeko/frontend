import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pageTransition } from '../utils/animations'

/**
 * 页面切换过渡效果组件
 * 在路由变化时自动触发页面动画
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  useEffect(() => {
    // 在路由变化时触发页面过渡动画
    const element = document.querySelector('#page-content')
    if (element) {
      pageTransition.slideUp(element as HTMLElement)
    }
  }, [location.pathname])

  return (
    <div id="page-content" className="w-full h-full">
      {children}
    </div>
  )
}

