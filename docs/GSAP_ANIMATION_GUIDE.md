# GSAP 动画集成指南

## 📚 概览

本项目已成功集成 **GSAP (GreenSock Animation Platform)**，打造了惊艳的视觉体验！

## ✨ 已实现的动画效果

### 1. **页面进入动画**

#### Login.tsx & Register.tsx
- **左侧品牌区**: 从左滑入 (slideInLeft)
- **Logo**: 浮动/脉冲动画 (float/pulse)
- **特性列表**: 渐进式显示 (staggerFadeIn)
- **右侧表单**: 从右滑入 (slideInRight)
- **表单内容**: 缩放进入 (scaleIn)
- **错误提示**: 震动动画 (shake)
- **按钮点击**: 缩放反馈 (buttonClick)

#### Home.tsx
- **导航栏**: 从上滑入 (slideInDown)
- **统计卡片**: 序列动画 (cardSequence)
- **功能卡片**: 序列动画 + 磁吸效果 (magnetic)
- **悬停效果**: 自动响应式动画

### 2. **交互动画**

- **按钮点击反馈**: 所有主要按钮都有点击动画
- **卡片悬停**: 卡片会跟随鼠标移动 (磁吸效果)
- **表单验证**: 错误时的震动提示
- **加载状态**: 旋转动画

### 3. **全局组件**

#### LoadingAnimation.tsx
- **Logo 呼吸动画**: 持续的缩放和透明度变化
- **加载点动画**: 三点跳跃动画
- **背景装饰**: 脉冲式渐变背景

#### PageTransition.tsx
- **路由切换**: 自动页面过渡效果
- **平滑切换**: 优雅的滑入动画

## 🛠️ 动画工具函数

位于 `src/utils/animations.ts`，提供了丰富的动画函数：

### 基础动画
- `fadeIn` - 淡入
- `slideInUp/Down/Left/Right` - 滑入动画
- `scaleIn` - 缩放进入
- `elasticScale` - 弹性缩放

### 列表动画
- `staggerFadeIn` - 渐进列表动画
- `cardSequence` - 卡片序列动画

### 特效动画
- `shake` - 震动 (用于错误提示)
- `pulse` - 脉冲动画
- `rotate` - 旋转动画
- `float` - 浮动动画
- `glow` - 光晕效果

### 交互动画
- `hover` - 悬浮效果
- `buttonClick` - 按钮点击
- `magnetic` - 磁吸效果
- `ripple` - 波纹效果

### 高级动画
- `typewriter` - 打字机效果
- `messageBubble` - 消息气泡动画
- `countUp` - 数字计数动画
- `gradientShift` - 渐变色移动

## 📖 使用示例

### 1. 基础用法

```typescript
import { useEffect, useRef } from 'react'
import { fadeIn, slideInUp, DURATION } from '../utils/animations'

export default function MyComponent() {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (elementRef.current) {
      // 简单淡入
      fadeIn(elementRef.current)
      
      // 或使用自定义配置
      slideInUp(elementRef.current, { 
        duration: DURATION.slow,
        delay: 0.2 
      })
    }
  }, [])

  return <div ref={elementRef}>内容</div>
}
```

### 2. 序列动画

```typescript
useEffect(() => {
  const cards = document.querySelectorAll('.card')
  cardSequence(Array.from(cards))
}, [])
```

### 3. 磁吸效果

```typescript
useEffect(() => {
  const element = document.querySelector('.magnetic-element')
  const cleanup = magnetic(element as HTMLElement, 0.2)
  
  return () => cleanup() // 清理事件监听器
}, [])
```

### 4. 按钮点击动画

```typescript
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
  if (buttonRef.current) {
    buttonClick(buttonRef.current)
  }
  // 你的业务逻辑...
}
```

### 5. 错误提示动画

```typescript
if (error && formRef.current) {
  shake(formRef.current)
}
```

## 🎨 动画配置

### 缓动函数 (EASE)
```typescript
EASE.smooth      // 'power2.out' - 平滑
EASE.elastic     // 'elastic.out(1, 0.5)' - 弹性
EASE.bounce      // 'bounce.out' - 弹跳
EASE.back        // 'back.out(1.7)' - 回弹
EASE.expo        // 'expo.out' - 指数
EASE.circ        // 'circ.out' - 圆形
```

