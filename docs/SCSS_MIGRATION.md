# 🎨 SCSS 架构文档

## 📁 文件结构

```
src/
├── styles/
│   ├── variables.scss      # 变量定义
│   ├── mixins.scss         # Mixins 工具
│   ├── animations.scss     # 动画定义
│   ├── components.scss     # 组件样式
│   └── utilities.scss      # 工具类
└── index.scss              # 主样式文件（入口）
```

## 📋 文件说明

### 1. `variables.scss` - 变量定义

包含所有全局变量：

```scss
// 颜色变量
$primary-color: #1890ff;
$success-color: #52c41a;
$warning-color: #faad14;
$error-color: #f5222d;

// 间距变量
$spacing-xs: 4px;
$spacing-sm: 8px;
$spacing-md: 16px;
$spacing-lg: 24px;
$spacing-xl: 32px;

// 圆角变量
$border-radius-sm: 4px;
$border-radius-base: 8px;
$border-radius-lg: 12px;
$border-radius-xl: 16px;

// 响应式断点
$breakpoint-xs: 480px;
$breakpoint-sm: 576px;
$breakpoint-md: 768px;
$breakpoint-lg: 992px;
$breakpoint-xl: 1200px;
```

### 2. `mixins.scss` - Mixins 工具

提供可复用的样式 mixins：

```scss
// Flexbox 布局
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

// 响应式
@mixin mobile {
  @media (max-width: #{$breakpoint-md - 1px}) {
    @content;
  }
}

// 文本省略
@mixin text-ellipsis($lines: 1) {
  // ...
}

// 玻璃态效果
@mixin glass {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(16px);
}

// 卡片悬停
@mixin card-hover {
  transition: all 0.3s ease-out;
  
  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    transform: translateY(-4px);
  }
}

// 自定义滚动条
@mixin custom-scrollbar($width, $track-bg, $thumb-bg, $thumb-hover-bg) {
  // ...
}
```

### 3. `animations.scss` - 动画定义

包含所有动画和对应的工具类：

```scss
// 摇晃动画
@keyframes shake { /* ... */ }
.animate-shake { animation: shake 0.5s ease-in-out; }

// 淡入动画
@keyframes fadeIn { /* ... */ }
.animate-fadeIn { animation: fadeIn 0.3s ease-out; }

// 滑入动画
@keyframes slideInLeft { /* ... */ }
.animate-slideInLeft { animation: slideInLeft 0.4s ease-out; }

// 缩放动画
@keyframes scaleIn { /* ... */ }
.animate-scaleIn { animation: scaleIn 0.3s ease-out; }

// 脉冲动画
@keyframes pulse { /* ... */ }
.animate-pulse { animation: pulse 2s ease-in-out infinite; }

// 更多动画...
```

### 4. `components.scss` - 组件样式

自定义组件样式和 Ant Design 覆盖：

```scss
// Ant Design 组件覆盖
.ant-btn {
  @include border-radius($border-radius-base);
  font-weight: 600;
  @include button-hover;
}

.ant-card {
  @include border-radius($border-radius-lg);
  @include card-hover;
}

// 聊天气泡
.chat-bubble {
  max-width: 70%;
  padding: 12px 16px;
  @include border-radius($border-radius-xl);
  
  &.chat-bubble-user {
    background: $primary-color;
    color: white;
  }
  
  &.chat-bubble-ai {
    background: $background-color;
    color: $text-color;
  }
}

// 玻璃态效果
.glass {
  @include glass;
}

// 渐变背景
.gradient-bg-blue {
  @include gradient-bg($gradient-blue);
}

// 视频容器
.video-container {
  @include aspect-ratio(16, 9);
  @include border-radius($border-radius-lg);
}

// 控制栏
.control-bar {
  @include flex-center;
  gap: $spacing-md;
}

// 更多组件...
```

### 5. `utilities.scss` - 工具类

提供常用的工具类：

```scss
// 间距工具类 (m-xs, m-sm, p-lg, etc.)
.m-md { margin: $spacing-md !important; }
.p-lg { padding: $spacing-lg !important; }

// 文本对齐
.text-center { text-align: center !important; }

// 文本大小
.text-lg { font-size: $font-size-lg !important; }

// Flex 工具类
.d-flex { display: flex !important; }
.justify-center { justify-content: center !important; }
.items-center { align-items: center !important; }

// 圆角
.rounded { border-radius: $border-radius-base !important; }
.rounded-full { border-radius: 9999px !important; }

// 阴影
.shadow { box-shadow: $box-shadow-base !important; }

// 响应式
.mobile-hide { /* 移动端隐藏 */ }
.mobile-only { /* 仅移动端显示 */ }
```

### 6. `index.scss` - 主入口

导入所有样式模块并定义全局样式：

```scss
// 导入模块
@import './styles/variables';
@import './styles/mixins';
@import './styles/animations';
@import './styles/components';
@import './styles/utilities';

// 全局样式
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: $font-family;
  font-size: $font-size-base;
  color: $text-color;
  background-color: $background-color;
}

// 滚动条、选中文本等...
```

## 🎯 使用指南

### 在组件中使用

#### 1. 使用变量

```scss
.my-component {
  padding: $spacing-md;
  background: $primary-color;
  border-radius: $border-radius-lg;
}
```

#### 2. 使用 Mixins

