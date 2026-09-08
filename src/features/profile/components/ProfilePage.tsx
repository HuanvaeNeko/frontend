'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from '@/lib/navigation'
import {
  ArrowLeft,
  Camera,
  Calendar,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  Undo2,
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
import {
  coverImageSrc,
  pickProfileEdits,
  profileApi,
  profileFormValues,
} from '@/features/profile/api/profile'
import { useToast } from '@/hooks/use-toast'
import { ROUTES } from '@/lib/routes'

export default function Profile() {
  const router = useRouter()
  const { toast } = useToast()
  const {
    profile,
    isLoading,
    loadProfile,
    updateProfile,
    setAvatarUrl,
    setBackgroundUrl,
    resetBackground,
  } = useProfileStore()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)

  /**
   * 初值从**已经在 store 里**的资料种出来（`profile` 是持久化字段，刷新之后
   * rehydrate 出来就已经在了），而不是空三元组。空三元组会在首屏留一拍空表单，
   * 那一拍点「保存更改」发出去的是 `nickname: ''`——本页的保存按钮**不**绑
   * `hasChanges`（只绑 `isLoading`），所以它是可点的；`assertValidUpdate` 会在任何
   * fetch 之前抛「昵称长度需为 1-50 个字符」，损失只是一条看不懂的提示。
   *
   * ⚠️ 这条改动**没有用例钉住**，说明白：RTL 的 `render()` 包在 `act()` 里，回填
   * effect 在返回之前就跑完了，两种写法在 DOM 上收敛到同一个稳定态；`ProfileModal`
   * 那一侧能钉是因为它的按钮绑着 `hasChanges`，`disabled` 属性的变化能被
   * `MutationObserver` 逐次提交地看见（见 `ProfileModal.test.tsx` 的「不闪」那条），
   * 而本页没有这样一个随之翻转的属性。被钉住的是共用的那个纯函数
   * （`profile.test.ts` 的「左逆」）。
   */
  const [formData, setFormData] = useState(() => profileFormValues(profile))
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [showPasswords, setShowPasswords] = useState({ old: false, new: false, confirm: false })
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  /**
   * 直传的真实进度（0-100），`null` = 还没有任何字节发出去。
   *
   * 这个数来自 `xhr.upload.onprogress`（**已发出的字节数 / 总字节数**），不是
   * "第几片传完了"——头像档永远只有 1 片（30 MB 的分片 vs 10 MB 的上限），
   * 按分片报的话唯一可能的值就是 100%，还得等字节全部传完才出现。
   *
   * 链路的前两段（算 SHA-256、`upload/request`）确实没有进度可报，
   * 所以 `null` 期间照旧显示不确定态的转圈，不假装是 0%。
   */
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [changingPassword, setChangingPassword] = useState(false)
  /**
   * 封面（资料背景图）的局部态，与头像那两格**各自独立**。
   *
   * 不复用头像那两个 state，是因为两条链路的单飞锁在 `storageApi` 里就是分开的
   * （单飞键 `user_avatar` vs `user_background`，`storage.ts` 的
   * `avatarSingleFlightKey`）——换头像和换封面可以同时进行，共用一格进度会让
   * 两个百分比互相覆盖。
   */
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [backgroundProgress, setBackgroundProgress] = useState<number | null>(null)
  const [resettingBackground, setResettingBackground] = useState(false)

  useEffect(() => {
    loadProfile().catch(console.error)
  }, [loadProfile])

  // 资料后到时（或每次 `loadProfile()` 带回新一份时）回填。与上面的初值共用
  // {@link profileFormValues}：同一个三元组写两遍就是两份会各自漂移的口径。
  useEffect(() => {
    if (profile) setFormData(profileFormValues(profile))
  }, [profile])

  /**
   * 只提交**改过**的字段。
   *
   * 此前这里是 `updateProfile(formData)`，而 `formData` 恒有 `email` 与
   * `signature` 两个键——于是一次"只改签名"的保存会把邮箱一并重写，
   * 没有邮箱的账号还会发出 `email: ""`（`profile.user_email || ''` 的直接后果）。
   * `PUT /api/profile` 是**部分更新**，缺席 = 保持原值（`个人资料管理.md:162-200`
   * 的四个示例分别只带一个 / 三个字段），所以"没碰过的字段不发"才是这个端点的
   * 正确用法。差分逻辑在 {@link pickProfileEdits}，与 `ProfileModal` 共用一份。
   *
   * 一个字段都没改时就地返回：`updateProfile` 对空体会抛（doc:160「至少提供一个
   * 字段」），但让用户看到一句"没有需要保存的修改"比一条红色的失败提示准确。
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const edits = pickProfileEdits(profile, formData)
    if (Object.keys(edits).length === 0) {
      toast({ title: '没有需要保存的修改' })
      return
    }
    try {
      await updateProfile(edits)
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
   *   无需再调 `PUT /api/profile`。后面那次 `loadProfile()` 是一次 **GET**，为的是把
   *   `updated_at` 等整份资料拉齐，不是回写。
   * - **成功的判定点是 confirm 返回，不是那次 GET**：confirm 200 的那一刻后端已经
   *   把 `file_url` 写进 `users."user-avatar-url"`（doc:411），上传**已经完成**。
   *   所以这里拿到返回值就地 `setAvatarUrl` + 弹成功，随后的 `loadProfile()` 用
   *   `.catch` 单独降级。⚠️ 把这两步塞回同一个 `try` 就会复活这个 bug：那次 GET
   *   500 时用户看到「上传失败」+ 一句"重试"（doc:450 管这叫「错误建议——文件就在
   *   那儿，重传只会白传一次」），401 时更进一步——`profileStore.settleError` 会
   *   `silentRedirectToLogin()`，一次成功的上传以无解释登出收场。
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
      const { file_url } = await profileApi.uploadAvatar(file, ({ percent }) => setUploadProgress(percent))
      // 到这里上传已经成功且后端已落库——先兑现结果，再去拉齐其余字段。
      setAvatarUrl(file_url)
      toast({ title: '成功', description: '头像上传成功' })
      await loadProfile().catch((error) => {
        console.error('头像已上传成功，刷新完整资料失败:', error)
      })
    } catch (error) {
      toast({ title: '上传失败', description: error instanceof Error ? error.message : '请稍后重试', variant: 'destructive' })
    } finally {
      setUploadingAvatar(false)
      setUploadProgress(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * 换封面。与 {@link handleAvatarChange} **逐条同构**——同一条四步预签名链路
   * （`个人资料管理.md:362-369`）、同一套错误口径、同一个"成功的判定点是 confirm
   * 返回、不是随后那次 GET"。那四条理由写在上面那个函数的 JSDoc 上，这里不复述
   * （两份注释会各自漂移）。
   *
   * 与头像的差别只有两处，都不在这一层：
   * - 请求体里 `avatar_target` 是 `'user_background'`（doc:389），由
   *   `profileApi.uploadBackground` 填；
   * - object key 落在 `background/{user_id}.{ext}`、写回 `users."user-background-url"`
   *   （doc:421），由**服务端**决定。
   *
   * ⚠️ `POST /api/profile/background` 这条旧的 multipart 端点已随头像那条一起
   * 于 2026-08-28 删除（doc:352-355），这里一个请求都不该打到它。
   */
  const handleBackgroundChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingBackground(true)
    setBackgroundProgress(null)
    try {
      const { file_url } = await profileApi.uploadBackground(file, ({ percent }) =>
        setBackgroundProgress(percent),
      )
      // confirm 已经 200 ⇒ 后端已写回 `users."user-background-url"`（doc:410-411）：
      // 先兑现结果，再去拉齐其余字段，那次 GET 失败不能把已完成的上传说成失败。
      setBackgroundUrl(file_url)
      toast({ title: '成功', description: '资料背景图已更新' })
      await loadProfile().catch((error) => {
        console.error('背景图已上传成功，刷新完整资料失败:', error)
      })
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setUploadingBackground(false)
      setBackgroundProgress(null)
      // 不清 value 就等于"失败之后不许重选同一个文件"，理由同头像那一处。
      if (backgroundInputRef.current) backgroundInputRef.current.value = ''
    }
  }

  /**
   * 恢复默认封面（`DELETE /api/profile/background`，doc:458-492）。
   *
   * 走 store 的 action 而不是直接调 api：重置**会**改本 store 持有的状态
   * （`profile.background_url`），而且没有进度要报，理由写在
   * `profileStore.resetBackground` 的 JSDoc 上。上传那一侧反过来（要报进度、
   * 会长时间占住 `isLoading`），所以留在本组件自管局部态。
   *
   * 失败文案透出后端原文，理由同头像那一处：把「数据库写入失败」这类具体原因
   * 替换成一句自造的「请稍后重试」就是在丢信息。§6（doc:458-492）没有给错误表，
   * 所以这一侧对失败原因**不做任何分档**，原样透出。
   *
   * ⚠️ 401 时 `profileStore.settleError` 会跳登录页，但那个 action **依然 reject**
   * （那条 rethrow 是有意的，见 `settleError` 的 JSDoc：`return` 会让调用方
   * 弹「成功」），所以下面这个 catch 照常执行、照常弹一条 destructive toast。
   * 这与 `handleSubmit` 的 401 行为一致，不是遗漏。
   */
  const handleResetBackground = async () => {
    setResettingBackground(true)
    try {
      await resetBackground()
      // 文案与后端那句 `"背景图已重置为默认"`（doc:483）同义但由前端自己给出，
      // 理由同 `updateProfile`：成功文案不带任何信息，不必透传响应体。
      toast({ title: '成功', description: '已恢复默认封面' })
    } catch (error) {
      toast({
        title: '重置失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setResettingBackground(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    // 两次输入是否一致是**纯 UI 概念**（后端只收一个 new_password），所以留在这里。
    // 长度规则相反：它是端点契约的一部分（doc:305-306，`old_password` ≥ 6、
    // `new_password` 6-100），已经收进 `profileApi.changePassword` 一处执行——
    // 此前两个组件各判了一次 `< 6`，**上限一处都没有**，粘一个 100 位以上的密码
    // 要等一次往返才知道不行。
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({ title: '错误', description: '两次输入的新密码不一致', variant: 'destructive' })
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

  /**
   * 封面地址，`undefined` / 空串 = 渲染默认封面（不挂 `<img>`）。
   *
   * 判据走 {@link coverImageSrc} 而不是就地写 `?? undefined`：同一个"默认封面"
   * 状态在这条 API 上有**三种**表示——数据库列 `null`（doc:464）、
   * `GET /api/profile` 读出来的 `null`（字段表 doc:99「null=默认封面」）、
   * 以及 `DELETE /api/profile/background` 响应里那个 `""`（doc:482、:491
   * 「前端不应拼接此值展示图片」）。`??` 只挡前两种。
   *
   * ⚠️ 但**别把它当成这里唯一那道闸**：下面 JSX 里写的是 `coverSrc ? … : null`，
   * 真值判断本身也会挡掉 `''`。两层是独立的，要同时改坏才渲染得出 `<img src="">`
   * （已实测：单独把 `coverImageSrc` 换成 `?? undefined`，本页用例照样绿）。
   * 这一点写在 `coverImageSrc` 的 JSDoc 上，那里有完整的三层清单。
   */
  const coverSrc = coverImageSrc(profile?.background_url)
  const coverBusy = uploadingBackground || resettingBackground

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

        {/*
          资料封面（`background_url`）。写侧是 storage 的四步预签名链路
          （`avatar_target: 'user_background'`，doc:389），重置走
          `DELETE /api/profile/background`（doc:458-492）。
        */}
        <Card className="overflow-hidden">
          <div className="relative h-36 w-full bg-gradient-to-br from-primary/25 via-primary/10 to-muted md:h-48">
            {/*
              没有封面时**不渲染 `<img>`**，让底下那层渐变作为默认封面。
              渲染一个 `src=""` 的 `<img>` 才是真正的故障：浏览器把空 `src` 解析成当前
              页面地址并发一次请求，把整张 HTML 当图片下载——`Navigation.tsx` 的
              `avatarSrc` 那一处注释记的是同一个坑。
              这里的真值判断与 {@link coverImageSrc} 是**两层独立的**同一条规则，
              别因为其中一层在就把另一层删掉。
            */}
            {coverSrc ? (
              <img
                data-testid="profile-cover-image"
                src={coverSrc}
                alt="资料背景图"
                className="h-full w-full object-cover"
              />
            ) : null}
            <div className="absolute right-3 top-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={coverBusy}
                onClick={() => backgroundInputRef.current?.click()}
                className="gap-1.5 shadow-sm"
              >
                {uploadingBackground ? (
                  // 进度来自 `xhr.upload.onprogress` 的**字节**数（doc:393 的 10 MB
                  // 上限 vs 30 MB 的分片 ⇒ 永远只有 1 片，按分片报只会有 100% 一个值）。
                  // `null` = 还没有字节发出去（在算 SHA-256 / 等 upload/request），
                  // 那一段没有进度可报，所以显示不确定态的转圈而不是假装 0%。
                  backgroundProgress === null ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold">{Math.round(backgroundProgress)}%</span>
                  )
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4" />
                    更换封面
                  </>
                )}
              </Button>
              {/*
                已经是默认封面时不渲染这颗按钮：那一次 DELETE 什么都不会改变，
                而一颗按下去没有任何可见后果的按钮比没有按钮更难理解。
              */}
              {coverSrc ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={coverBusy}
                  onClick={handleResetBackground}
                  className="gap-1.5 shadow-sm"
                >
                  {resettingBackground ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Undo2 className="h-4 w-4" />
                      恢复默认
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </div>
          {/*
            白名单与头像共用同一张表（`AVATAR_FILE_ACCEPT`）：doc:391/:392 的两条规则
            挂在 `storage_location=avatars` 上，字段表里没有任何一行按 `avatar_target`
            分叉，所以封面**没有**自己的格式或上限。
          */}
          <input
            ref={backgroundInputRef}
            type="file"
            accept={AVATAR_FILE_ACCEPT}
            className="hidden"
            data-testid="background-file-input"
            onChange={handleBackgroundChange}
          />
        </Card>

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
                      真会因空串发请求的是**裸 `<img>`**，全仓只有 `Navigation.tsx` 的
                      `avatarSrc` 那一处。（`friends.ts` / `groups.ts` / `discovery.ts` 的
                      `absoluteAvatar` 一带曾有七处注释把那句话说反，已在本批一并订正——
                      它们做的空串归一仍然值得留着，错的只是给出的理由。）

                      这个 `src` 由 `ProfilePage.test.tsx` 在 **DOM 层**钉住（把它换成一个
                      相对路径就红），办法是把 `AvatarImage` 换成裸 `<img>`：Radix 要等图片
                      真的 `load` 完才挂 `<img>`，happy-dom 不发请求 ⇒ 不替就永远只有 fallback。
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
                <input ref={fileInputRef} type="file" accept={AVATAR_FILE_ACCEPT} className="hidden" data-testid="avatar-file-input" onChange={handleAvatarChange} />
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
                  <Label htmlFor="profile_nickname">昵称</Label>
                  {/*
                    昵称是**可写**的（doc:141「新昵称（可选，1-50 字符）」，:153 复述），
                    但这个输入框此前硬写着 `disabled` 且绑的是只读的 `displayName`——
                    两个 UI 都是这样，于是全站没有任何一个用户能改自己的显示名。
                    `maxLength` 只挡上限；清空（下限 1）由 `profileApi.updateProfile`
                    的本地闸拦，两个组件不各写一份。
                  */}
                  <Input
                    id="profile_nickname"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    maxLength={50}
                    placeholder="给自己起个名字"
                  />
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
                  <Button type="button" variant="outline" onClick={() => setFormData({ nickname: profile?.user_nickname || '', email: profile?.user_email || '', signature: profile?.user_signature || '' })} className="gap-1.5">
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
