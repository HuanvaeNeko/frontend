# GSAP 动画快速参考卡 🎬

## 常用动画函数

### 🎯 进入动画
```typescript
fadeIn(element)              // 淡入
slideInUp(element)           // 从下滑入
slideInDown(element)         // 从上滑入
slideInLeft(element)         // 从左滑入
slideInRight(element)        // 从右滑入
scaleIn(element)             // 缩放进入
elasticScale(element)        // 弹性缩放
```

### 📋 列表动画
```typescript
staggerFadeIn(elements)      // 渐进显示
cardSequence(elements)       // 卡片序列
```

### 🎭 特效动画
```typescript
shake(element)               // 震动 (错误提示)
pulse(element)               // 脉冲
rotate(element)              // 旋转
float(element)               // 浮动
glow(element)                // 光晕
```

### 🖱️ 交互动画
```typescript
buttonClick(element)         // 按钮点击反馈
magnetic(element, 0.2)       // 磁吸效果
ripple(element, x, y)        // 波纹效果
```

### 📝 文本动画
```typescript
typewriter(element, text, 0.05)  // 打字机效果
```

### 🔢 数字动画
```typescript
countUp(element, 0, 100)     // 计数动画
```

## 配置选项

### ⏱️ 持续时间
```typescript
DURATION.fast      // 0.3s
DURATION.normal    // 0.5s
DURATION.slow      // 0.8s
DURATION.verySlow  // 1.2s
```

### 🎨 缓动函数
```typescript
EASE.smooth   // 平滑
EASE.elastic  // 弹性
EASE.bounce   // 弹跳
EASE.back     // 回弹
EASE.expo     // 指数
EASE.circ     // 圆形
```

## 典型模式

### Pattern 1: 页面进入
```typescript
useEffect(() => {
  if (containerRef.current) {
    slideInUp(containerRef.current, { 
      duration: DURATION.normal 
    })
  }
}, [])
```

### Pattern 2: 列表序列
```typescript
useEffect(() => {
  if (listRef.current) {
    const items = listRef.current.querySelectorAll('.item')
    staggerFadeIn(Array.from(items))
  }
}, [])
```

### Pattern 3: 错误反馈
```typescript
if (error && formRef.current) {
  shake(formRef.current)
}
```

### Pattern 4: 磁吸效果
```typescript
useEffect(() => {
  const cleanup = magnetic(element, 0.15)
  return () => cleanup()
}, [])
```

## 🎯 记住这些

✅ 始终使用 `ref` 引用 DOM 元素  
✅ 在 `useEffect` 中调用动画  
✅ 清理事件监听器  
✅ 使用配置常量保持一致性  
✅ 考虑性能影响

## 🚀 立即使用

```bash
# 导入
import { slideInUp, DURATION } from '../utils/animations'

# 创建 ref
const myRef = useRef<HTMLDivElement>(null)

# 添加动画
useEffect(() => {
  if (myRef.current) {
    slideInUp(myRef.current)
  }
}, [])

# 绑定到 JSX
<div ref={myRef}>...</div>
```

---

**完整文档**: `docs/GSAP_ANIMATION_GUIDE.md`

