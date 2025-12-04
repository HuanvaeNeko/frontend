# Framer Motion 快速参考

## 基本用法

```tsx
import { motion } from 'framer-motion'
import { fadeInVariants } from '@/utils/motionAnimations'

function MyComponent() {
  return (
    <motion.div
      variants={fadeInVariants}
      initial="hidden"
      animate="visible"
    >
      内容
    </motion.div>
  )
}
```

## 列表动画

```tsx
import { motion } from 'framer-motion'
import { staggerContainer, staggerItem } from '@/utils/motionAnimations'

function List({ items }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {items.map(item => (
        <motion.div key={item.id} variants={staggerItem}>
          {item.content}
        </motion.div>
      ))}
    </motion.div>
  )
}
```

## 交互动画

```tsx
import { motion } from 'framer-motion'
import { hoverScale, tapScale } from '@/utils/motionAnimations'

function Button() {
  return (
    <motion.button
      whileHover={hoverScale}
      whileTap={tapScale}
    >
      点击我
    </motion.button>
  )
}
```

## 进入/退出动画

```tsx
import { motion, AnimatePresence } from 'framer-motion'

function Modal({ isOpen }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          模态框内容
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

## 布局动画

```tsx
import { motion } from 'framer-motion'

function Card({ expanded }) {
  return (
    <motion.div layout>
      <h2>标题</h2>
      {expanded && <p>额外内容</p>}
    </motion.div>
  )
}
```

## 可用的动画变体

- `fadeInVariants` - 淡入
- `slideUpVariants` - 从下方滑入
- `slideDownVariants` - 从上方滑入
- `slideLeftVariants` - 从左侧滑入
- `slideRightVariants` - 从右侧滑入
- `scaleInVariants` - 缩放进入
- `elasticScaleVariants` - 弹性缩放
- `shakeVariants` - 摇晃
- `staggerContainer` - 列表容器
- `staggerItem` - 列表项
- `cardContainer` - 卡片容器
- `cardItem` - 卡片项
- `pageVariants` - 页面过渡
- `floatVariants` - 浮动
- `rotateVariants` - 旋转
- `pulseVariants` - 脉冲

