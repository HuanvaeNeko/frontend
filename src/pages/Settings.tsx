import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Settings as SettingsIcon, Wand2, Globe, Shield, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import * as Switch from '@radix-ui/react-switch'
import { useApiConfigStore } from '../store/apiConfig'
import { 
  fadeInVariants, 
  staggerContainer,
  staggerItem,
} from '../utils/motionAnimations'

export default function Settings() {
  const navigate = useNavigate()
  const apiConfigStore = useApiConfigStore()

  const handleSave = () => {
    alert('设置已保存')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/')}
            className="gap-2"
          >
            <ArrowLeft size={18} />
            返回首页
          </Button>
        </div>

        <motion.div
          variants={fadeInVariants}
          initial="hidden"
          animate="visible"
          className="mb-8 flex items-center gap-4"
        >
          <SettingsIcon size={32} className="text-blue-500" />
          <div>
            <h1 className="text-4xl font-bold">设置中心</h1>
            <p className="text-muted-foreground">配置您的应用偏好设置</p>
          </div>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <motion.div variants={staggerItem}>
            <Card className="setting-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 size={20} className="text-blue-500" />
                AI 配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>启用 AI 助手</Label>
                  <p className="text-sm text-muted-foreground">自动回复和智能建议</p>
                </div>
                <Switch.Root
                  className="w-11 h-6 bg-gray-200 rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer"
                  defaultChecked
                  onCheckedChange={apiConfigStore.toggleAi}
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>

              <div className="space-y-2">
                <Label>AI 模型</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5">GPT-3.5</option>
                  <option value="claude">Claude</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="setting-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe size={20} className="text-green-500" />
                语言和地区
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>界面语言</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁体中文</option>
                  <option value="en-US">English</option>
                  <option value="ja-JP">日本語</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>24 小时制</Label>
                  <p className="text-sm text-muted-foreground">使用 24 小时时间格式</p>
                </div>
                <Switch.Root
                  className="w-11 h-6 bg-gray-200 rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer"
                  defaultChecked
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>
            </CardContent>
          </Card>

          <Card className="setting-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield size={20} className="text-purple-500" />
                隐私和安全
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>在线状态</Label>
                  <p className="text-sm text-muted-foreground">向其他人显示在线状态</p>
                </div>
                <Switch.Root
                  className="w-11 h-6 bg-gray-200 rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer"
                  defaultChecked
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>消息加密</Label>
                  <p className="text-sm text-muted-foreground">端到端加密消息</p>
                </div>
                <Switch.Root
                  className="w-11 h-6 bg-gray-200 rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer"
                  defaultChecked
                  disabled
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>
            </CardContent>
          </Card>

          <Card className="setting-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette size={20} className="text-orange-500" />
                外观
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>主题</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                  <option value="auto">跟随系统</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>动画效果</Label>
                  <p className="text-sm text-muted-foreground">启用界面动画</p>
                </div>
                <Switch.Root
                  className="w-11 h-6 bg-gray-200 rounded-full relative data-[state=checked]:bg-primary outline-none cursor-pointer"
                  defaultChecked
                >
                  <Switch.Thumb className="block w-5 h-5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[22px]" />
                </Switch.Root>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        </motion.div>

        <div className="mt-8 flex justify-end gap-4">
          <Button variant="outline" onClick={() => navigate('/')}>
            取消
          </Button>
          <Button onClick={handleSave}>
            保存设置
          </Button>
        </div>
      </div>
    </div>
  )
}
