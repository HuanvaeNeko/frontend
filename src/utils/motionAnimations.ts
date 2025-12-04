import type { Variants, Transition } from 'framer-motion'

/**
 * Framer Motion 动画配置
 * 替代 GSAP，提供更好的 React 集成
 */

// 缓动函数
export const EASING = {
  smooth: [0.6, 0.01, 0.05, 0.95],
  elastic: [0.68, -0.55, 0.265, 1.55],
  bounce: [0.68, -0.55, 0.265, 1.55],
  expo: [0.87, 0, 0.13, 1],
}

// 持续时间
export const DURATION = {
  fast: 0.3,
  normal: 0.5,
  slow: 0.8,
  verySlow: 1.2,
}

// 通用过渡配置
export const transition = (duration = DURATION.normal): Transition => ({
  duration,
  ease: EASING.smooth,
})

/**
 * 淡入动画
 */
export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transition(DURATION.normal),
  },
}

/**
 * 从下方滑入
 */
export const slideUpVariants: Variants = {
  hidden: { y: 50, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      ...transition(DURATION.normal),
      ease: EASING.elastic,
    },
  },
}

/**
 * 从上方滑入
 */
export const slideDownVariants: Variants = {
  hidden: { y: -50, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      ...transition(DURATION.normal),
      ease: EASING.elastic,
    },
  },
}

/**
 * 从左侧滑入
 */
export const slideLeftVariants: Variants = {
  hidden: { x: -50, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      ...transition(DURATION.normal),
      ease: EASING.elastic,
    },
  },
}

/**
 * 从右侧滑入
 */
export const slideRightVariants: Variants = {
  hidden: { x: 50, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      ...transition(DURATION.normal),
      ease: EASING.elastic,
    },
  },
}

/**
 * 缩放进入
 */
export const scaleInVariants: Variants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      ...transition(DURATION.normal),
      ease: EASING.elastic,
    },
  },
}

/**
 * 弹性缩放
 */
export const elasticScaleVariants: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      duration: DURATION.slow,
      ease: EASING.elastic,
    },
  },
}

/**
 * 摇晃动画 (用于错误提示)
 */
export const shakeVariants: Variants = {
  shake: {
    x: [-10, 10, -10, 10, 0],
    transition: {
      duration: 0.5,
    },
  },
}

/**
 * 渐进列表动画配置
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

/**
 * 列表项动画
 */
export const staggerItem: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: transition(DURATION.normal),
  },
}

/**
 * 卡片序列动画
 */
export const cardContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

export const cardItem: Variants = {
  hidden: { y: 50, opacity: 0, scale: 0.9 },
  visible: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: {
      ...transition(DURATION.normal),
      ease: EASING.elastic,
    },
  },
}

/**
 * 页面过渡动画
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transition(DURATION.fast),
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: transition(DURATION.fast),
  },
}

/**
 * 悬浮动画配置
 */
export const hoverScale = {
  scale: 1.05,
  y: -8,
  transition: transition(DURATION.fast),
}

/**
 * 点击动画配置
 */
export const tapScale = {
  scale: 0.95,
  transition: { duration: 0.1 },
}

/**
 * 浮动动画 (持续)
 */
export const floatVariants: Variants = {
  animate: {
    y: [-10, 10],
    transition: {
      duration: 2,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
}

/**
 * 旋转动画 (持续)
 */
export const rotateVariants: Variants = {
  animate: {
    rotate: 360,
    transition: {
      duration: DURATION.verySlow,
      repeat: Infinity,
      ease: 'linear',
    },
  },
}

/**
 * 脉冲动画
 */
export const pulseVariants: Variants = {
  animate: {
    scale: [1, 1.1, 1],
    transition: {
      duration: DURATION.fast,
      repeat: Infinity,
      repeatType: 'reverse',
    },
  },
}

/**
 * 渐变色动画
 */
export const gradientVariants: Variants = {
  animate: {
    backgroundPosition: ['0% center', '200% center'],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'linear',
    },
  },
}

