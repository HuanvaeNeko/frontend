'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Camera,
  Calendar,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  User as UserIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProfileStore } from '../store/profileStore'
import { useAuthStore } from '../store/authStore'
import { profileApi } from '../api/profile'
import { useToast } from '../hooks/use-toast'
import { ROUTES } from '@/lib/routes'

export default function Profile() {
  const router = useRouter()
  const { toast } = useToast()
  const { profile, isLoading, loadProfile, updateProfile } = useProfileStore()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({ email: '', signature: '' })
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [showPasswords, setShowPasswords] = useState({ old: false, new: false, confirm: false })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    loadProfile().catch(console.error)
  }, [loadProfile])

  useEffect(() => {
    if (profile) {
      setFormData({
        email: profile.user_email || '',
        signature: profile.user_signature || '',
      })
    }
  }, [profile])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateProfile(formData)
      toast({ title: '成功', description: '个人资料已更新' })
    } catch (error) {
      toast({ title: '更新失败', description: error instanceof Error ? error.message : '请稍后重试', variant: 'destructive' })
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    try {
      await profileApi.uploadAvatar(file)
      await loadProfile()
      toast({ title: '成功', description: '头像上传成功' })
    } catch (error) {
      toast({ title: '上传失败', description: error instanceof Error ? error.message : '请稍后重试', variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: '错误', description: '两次输入的新密码不一致', variant: 'destructive' })
      return
    }
    if (passwordData.newPassword.length < 6) {
      toast({ title: '错误', description: '新密码长度至少 6 位', variant: 'destructive' })
      return
    }

    setChangingPassword(true)
    try {
      await profileApi.changePassword({ old_password: passwordData.oldPassword, new_password: passwordData.newPassword })
      toast({ title: '成功', description: '密码修改成功' })
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      toast({ title: '修改失败', description: error instanceof Error ? error.message : '旧密码可能不正确', variant: 'destructive' })
    } finally {
      setChangingPassword(false)
    }
  }

  const displayName = profile?.user_nickname || user?.nickname || '用户'

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-24 md:p-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push(ROUTES.app.chat)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">个人资料</h1>
            <p className="text-sm text-muted-foreground">管理头像、邮箱和账户安全</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center">
                <div className="group relative mb-4">
                  <Avatar className="h-28 w-28">
                    <AvatarImage src={profile?.user_avatar_url || ''} alt={displayName} />
                    <AvatarFallback className="text-2xl font-semibold">{displayName[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/45 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {uploadingAvatar ? <Loader2 className="h-5 w-5 animate-spin text-background" /> : <Camera className="h-5 w-5 text-background" />}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleAvatarChange} />
                <div className="text-lg font-semibold">{displayName}</div>
                <div className="text-xs text-muted-foreground">ID: {profile?.user_id || user?.user_id}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>昵称</Label>
                  <Input value={displayName} disabled />
                </div>
                <div className="space-y-2">
                  <Label>邮箱</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="pl-9" placeholder="your@email.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>个性签名</Label>
                  <Textarea value={formData.signature} onChange={(e) => setFormData({ ...formData, signature: e.target.value })} className="min-h-[110px]" maxLength={200} placeholder="介绍一下自己吧..." />
                  <div className="text-right text-xs text-muted-foreground">{formData.signature.length}/200</div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={isLoading}>{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存更改'}</Button>
                  <Button type="button" variant="outline" onClick={() => setFormData({ email: profile?.user_email || '', signature: profile?.user_signature || '' })} className="gap-1.5">
                    <RefreshCw className="h-4 w-4" />重置
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">修改密码</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="grid gap-4 md:grid-cols-3">
              {([
                { key: 'old', label: '当前密码', value: passwordData.oldPassword, field: 'oldPassword' },
                { key: 'new', label: '新密码', value: passwordData.newPassword, field: 'newPassword' },
                { key: 'confirm', label: '确认新密码', value: passwordData.confirmPassword, field: 'confirmPassword' },
              ] as const).map((item) => (
                <div key={item.key} className="space-y-2">
                  <Label>{item.label}</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={showPasswords[item.key] ? 'text' : 'password'}
                      value={item.value}
                      onChange={(e) => setPasswordData({ ...passwordData, [item.field]: e.target.value })}
                      className="pl-9 pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPasswords({ ...showPasswords, [item.key]: !showPasswords[item.key] })}
                    >
                      {showPasswords[item.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <div className="md:col-span-3">
                <Button type="submit" disabled={changingPassword || !passwordData.oldPassword || !passwordData.newPassword || !passwordData.confirmPassword}>
                  {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : '修改密码'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">账户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><UserIcon className="h-4 w-4" />用户 ID</span><span>{profile?.user_id || user?.user_id}</span></div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Shield className="h-4 w-4" />账户类型</span><span>{profile?.admin === 'true' ? '管理员' : '普通用户'}</span></div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" />注册时间</span><span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('zh-CN') : '-'}</span></div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" />最后更新</span><span>{profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('zh-CN') : '-'}</span></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
