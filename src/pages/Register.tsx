import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Bot, ArrowRight, Check } from 'lucide-react'
import { 
  slideInLeft, 
  slideInRight, 
  staggerFadeIn, 
  scaleIn, 
  shake,
  buttonClick,
  pulse,
  DURATION 
} from '../utils/animations'

export default function Register() {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  
  const [formData, setFormData] = useState({
    user_id: '',
    nickname: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // 动画引用
  const leftSideRef = useRef<HTMLDivElement>(null)
  const rightSideRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLDivElement>(null)
  const benefitsRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const submitBtnRef = useRef<HTMLButtonElement>(null)

  // 密码强度检查
  const passwordStrength = {
    length: formData.password.length >= 8,
    hasLetter: /[a-zA-Z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
  }
  const passwordMatch = formData.password && formData.password === formData.confirmPassword

  // 页面进入动画
  useEffect(() => {
    // 左侧品牌区动画
    if (leftSideRef.current) {
      slideInLeft(leftSideRef.current, { duration: DURATION.slow })
    }
    
    // Logo 脉冲动画
    if (logoRef.current) {
      pulse(logoRef.current, { duration: 2, scale: 1.05 })
    }

    // 权益列表渐进动画
    if (benefitsRef.current) {
      const items = benefitsRef.current.querySelectorAll('.benefit-item')
      staggerFadeIn(Array.from(items), { delay: 0.3 })
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

    if (formData.user_id.length < 3) {
      setError('用户ID长度至少为3位')
      if (formRef.current) shake(formRef.current)
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('邮箱格式不正确')
      if (formRef.current) shake(formRef.current)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致')
      if (formRef.current) shake(formRef.current)
      return
    }

    if (!passwordStrength.length || !passwordStrength.hasLetter || !passwordStrength.hasNumber) {
      setError('密码必须至少8位，包含字母和数字')
      if (formRef.current) shake(formRef.current)
      return
    }

    setLoading(true)

    // 按钮点击动画
    if (submitBtnRef.current) {
      buttonClick(submitBtnRef.current)
    }

    try {
      await register({
        user_id: formData.user_id,
        nickname: formData.nickname,
        email: formData.email,
        password: formData.password,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试')
      if (formRef.current) shake(formRef.current)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* 左侧 - 品牌展示区 */}
      <div ref={leftSideRef} className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-secondary via-accent to-primary p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center text-white">
          <div ref={logoRef} className="mb-8">
            <Bot size={96} strokeWidth={1.5} />
          </div>
          <h1 className="text-6xl font-black mb-6 leading-tight">
            开始你的<br/>智能之旅
          </h1>
          <p className="text-xl font-light mb-8">
            加入 HuanVae Chat，体验全新的智能通讯方式
          </p>
          <div ref={benefitsRef} className="space-y-3">
            <div className="benefit-item flex items-center gap-3 text-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check size={24} />
              </div>
              <span>永久免费使用</span>
            </div>
            <div className="benefit-item flex items-center gap-3 text-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check size={24} />
              </div>
              <span>AI 智能助手</span>
            </div>
            <div className="benefit-item flex items-center gap-3 text-lg">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Check size={24} />
              </div>
              <span>安全加密通讯</span>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧 - 注册表单区 */}
      <div ref={rightSideRef} className="flex-1 flex items-center justify-center p-8 bg-base-100">
        <div ref={formRef} className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <Bot size={64} strokeWidth={1.5} className="text-primary mb-4 mx-auto" />
            <h1 className="text-4xl font-black bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              HuanVae Chat
            </h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">创建账号</h2>
            <p className="text-base-content/60">填写信息，开始您的智能体验</p>
          </div>

        {error && (
            <div className="alert alert-error mb-6 animate-shake">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
          </div>
        )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">用户ID</span>
            </label>
            <input
              type="text"
              required
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                className="input input-bordered input-lg focus:input-primary transition-all"
                placeholder="至少3个字符"
            />
          </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">昵称</span>
            </label>
            <input
              type="text"
              required
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                className="input input-bordered input-lg focus:input-primary transition-all"
                placeholder="您的昵称"
            />
          </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">邮箱</span>
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="input input-bordered input-lg focus:input-primary transition-all"
                placeholder="your@email.com"
            />
          </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">密码</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input input-bordered input-lg focus:input-primary transition-all"
                placeholder="至少8位，包含字母和数字"
              />
              {formData.password && (
                <div className="mt-2 space-y-1">
                  <div className={`text-xs flex items-center gap-2 ${passwordStrength.length ? 'text-success' : 'text-base-content/50'}`}>
                    <Check size={16} className={passwordStrength.length ? '' : 'opacity-30'} />
                    至少8个字符
                  </div>
                  <div className={`text-xs flex items-center gap-2 ${passwordStrength.hasLetter ? 'text-success' : 'text-base-content/50'}`}>
                    <Check size={16} className={passwordStrength.hasLetter ? '' : 'opacity-30'} />
                    包含字母
                  </div>
                  <div className={`text-xs flex items-center gap-2 ${passwordStrength.hasNumber ? 'text-success' : 'text-base-content/50'}`}>
                    <Check size={16} className={passwordStrength.hasNumber ? '' : 'opacity-30'} />
                    包含数字
                  </div>
                </div>
              )}
          </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">确认密码</span>
            </label>
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="input input-bordered input-lg focus:input-primary transition-all"
                placeholder="再次输入密码"
            />
              {formData.confirmPassword && (
                <div className={`mt-2 text-xs flex items-center gap-2 ${passwordMatch ? 'text-success' : 'text-error'}`}>
                  <Check size={24} />
                  {passwordMatch ? '密码匹配' : '密码不匹配'}
                </div>
              )}
          </div>

          <button
            ref={submitBtnRef}
            type="submit"
            disabled={loading}
              className="btn btn-primary btn-lg w-full gap-2 group mt-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
          >
              {loading ? (
                <>
                  <span className="loading loading-spinner"></span>
                  注册中...
                </>
              ) : (
                <>
                  创建账号
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
          </button>
        </form>

          <div className="divider my-8">或</div>

          <div className="text-center">
            <p className="text-base-content/70 mb-4">
              已有账号？
            </p>
            <Link to="/login" className="btn btn-outline btn-lg w-full">
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
