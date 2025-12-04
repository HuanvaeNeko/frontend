import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Bot, ArrowRight, Star } from 'lucide-react'
import { 
  slideInLeft, 
  slideInRight, 
  staggerFadeIn, 
  scaleIn, 
  shake,
  buttonClick,
  float,
  DURATION 
} from '../utils/animations'

export default function Login() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  
  const [formData, setFormData] = useState({
    user_id: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 动画引用
  const leftSideRef = useRef<HTMLDivElement>(null)
  const rightSideRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

  // 页面进入动画
  useEffect(() => {
    // 左侧品牌区动画
    if (leftSideRef.current) {
      slideInLeft(leftSideRef.current, { duration: DURATION.slow })
    }
    
    // Logo 浮动动画
    if (logoRef.current) {
      float(logoRef.current, { duration: 3 })
    }

    // 特性列表渐进动画
    if (featuresRef.current) {
      const features = featuresRef.current.querySelectorAll('.feature-item')
      staggerFadeIn(Array.from(features), { delay: 0.3 })
    }

    // 右侧表单区动画
    if (rightSideRef.current) {
      slideInRight(rightSideRef.current, { duration: DURATION.slow })
    }

    // 表单内容缩放进入
    if (formRef.current) {
      scaleIn(formRef.current, { delay: 0.4, duration: DURATION.slow })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // 按钮点击动画
    if (submitBtnRef.current) {
      buttonClick(submitBtnRef.current)
    }

    try {
      await login(formData)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查用户名和密码')
      
      // 错误时震动表单
      if (formRef.current) {
        shake(formRef.current)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* 左侧 - 品牌展示区 */}
      <div ref={leftSideRef} className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-secondary to-accent p-12 relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center text-white">
          <div ref={logoRef} className="mb-8">
            <Bot size={96} strokeWidth={1.5} />
          </div>
          <h1 className="text-6xl font-black mb-6 leading-tight">
            HuanVae<br/>Chat
          </h1>
          <div ref={featuresRef} className="space-y-4 text-xl font-light">
            <div className="feature-item flex items-center gap-3">
              <Star size={24} fill="currentColor" />
              <span>AI 智能对话</span>
            </div>
            <div className="feature-item flex items-center gap-3">
              <Star size={24} fill="currentColor" />
              <span>实时群组聊天</span>
            </div>
            <div className="feature-item flex items-center gap-3">
              <Star size={24} fill="currentColor" />
              <span>高清视频会议</span>
            </div>
          </div>
          <div className="mt-12 text-base-100/70">
            <p className="text-lg">体验新一代智能通讯平台</p>
          </div>
        </div>
      </div>

      {/* 右侧 - 登录表单区 */}
      <div ref={rightSideRef} className="flex-1 flex items-center justify-center p-8 bg-base-100">
        <div ref={formRef} className="w-full max-w-md">
          {/* Logo for mobile */}
          <div className="lg:hidden text-center mb-8">
            <Bot size={64} strokeWidth={1.5} className="text-primary mb-4 mx-auto" />
            <h1 className="text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              HuanVae Chat
            </h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">欢迎回来</h2>
            <p className="text-base-content/60">登录您的账号，继续精彩体验</p>
          </div>

        {error && (
            <div className="alert alert-error mb-6 animate-shake">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
          </div>
        )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-base">用户ID</span>
            </label>
            <input
              type="text"
              required
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                className="input input-bordered input-lg w-full focus:input-primary transition-all"
                placeholder="输入您的用户ID"
            />
          </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-base">密码</span>
            </label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input input-bordered input-lg w-full focus:input-primary transition-all"
                placeholder="输入您的密码"
            />
              <label className="label">
                <span className="label-text-alt"></span>
                <a href="#" className="label-text-alt link link-hover link-primary">忘记密码？</a>
              </label>
          </div>

          <button
            ref={submitBtnRef}
            type="submit"
            disabled={loading}
              className="btn btn-primary btn-lg w-full gap-2 group transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
          >
              {loading ? (
                <>
                  <span className="loading loading-spinner"></span>
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
          </button>
        </form>

          <div className="divider my-8">或</div>

          <div className="text-center">
            <p className="text-base-content/70 mb-4">
              还没有账号？
            </p>
            <Link to="/register" className="btn btn-outline btn-lg w-full">
              立即注册
            </Link>
          </div>

          <div className="mt-12 text-center text-sm text-base-content/50">
            <p>登录即表示您同意我们的</p>
            <p>
              <a href="#" className="link link-hover">服务条款</a> 和 <a href="#" className="link link-hover">隐私政策</a>
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
