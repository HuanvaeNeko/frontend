import { gsap } from 'gsap'

/**
 * GSAP 动画工具函数集合
 * 提供统一的动画配置和效果
 */

// 默认缓动函数
export const EASE = {
  smooth: 'power2.out',
  elastic: 'elastic.out(1, 0.5)',
  bounce: 'bounce.out',
  back: 'back.out(1.7)',
  expo: 'expo.out',
  circ: 'circ.out',
}

// 持续时间
export const DURATION = {
  fast: 0.3,
  normal: 0.5,
  slow: 0.8,
  verySlow: 1.2,
}

/**
 * 页面淡入动画
 */
export const fadeIn = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.smooth,
    ...options,
  })
}

/**
 * 从下方滑入
 */
export const slideInUp = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    y: 50,
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.back,
    ...options,
  })
}

/**
 * 从上方滑入
 */
export const slideInDown = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    y: -50,
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.back,
    ...options,
  })
}

/**
 * 从左侧滑入
 */
export const slideInLeft = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    x: -50,
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.back,
    ...options,
  })
}

/**
 * 从右侧滑入
 */
export const slideInRight = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    x: 50,
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.back,
    ...options,
  })
}

/**
 * 缩放进入
 */
export const scaleIn = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    scale: 0.8,
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.back,
    ...options,
  })
}

/**
 * 弹性缩放
 */
export const elasticScale = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    scale: 0,
    opacity: 0,
    duration: DURATION.slow,
    ease: EASE.elastic,
    ...options,
  })
}

/**
 * 渐进列表动画
 */
export const staggerFadeIn = (elements: HTMLElement[] | string, options = {}) => {
  return gsap.from(elements, {
    y: 20,
    opacity: 0,
    duration: DURATION.normal,
    ease: EASE.smooth,
    stagger: 0.1,
    ...options,
  })
}

/**
 * 卡片翻转动画
 */
export const flipIn = (element: HTMLElement | string, options = {}) => {
  return gsap.from(element, {
    rotateY: 90,
    opacity: 0,
    duration: DURATION.slow,
    ease: EASE.back,
    transformOrigin: 'center center',
    ...options,
  })
}

/**
 * 悬浮效果
 */
export const hover = (element: HTMLElement, options = {}) => {
  const tl = gsap.timeline({ paused: true })
  
  tl.to(element, {
    y: -8,
    scale: 1.05,
    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
    duration: DURATION.fast,
    ease: EASE.smooth,
    ...options,
  })

  element.addEventListener('mouseenter', () => tl.play())
  element.addEventListener('mouseleave', () => tl.reverse())

  return tl
}

/**
 * 脉冲动画
 */
export const pulse = (element: HTMLElement | string, options = {}) => {
  return gsap.to(element, {
    scale: 1.1,
    duration: DURATION.fast,
    ease: EASE.smooth,
    yoyo: true,
    repeat: -1,
    ...options,
  })
}

/**
 * 摇晃动画（用于错误提示）
 */
export const shake = (element: HTMLElement | string) => {
  return gsap.to(element, {
    x: [-10, 10, -10, 10, 0],
    duration: 0.5,
    ease: 'power2.inOut',
  })
}

/**
 * 旋转加载动画
 */
export const rotate = (element: HTMLElement | string, options = {}) => {
  return gsap.to(element, {
    rotation: 360,
    duration: DURATION.verySlow,
    ease: 'linear',
    repeat: -1,
    ...options,
  })
}

/**
 * 打字机效果
 */
export const typewriter = (element: HTMLElement, text: string, speed = 0.05) => {
  const chars = text.split('')
  element.textContent = ''
  
  return gsap.to(element, {
    duration: chars.length * speed,
    onUpdate: function() {
      const progress = Math.floor(this.progress() * chars.length)
      element.textContent = chars.slice(0, progress).join('')
    },
  })
}

/**
 * 渐变色动画
 */
export const gradientShift = (element: HTMLElement | string) => {
  return gsap.to(element, {
    backgroundPosition: '200% center',
    duration: 3,
    ease: 'none',
    repeat: -1,
  })
}

/**
 * 页面过渡动画
 */
