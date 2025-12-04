# 🎨 样式架构：Tailwind CSS v4 + SCSS + Ant Design 6.0

## 📦 技术栈

- **Tailwind CSS v4** - 原子化 CSS 框架，用于布局和通用样式
- **SCSS** - CSS 预处理器，用于主题变量和自定义组件
- **Ant Design 6.0** - React UI 组件库
- **GSAP** - 动画库

## 🏗️ 架构说明

### 1. Tailwind CSS v4

用于页面布局和通用样式：

```jsx
<div className="flex items-center justify-center min-h-screen bg-gray-100">
  <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
    {/* 内容 */}
  </div>
</div>
```

**常用类名**:
- 布局: `flex`, `grid`, `container`
- 间距: `p-4`, `m-2`, `space-x-4`
- 尺寸: `w-full`, `h-screen`, `max-w-lg`
- 颜色: `bg-blue-500`, `text-gray-700`
- 圆角: `rounded`, `rounded-lg`, `rounded-full`

### 2. SCSS 模块

用于主题变量和自定义组件样式：

#### 文件结构
```
src/
├── styles/
│   ├── _variables.scss  # 主题变量
│   └── _mixins.scss     # Mixins 工具
└── index.scss           # 主入口
```

#### 变量使用
```scss
// src/styles/_variables.scss
$primary-color: #1890ff;
$border-radius-lg: 12px;
$spacing-md: 16px;
```

#### Mixins 使用
```scss
.my-card {
  @include flex-center;
  @include border-radius($border-radius-lg);
  @include card-hover;
}
```

### 3. Ant Design 6.0

用于复杂的 UI 组件：

```jsx
import { Button, Input, Card, Modal } from 'antd'

<Card title="标题">
  <Input placeholder="请输入" />
  <Button type="primary">提交</Button>
</Card>
```

## 🎯 使用指南

### 场景 1: 页面布局

使用 **Tailwind CSS**:

```jsx
<div className="min-h-screen flex">
  <aside className="w-64 bg-gray-800">侧边栏</aside>
  <main className="flex-1 p-8">主内容</main>
</div>
```

### 场景 2: 表单输入

使用 **Ant Design**:

```jsx
import { Form, Input, Button } from 'antd'

<Form onFinish={handleSubmit}>
  <Form.Item label="用户名" name="username" rules={[{ required: true }]}>
    <Input />
  </Form.Item>
  <Form.Item>
    <Button type="primary" htmlType="submit">登录</Button>
  </Form.Item>
</Form>
```

### 场景 3: 自定义组件

使用 **SCSS**:

```scss
// component.scss
@use 'styles/variables' as *;
@use 'styles/mixins' as *;

.my-component {
  @include flex-center;
  padding: $spacing-md;
  background: $primary-color;
  @include border-radius($border-radius-lg);
  
  &:hover {
    background: color.adjust($primary-color, $lightness: -10%);
  }
}
```

```jsx
import './component.scss'

<div className="my-component">内容</div>
```

### 场景 4: 响应式设计

混合使用 **Tailwind** 和 **SCSS**:

```jsx
// JSX - Tailwind 响应式
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <Card>卡片 1</Card>
  <Card>卡片 2</Card>
  <Card>卡片 3</Card>
</div>
```

```scss
// SCSS - 自定义响应式
.my-component {
  padding: $spacing-xl;
  
  @include mobile {
    padding: $spacing-md;
  }
}
```

## 📐 样式优先级

1. **Tailwind CSS** - 用于快速开发和布局
2. **Ant Design** - 用于标准 UI 组件
3. **SCSS** - 用于主题定制和复杂样式

## 🎨 主题定制

### Ant Design 主题

在 `src/main.tsx` 中配置：

```typescript
const theme = {
  token: {
    colorPrimary: '#1890ff',
    borderRadius: 8,
    fontSize: 14,
  },
  components: {
    Button: {
      controlHeight: 40,
      fontWeight: 600,
    },
  },
}

<ConfigProvider theme={theme}>
  <App />
</ConfigProvider>
```

### SCSS 变量

在 `src/styles/_variables.scss` 中修改：

```scss
$primary-color: #1890ff;  // 主色
$spacing-md: 16px;        // 间距
$border-radius-lg: 12px;  // 圆角
```

### Tailwind 颜色

Tailwind v4 会自动读取 CSS 变量，你可以在 SCSS 中定义：

```scss
:root {
  --color-primary: #1890ff;
}
```

然后在 Tailwind 中使用：

```jsx
<div className="bg-[var(--color-primary)]">
```

## 🚀 最佳实践

### ✅ 推荐

```jsx
// 1. Tailwind 用于布局
<div className="flex items-center gap-4 p-6">
  
  // 2. Ant Design 用于表单和复杂组件
  <Form>
    <Input />
    <Button type="primary">提交</Button>
  </Form>
  
  // 3. 自定义 class 用于特殊样式
  <div className="chat-bubble">消息内容</div>
</div>
```

### ❌ 避免

```jsx
// 不要混用太多方式来实现同一个效果
<Button 
  type="primary" 
  className="mt-4 shadow-lg hover:scale-105"  // 过度使用
  style={{ marginTop: '16px' }}               // 内联样式
>
  提交
</Button>
```

## 🔧 开发工具

### VS Code 插件

- **Tailwind CSS IntelliSense** - Tailwind 自动补全
- **SCSS IntelliSense** - SCSS 自动补全
- **Prettier** - 代码格式化

### 配置

Vite 会自动处理 Tailwind 和 SCSS，无需额外配置。

## 📚 资源链接

- [Tailwind CSS v4 文档](https://tailwindcss.com/)
- [Ant Design 6.0 文档](https://ant.design/)
- [Sass 文档](https://sass-lang.com/)
- [GSAP 动画文档](https://gsap.com/)

## 🎯 迁移完成清单

- ✅ Tailwind CSS v4 配置
- ✅ SCSS 模块系统（@use）
- ✅ Ant Design 6.0 升级
- ✅ PostCSS 配置
- ✅ 主题变量定义
- ✅ Mixins 工具库
- ✅ 自定义组件样式
- ✅ 响应式工具

---

**更新时间**: 2024-11-26  
**版本**: Tailwind v4.1.17 + SCSS 1.94.2 + Ant Design 6.0.0  
**状态**: ✅ 完成

