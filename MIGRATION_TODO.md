# 快速迁移脚本 - 完成剩余页面

## 已完成 ✅
- Login.tsx
- Register.tsx
- Home.tsx
- Friends.tsx
- Profile.tsx

## 需要完成 🔄

### AiChat.tsx
```bash
import { Bot, Send, Trash, X, Settings, Loader } from 'lucide-react'

替换：
- faRobot → Bot
- faPaperPlane → Send  
- faTrashAlt → Trash
- faTimes → X
- faCog → Settings
```

### GroupChat.tsx
```bash
import { MessageCircle, Send, User, Info } from 'lucide-react'

替换：
- faComments → MessageCircle
- faPaperPlane → Send
- faUser → User
- faCircleInfo → Info
```

### VideoMeeting.tsx
```bash
import { Video, Mic, MicOff, VideoOff, Monitor, PhoneOff, Clock, Users } from 'lucide-react'

替换：
- faVideo → Video
- faMicrophone → Mic
- faMicrophoneSlash → MicOff
- faVideoSlash → VideoOff
- faDesktop → Monitor
- faPhoneSlash → PhoneOff
- faClock → Clock
- faUsers → Users
```

### Settings.tsx
```bash
import { Settings as SettingsIcon, Check, X, ArrowLeft } from 'lucide-react'

替换：
- faCog → SettingsIcon
- faCheck → Check
- faTimes → X
- faArrowLeft → ArrowLeft
```

### Devices.tsx
```bash
import { Laptop, Trash2, ArrowLeft, MoreVertical } from 'lucide-react'

替换：
- faLaptop → Laptop
- faTrash → Trash2
- faArrowLeft → ArrowLeft
- faEllipsisV → MoreVertical
```

## 使用方法

1. 打开对应的文件
2. 按照上面的导入替换 import 语句
3. 全局搜索 `FontAwesomeIcon icon={fa` 并逐个替换
4. 保存并测试

## 注意事项

- 保持原有的 className
- 图标大小使用 size prop
- Settings 图标需要 as SettingsIcon 避免冲突