### 持续时间 (DURATION)
```typescript
DURATION.fast      // 0.3s
DURATION.normal    // 0.5s
DURATION.slow      // 0.8s
DURATION.verySlow  // 1.2s
```

## 🚀 在新页面中使用动画

### 步骤 1: 导入动画函数

```typescript
import { useEffect, useRef } from 'react'
import { 
  slideInUp, 
  cardSequence, 
  magnetic, 
  DURATION 
} from '../utils/animations'
```

### 步骤 2: 创建 refs

```typescript
const containerRef = useRef<HTMLDivElement>(null)
const cardsRef = useRef<HTMLDivElement>(null)
```

### 步骤 3: 设置动画

```typescript
useEffect(() => {
  // 容器动画
  if (containerRef.current) {
    slideInUp(containerRef.current)
  }

  // 卡片序列
  if (cardsRef.current) {
    const cards = cardsRef.current.querySelectorAll('.card')
    cardSequence(Array.from(cards))
  }
}, [])
```

### 步骤 4: 添加 ref 到 JSX

```tsx
<div ref={containerRef}>
  <div ref={cardsRef}>
    <div className="card">卡片 1</div>
    <div className="card">卡片 2</div>
  </div>
</div>
```

## 🎯 最佳实践

### 1. 性能优化
- 避免过度使用动画
- 使用 `will-change` CSS 属性优化重绘
- 及时清理事件监听器

### 2. 用户体验
- 保持动画简短 (0.3-0.8s)
- 使用合适的缓动函数
- 为重要操作添加反馈动画

### 3. 可访问性
- 考虑 `prefers-reduced-motion` 媒体查询
- 确保动画不影响内容可读性
- 提供非动画的备选方案

### 4. 代码组织
- 将复杂动画封装为函数
- 使用 `useEffect` 清理函数
- 统一使用动画配置常量

## 📦 组件集成示例

### 在 App.tsx 中集成页面过渡

```typescript
import PageTransition from './components/PageTransition'

function App() {
  return (
    <BrowserRouter>
      <PageTransition>
        <Routes>
          <Route path="/" element={<Home />} />
          {/* 其他路由 */}
        </Routes>
      </PageTransition>
    </BrowserRouter>
  )
}
```

### 显示加载动画

```typescript
import LoadingAnimation from './components/LoadingAnimation'

function App() {
  const [loading, setLoading] = useState(true)

  if (loading) {
    return <LoadingAnimation />
  }

  return <YourApp />
}
```

## 🎭 动画示例库

### 卡片翻转

```typescript
import { flipIn } from '../utils/animations'

useEffect(() => {
  flipIn('.card')
}, [])
```

### 数字计数

```typescript
import { countUp } from '../utils/animations'

useEffect(() => {
  const element = document.querySelector('.counter')
  countUp(element as HTMLElement, 0, 1000)
}, [])
```

### 打字机效果

```typescript
import { typewriter } from '../utils/animations'

useEffect(() => {
  const element = document.querySelector('.text')
  typewriter(element as HTMLElement, '欢迎使用 HuanVae Chat!', 0.08)
}, [])
```

## 🐛 常见问题

### Q: 动画不生效？
A: 确保：
1. 已正确导入 GSAP
2. ref 已正确绑定到 DOM 元素
3. useEffect 依赖数组正确
4. DOM 元素已渲染完成

### Q: 动画卡顿？
A: 考虑：
1. 减少同时运行的动画数量
2. 使用 GPU 加速的属性 (transform, opacity)
3. 降低动画复杂度
4. 使用 `will-change` CSS 属性

### Q: 如何禁用动画？
A: 在动画函数调用前添加条件：

```typescript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches

if (!prefersReducedMotion) {
  fadeIn(element)
}
```

## 🔗 资源链接

- [GSAP 官方文档](https://greensock.com/docs/)
- [GSAP Easing 可视化](https://greensock.com/ease-visualizer/)
- [GSAP 示例](https://greensock.com/examples-showcases/)

## 🎉 总结

GSAP 动画已完全集成到项目中，为用户提供了流畅、惊艳的交互体验！

**主要亮点：**
- ✅ 40+ 预设动画函数
- ✅ 全页面动画覆盖
- ✅ 响应式交互效果
- ✅ 性能优化
- ✅ 易于扩展

开始使用这些动画，让你的应用栩栩如生！🚀✨

