'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/lib/navigation'
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
  Monitor,
  ArrowRight,
} from 'lucide-react'
import { AVATAR_FILE_ACCEPT } from '@/api/storage'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useAuthStore } from '@/features/auth/store/authStore'
import { profileApi } from '@/features/profile/api/profile'
import { useToast } from '@/hooks/use-toast'
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
  /**
   * 分片直传的真实进度（0-100），`null` = 还没有任何一片传完。
   *
   * 链路的前两段（算 SHA-256、`upload/request`）没有进度可报，第一片 PUT 完成
   * 才有第一个数——所以 `null` 期间照旧显示不确定态的转圈，不假装是 0%。
   */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
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

  /**
   * 头像走 storage 的四步预签名链路（`POST /api/profile/avatar` 已于 2026-08-28
   * 删除，`个人资料管理.md:352-355`）。这一侧要知道四件事：
   *
   * - **失败一律透出后端原文**：`user_id` 以 `group-` 开头的存量账号是**永久** 400
   *   （doc:454，那是群头像 object key 的保留命名空间，这个账号永远传不上头像）；
   *   confirm 那一档的「文件大小超过限制…（实际 N 字节）」带着真实字节数（doc:444）。
   *   套一句自造的「上传失败，请重试」会把这两句都扔掉，还会把一条永久失败说成可重试。
   * - **409 不自动重试**（doc:445）：会话被同一目标的新请求接管、或已过期，重发同一条
   *   永远不会成功，只能整条重来。这里只把话说清楚让用户重选文件。
   * - **不回写**：后端已在 confirm 写回 `users."user-avatar-url"`，doc:411 明写
   *   无需再调 `PUT /api/profile`。这里的 `loadProfile()` 是一次 **GET**，为的是把
   *   `updated_at` 等整份资料拉齐，不是回写。
   * - **成功的信号是这条 toast，不是头像变了**：`?t=` 缓存戳是**秒**级（doc:413-414），
   *   同一秒内连换两次会拿到逐字相同的 URL，浏览器不会重新加载那张图。这是后端沿用
   *   旧链路的既有行为，不在本批范围内；客户端能做的是**不把"图变了"当成成功判据**——
   *   所以成功提示无条件弹，也不去伪造一个客户端缓存参数（那会让落盘的 URL 与后端
   *   写进 `users."user-avatar-url"` 的那一份不一致，三个渲染点各拼各的）。
   *
   * `finally` 里清掉 input 的 value：浏览器只在 value **变化**时才发 `change`，
   * 不清就等于"失败之后不许重选同一个文件"，而上面那句提示要用户做的恰恰是重选。
   */
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingAvatar(true)
    setUploadProgress(null)
    try {
      await profileApi.uploadAvatar(file, ({ percent }) => setUploadProgress(percent))
      await loadProfile()
      toast({ title: '成功', description: '头像上传成功' })
    } catch (error) {
      toast({ title: '上传失败', description: error instanceof Error ? error.message : '请稍后重试', variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
      setUploadProgress(null)
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
                    {/*
                      `user_avatar_url` 已在 `profileApi.getProfile` 出口补成绝对地址。
                      原样传相对路径才是真正的故障：Radix 按相对 URL 的规则以当前页面地址
                      为基准解析，请求打到前端自己的源上并 404。而 `null`（本仓 1.2.6 实测：
                      `if (!src) setLoadingStatus('error')`，**不** new Image、不发请求）
                      只是让 AvatarFallback 顶上。

                      ⚠️ 因此 `|| ''` → `?? undefined` **不是修复**，行为逐字相同（两者都落进
                      那条 `!src` 短路）；改它只是让"没有头像"用 React 认的那个值表达。
                      仓里另有几处注释说「空串会被 `<AvatarImage src="">` 当成一次真实的
                      图片请求」（`friends.ts` / `groups.ts` / `discovery.ts` 的 `absoluteAvatar`
                      一带）——对 1.2.6 那句是错的，但它们不在本批范围内，没有跟着改。
                      真会发请求的是**裸 `<img>`**，那一处见 `Navigation.tsx` 的 `avatarSrc`。
                    */}
                    <AvatarImage src={profile?.user_avatar_url ?? undefined} alt={displayName} />
                    <AvatarFallback className="text-2xl font-semibold">{displayName[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/45 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-100"
                  >
                    {uploadingAvatar ? (
                      uploadProgress === null
                        ? <Loader2 className="h-5 w-5 animate-spin text-background" />
                        : <span className="text-sm font-semibold text-background">{Math.round(uploadProgress)}%</span>
                    ) : (
                      <Camera className="h-5 w-5 text-background" />
                    )}
                  </button>
                </div>
                <input ref={fileInputRef} type="file" accept={AVATAR_FILE_ACCEPT} className="hidden" onChange={handleAvatarChange} />
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
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Monitor className="h-4 w-4" />设备管理</span>
              <Button variant="ghost" size="sm" onClick={() => router.push(ROUTES.app.devices)} className="h-auto py-0 px-2 text-primary hover:text-primary/80">
                查看 <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
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
