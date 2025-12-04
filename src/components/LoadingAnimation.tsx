import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Bot } from 'lucide-react'

export default function LoadingAnimation() {
  const logoRef = useRef<HTMLDivElement>(null)
  const dotsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Logo 呼吸动画
    if (logoRef.current) {
      gsap.to(logoRef.current, {
        scale: 1.2,
        opacity: 0.7,
        duration: 1.5,
        ease: 'power2.inOut',
        yoyo: true,
        repeat: -1,
      })
    }

    // 点点动画
    if (dotsRef.current) {
      const dots = dotsRef.current.querySelectorAll('.dot')
      gsap.to(dots, {
        y: -10,
        opacity: 0.3,
        duration: 0.6,
        ease: 'power1.inOut',
        stagger: 0.2,
        yoyo: true,
        repeat: -1,
      })
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-base-100 via-base-200 to-base-300 flex items-center justify-center z-50">
      <div className="text-center">
        {/* Logo */}
        <div ref={logoRef} className="mb-8 inline-block">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center text-white shadow-2xl">
            <Bot size={48} strokeWidth={2} />
          </div>
        </div>

        {/* 品牌名称 */}
        <h1 className="text-4xl font-black mb-4 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
          HuanVae Chat
        </h1>

        {/* 加载点 */}
        <div ref={dotsRef} className="flex gap-2 justify-center">
          <div className="dot w-3 h-3 rounded-full bg-primary"></div>
          <div className="dot w-3 h-3 rounded-full bg-secondary"></div>
          <div className="dot w-3 h-3 rounded-full bg-accent"></div>
        </div>

        {/* 加载文字 */}
        <p className="mt-6 text-base-content/60 text-sm">正在加载惊艳体验...</p>
      </div>

      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-secondary/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
    </div>
  )
}

