# Lucide 图标迁移指南

## ✅ 已完成的页面

- ✅ Login.tsx
- ✅ Register.tsx  
- ✅ Home.tsx
- ✅ Friends.tsx
- ✅ Profile.tsx

## 🔄 需要手动完成的页面

以下页面仍使用 FontAwesome，需要按照相同的模式进行替换：

### 1. AiChat.tsx
需要替换的图标：
- `faRobot` → `Bot`
- `faPaperPlane` → `Send`
- `faTrashAlt` → `Trash`
- `faTimes` → `X`
- `faCog` → `Settings`

### 2. GroupChat.tsx  
需要替换的图标：
- `faComments` → `MessageCircle`
- `faPaperPlane` → `Send`
- `faUser` → `User`
- `faCircleInfo` → `Info`

### 3. VideoMeeting.tsx
需要替换的图标：
- `faVideo` → `Video`
- `faMicrophone` → `Mic`
- `faMicrophoneSlash` → `MicOff`
- `faVideoCamera` → `Video`
- `faVideoSlash` → `VideoOff`
- `faDesktop` → `Monitor`
- `faPhoneSlash` → `PhoneOff`
- `faClock` → `Clock`

### 4. Settings.tsx
需要替换的图标：
- `faCog` → `Settings`
- `faCheck` → `Check`
- `faTimes` → `X`

### 5. Devices.tsx
需要替换的图标：
- `faLaptop` → `Laptop`
- `faTrash` → `Trash2`
- `faArrowLeft` → `ArrowLeft`

## 🔧 替换步骤（以 AiChat.tsx 为例）

### 第 1 步：更新导入语句

**Before:**
```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
  faRobot, 
  faPaperPlane, 
  faTrashAlt,
  faTimes,
  faCog
} from '@fortawesome/free-solid-svg-icons'
```

**After:**
```tsx
import { 
  Bot, 
  Send, 
  Trash,
  X,
  Settings
} from 'lucide-react'
```

### 第 2 步：替换所有 FontAwesomeIcon 组件

**Before:**
```tsx
<FontAwesomeIcon icon={faRobot} className="text-xl" />
<FontAwesomeIcon icon={faPaperPlane} />
```

**After:**
```tsx
<Bot size={20} />
<Send size={18} />
```

### 第 3 步：调整大小属性

FontAwesome 使用 className 控制大小，Lucide 使用 size 属性：

| FontAwesome | Lucide |
|------------|---------|
| text-sm | size={14} |
| text-base | size={16} |
| text-lg | size={18} |
| text-xl | size={20} |
| text-2xl | size={24} |
| text-3xl | size={30} |
| text-4xl | size={36} |

## 🚀 快速替换命令（可选）

如果你熟悉命令行，可以使用以下脚本加速替换：

```bash
# 安装 lucide-react
pnpm install lucide-react

# 批量查找需要替换的图标
grep -r "FontAwesomeIcon" src/pages/

# 批量查找 FontAwesome 导入
grep -r "@fortawesome" src/pages/
```

## 📝 替换模式参考

### 常见替换模式

1. **基础图标**
```tsx
// Before
<FontAwesomeIcon icon={faIcon} />

// After
<IconName size={20} />
```

2. **带 className 的图标**
```tsx
// Before
<FontAwesomeIcon icon={faIcon} className="mr-2 text-primary" />

// After
<IconName size={20} className="mr-2 text-primary" />
```

3. **动画图标**
```tsx
// Before
<FontAwesomeIcon icon={faIcon} className="animate-spin" />

// After
<IconName size={20} className="animate-spin" />
```

4. **条件渲染图标**
```tsx
// Before
<FontAwesomeIcon icon={enabled ? faCheck : faTimes} />

// After
{enabled ? <Check size={18} /> : <X size={18} />}
```

## ✨ Lucide 的优势

替换完成后，你将获得：

1. **更小的包体积** - Tree-shaking 只打包使用的图标
2. **更好的性能** - 无需加载整个图标库
3. **统一的视觉风格** - 所有图标都采用相同的设计语言
4. **更灵活的定制** - 支持 strokeWidth、color 等属性
5. **完整的 TypeScript 支持** - 更好的开发体验

## 🔍 验证迁移

完成替换后，运行以下命令验证：

```bash
# 检查是否还有 FontAwesome 引用
grep -r "@fortawesome" src/pages/

# 检查是否还有 FontAwesomeIcon 组件
grep -r "FontAwesomeIcon" src/pages/

# 运行 linter
pnpm lint

# 启动开发服务器测试
pnpm dev
```

## 💡 提示

- 保持原有的 className，只替换图标组件
- 图标大小通常使用 size={16} 到 size={24}
- 如果图标看起来太粗，可以添加 `strokeWidth={1.5}`
- 填充图标使用 `fill="currentColor"`（如 Star）

## 🆘 需要帮助？

如果在迁移过程中遇到问题：

1. 查看 [Lucide 官方文档](https://lucide.dev/)
2. 参考 [图标映射表](./ICON_MIGRATION.md)
3. 查看已完成的页面代码作为参考

完成上述页面的迁移后，整个项目就完全迁移到 Lucide 了！ 🎉