```scss
.my-card {
  @include flex-center;
  @include card-hover;
  @include border-radius($border-radius-lg);
  
  @include mobile {
    padding: $spacing-sm;
  }
}
```

#### 3. 使用工具类

```html
<div class="d-flex justify-center items-center p-lg rounded shadow">
  <span class="text-lg font-bold">内容</span>
</div>
```

#### 4. 使用动画类

```html
<div class="animate-fadeIn">淡入效果</div>
<div class="animate-slideInLeft">从左滑入</div>
<button class="animate-shake">摇晃按钮</button>
```

### 创建新组件样式

```scss
// 在 components.scss 中添加
.my-new-component {
  @include flex-between;
  padding: $spacing-md;
  background: $component-background;
  @include border-radius($border-radius-base);
  @include box-shadow($box-shadow-base);
  
  &:hover {
    @include box-shadow($box-shadow-hover);
  }
  
  @include mobile {
    padding: $spacing-sm;
  }
}
```

### 创建新 Mixin

```scss
// 在 mixins.scss 中添加
@mixin custom-button($bg-color, $text-color) {
  background: $bg-color;
  color: $text-color;
  padding: $spacing-sm $spacing-md;
  @include border-radius($border-radius-base);
  @include button-hover;
  
  &:hover {
    background: darken($bg-color, 10%);
  }
}

// 使用
.my-button {
  @include custom-button($primary-color, white);
}
```

## 📐 命名规范

### BEM 命名法

```scss
.block {}
.block__element {}
.block--modifier {}
.block__element--modifier {}

// 示例
.card {}
.card__header {}
.card__body {}
.card__footer {}
.card--primary {}
.card--large {}
```

### 变量命名

```scss
// 颜色: $color-name
$primary-color
$success-color

// 尺寸: $size-name
$spacing-md
$font-size-lg

// 断点: $breakpoint-name
$breakpoint-md
$breakpoint-lg
```

### Mixin 命名

```scss
// 使用动词或描述性名称
@mixin flex-center {}
@mixin text-ellipsis {}
@mixin custom-scrollbar {}
```

## 🎨 主题定制

### 修改主色调

在 `variables.scss` 中：

```scss
$primary-color: #1890ff; // 修改为你的主色
$success-color: #52c41a;
$warning-color: #faad14;
$error-color: #f5222d;
```

### 修改间距系统

```scss
$spacing-xs: 4px;   // 超小
$spacing-sm: 8px;   // 小
$spacing-md: 16px;  // 中
$spacing-lg: 24px;  // 大
$spacing-xl: 32px;  // 超大
```

### 修改圆角

```scss
$border-radius-sm: 4px;   // 小圆角
$border-radius-base: 8px;  // 标准圆角
$border-radius-lg: 12px;   // 大圆角
$border-radius-xl: 16px;   // 超大圆角
```

## 📱 响应式设计

### 使用断点 Mixins

```scss
.my-component {
  padding: $spacing-xl;
  
  @include mobile {
    padding: $spacing-md;
  }
  
  @include tablet {
    padding: $spacing-lg;
  }
  
  @include desktop {
    padding: $spacing-xl;
  }
}
```

### 响应式工具类

```html
<!-- 移动端隐藏 -->
<div class="mobile-hide">桌面端显示</div>

<!-- 仅移动端显示 -->
<div class="mobile-only">移动端显示</div>

<!-- 平板隐藏 -->
<div class="tablet-hide">非平板显示</div>
```

## 🚀 最佳实践

### 1. 使用变量而非硬编码

❌ 不好：
```scss
.button {
  padding: 16px;
  background: #1890ff;
}
```

✅ 好：
```scss
.button {
  padding: $spacing-md;
  background: $primary-color;
}
```

### 2. 使用 Mixins 复用样式

❌ 不好：
```scss
.card-1 {
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-2 {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

✅ 好：
```scss
.card-1 {
  @include flex-center;
}

.card-2 {
  @include flex-center;
}
```

### 3. 嵌套不要超过 3 层

❌ 不好：
```scss
.nav {
  .menu {
    .item {
      .link {
        .icon {
          // 太深了！
        }
      }
    }
  }
}
```

✅ 好：
```scss
.nav-menu {
  // ...
}

.nav-menu-item {
  // ...
}

.nav-menu-link {
  // ...
}
```

### 4. 使用 & 符号简化代码

```scss
.button {
  background: $primary-color;
  
  &:hover {
    background: darken($primary-color, 10%);
  }
  
  &--large {
    padding: $spacing-lg;
  }
  
  &__icon {
    margin-right: $spacing-sm;
  }
}
```

## 🔧 开发工具

### VS Code 插件推荐

- **SCSS IntelliSense** - 自动补全
- **SCSS Formatter** - 代码格式化
- **Live Sass Compiler** - 实时编译

### 配置

Vite 会自动处理 SCSS，无需额外配置。

## 📚 参考资源

- [Sass 官方文档](https://sass-lang.com/)
- [SCSS 语法指南](https://sass-lang.com/guide)
- [BEM 命名规范](http://getbem.com/)
- [Ant Design 样式覆盖](https://ant.design/docs/react/customize-theme-cn)

---

**迁移完成时间**: 2024-11-25  
**SCSS 版本**: Sass 1.83.0  
**状态**: ✅ 完成

