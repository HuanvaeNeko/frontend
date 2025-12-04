# 图标替换映射文档

## FontAwesome → Lucide 图标映射表

| FontAwesome | Lucide | 说明 |
|------------|--------|------|
| faRobot | Bot | 机器人 |
| faArrowRight | ArrowRight | 右箭头 |
| faArrowLeft | ArrowLeft | 左箭头 |
| faStar | Star | 星星 |
| faCheck | Check | 勾选 |
| faTimes / faX | X | 关闭/删除 |
| faUserPlus | UserPlus | 添加用户 |
| faUserMinus | UserMinus | 移除用户 |
| faBan | Ban | 禁止/屏蔽 |
| faSearch | Search | 搜索 |
| faUserGroup / faUsers | Users | 用户群组 |
| faUser | User | 用户 |
| faEdit | Edit | 编辑 |
| faSave | Save | 保存 |
| faCamera | Camera | 相机 |
| faKey | Key | 密钥 |
| faTrash | Trash2 | 删除 |
| faChartBar | BarChart | 柱状图 |
| faComments | MessageCircle | 消息 |
| faVideo | Video | 视频 |
| faCog / faSettings | Settings | 设置 |
| faSignOutAlt | LogOut | 登出 |
| faLaptop | Laptop | 笔记本电脑 |
| faBolt | Zap | 闪电 |
| faChartLine | TrendingUp | 趋势向上 |
| faClock | Clock | 时钟 |
| faIdCard | IdCard | 身份证 |
| faPaperPlane | Send | 发送 |
| faTrashAlt | Trash | 删除 |
| faCircleInfo | Info | 信息 |
| faMicrophone | Mic | 麦克风 |
| faMicrophoneSlash | MicOff | 麦克风关闭 |
| faVideoCamera | Video | 视频 |
| faVideoSlash | VideoOff | 视频关闭 |
| faDesktop | Monitor | 显示器 |
| faPhoneSlash | PhoneOff | 挂断电话 |

## 使用示例

### Before (FontAwesome)
```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRobot, faArrowRight } from '@fortawesome/free-solid-svg-icons'

<FontAwesomeIcon icon={faRobot} className="text-xl" />
```

### After (Lucide)
```tsx
import { Bot, ArrowRight } from 'lucide-react'

<Bot size={20} />
<ArrowRight size={18} className="transition-transform" />
```

## 大小对应

| FontAwesome Class | Lucide Size Prop |
|------------------|------------------|
| text-sm          | size={14}        |
| text-base        | size={16}        |
| text-lg          | size={18}        |
| text-xl          | size={20}        |
| text-2xl         | size={24}        |
| text-3xl         | size={30}        |
| text-4xl         | size={36}        |
| text-5xl         | size={48}        |
| text-6xl         | size={64}        |
| text-8xl         | size={96}        |

## Lucide 优势

1. **更轻量**: 只打包使用的图标
2. **一致性**: 所有图标风格统一
3. **可定制**: 支持 size, color, strokeWidth 等属性
4. **Tree-shakeable**: 更好的打包优化
5. **TypeScript**: 完整的类型支持
6. **无需额外配置**: 开箱即用

## 常用属性

```tsx
<IconName 
  size={24}              // 图标大小
  color="currentColor"   // 颜色
  strokeWidth={2}        // 线条宽度
  className="..."        // CSS 类名
  absoluteStrokeWidth    // 绝对线条宽度
/>
```