export const pageTransition = {
  fadeIn: (element: HTMLElement | string) => {
    return gsap.from(element, {
      opacity: 0,
      duration: DURATION.fast,
      ease: EASE.smooth,
    })
  },
  
  slideUp: (element: HTMLElement | string) => {
    return gsap.from(element, {
      y: 30,
      opacity: 0,
      duration: DURATION.normal,
      ease: EASE.smooth,
    })
  },

  scaleIn: (element: HTMLElement | string) => {
    return gsap.from(element, {
      scale: 0.95,
      opacity: 0,
      duration: DURATION.normal,
      ease: EASE.back,
    })
  },
}

/**
 * 按钮点击动画
 */
export const buttonClick = (element: HTMLElement) => {
  return gsap.to(element, {
    scale: 0.95,
    duration: 0.1,
    ease: 'power2.inOut',
    yoyo: true,
    repeat: 1,
  })
}

/**
 * 消息气泡进入动画
 */
export const messageBubble = (element: HTMLElement | string, fromLeft = true) => {
  return gsap.from(element, {
    x: fromLeft ? -30 : 30,
    opacity: 0,
    scale: 0.9,
    duration: DURATION.normal,
    ease: EASE.back,
  })
}

/**
 * 数字计数动画
 */
export const countUp = (
  element: HTMLElement,
  from: number,
  to: number,
  options = {}
) => {
  const obj = { value: from }
  
  return gsap.to(obj, {
    value: to,
    duration: DURATION.verySlow,
    ease: EASE.smooth,
    onUpdate: function() {
      element.textContent = Math.floor(obj.value).toString()
    },
    ...options,
  })
}

/**
 * 浮动动画（持续）
 */
export const float = (element: HTMLElement | string, options = {}) => {
  return gsap.to(element, {
    y: -10,
    duration: 2,
    ease: 'power1.inOut',
    yoyo: true,
    repeat: -1,
    ...options,
  })
}

/**
 * 光晕效果
 */
export const glow = (element: HTMLElement | string) => {
  return gsap.to(element, {
    boxShadow: '0 0 20px rgba(147, 51, 234, 0.6), 0 0 40px rgba(147, 51, 234, 0.4)',
    duration: 1.5,
    ease: 'power1.inOut',
    yoyo: true,
    repeat: -1,
  })
}

/**
 * 时间轴：复杂组合动画
 */
export const createTimeline = (options = {}) => {
  return gsap.timeline(options)
}

/**
 * 页面进入主动画
 */
export const pageEnterAnimation = (container: HTMLElement | string) => {
  const tl = gsap.timeline()
  
  tl.from(container, {
    opacity: 0,
    duration: 0.3,
    ease: EASE.smooth,
  })
  
  return tl
}

/**
 * 卡片序列动画
 */
export const cardSequence = (cards: HTMLElement[] | string) => {
  return gsap.from(cards, {
    y: 50,
    opacity: 0,
    scale: 0.9,
    duration: DURATION.normal,
    ease: EASE.back,
    stagger: {
      each: 0.1,
      from: 'start',
    },
  })
}

/**
 * 磁吸效果
 */
export const magnetic = (element: HTMLElement, strength = 0.3) => {
  const handleMouseMove = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    const deltaX = (e.clientX - centerX) * strength
    const deltaY = (e.clientY - centerY) * strength
    
    gsap.to(element, {
      x: deltaX,
      y: deltaY,
      duration: 0.3,
      ease: EASE.smooth,
    })
  }
  
  const handleMouseLeave = () => {
    gsap.to(element, {
      x: 0,
      y: 0,
      duration: 0.5,
      ease: EASE.elastic,
    })
  }
  
  element.addEventListener('mousemove', handleMouseMove)
  element.addEventListener('mouseleave', handleMouseLeave)
  
  return () => {
    element.removeEventListener('mousemove', handleMouseMove)
    element.removeEventListener('mouseleave', handleMouseLeave)
  }
}

/**
 * 波纹效果
 */
export const ripple = (element: HTMLElement, x: number, y: number) => {
  const ripple = document.createElement('span')
  ripple.style.cssText = `
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    pointer-events: none;
  `
  
  const rect = element.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  
  ripple.style.width = ripple.style.height = size + 'px'
  ripple.style.left = x - rect.left - size / 2 + 'px'
  ripple.style.top = y - rect.top - size / 2 + 'px'
  
  element.appendChild(ripple)
  
  gsap.to(ripple, {
    scale: 2,
    opacity: 0,
    duration: 0.6,
    ease: EASE.smooth,
    onComplete: () => ripple.remove(),
  })
}

