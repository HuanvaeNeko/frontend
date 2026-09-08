'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  PROFILE_POLICIES,
  type ProfilePolicy,
  type UpdateProfileRequest,
} from '@/features/profile/api/profile'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useToast } from '@/hooks/use-toast'

/**
 * 隐私与可见性四项（`个人资料管理.md:104-107` 读侧字段表、:144-147 写侧字段表）。
 *
 * ## 为什么这一块必须存在
 *
 * `allow_search` / `search_visible_by_id` / `friend_request_policy` /
 * `group_invite_policy` 是用户**唯一**能表达"不想被搜到、不想被随便加"的手段。
 * 在这一批之前，前端的 `UserProfile` 里根本没有这四个字段，`updateProfile` 的
 * if 链也只放行 nickname/email/signature——也就是说：后端支持了，用户却没有任何
 * 入口能用上，而且从界面上完全看不出这件事。
 *
 * 它同时是「严格解析」的**收益方**：`profileApi` 里这四个字段走的是会抛错的
 * `bool()` / policy 枚举校验，而不是 `background_url` 那种 warn-only 的宽松档
 * （分档理由写在 `profile.ts` 的 `unconsumedNullableStr` 上）。严格档的代价是
 * 后端少给一个字段就整页报错，只有在"少给字段会让面板显示成错误状态"时才划算——
 * 这里正是那种情况：`allow_search` 拿不到而被兜成 `false`，屏幕上写的是
 * 「不可被搜索」，用户据此以为自己隐身了，实际仍然可以被搜到。
 *
 * ## `ready` 这道闸挡的是什么
 *
 * `profileStore` 的 `profile` 是**持久化**字段。本批之前落盘的那些 `profile`
 * 只有 8 个键，rehydrate 出来之后 `profile.allow_search` 是 `undefined`——
 * 类型上它是 `boolean`，运行时不是。直接拿它渲染，`<Switch checked={undefined}>`
 * 会显示成"关"，又变回上一段说的那个形态。所以这一块只在**本组件自己那次
 * `loadProfile()` 成功之后**才渲染取值，在那之前显示"加载中"。
 *
 * 选择这个做法而不是"给 persist 升版本号、把旧 profile 整个丢掉"，是因为后者的
 * 代价更宽：`Navigation` 挂在每个 `/app` 页面上、直接读落盘的 `profile` 渲染头像
 * 与昵称首字母，而 `/app/devices`、`/app/webrtc` 这些页面自己不调 `loadProfile()`——
 * 丢掉落盘副本会让这些页面上的侧栏头像一直空着。两害相权，把不确定性关在
 * 唯一读这四个字段的地方。
 */
export default function PrivacySettings() {
  const { toast } = useToast()
  const { profile, loadProfile, updateProfile } = useProfileStore()
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadProfile()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((error) => {
        // 失败不在这里弹 toast：`profileStore` 已经写了 `error`，认证失败还会跳
        // 登录页。这里只是不把面板点亮——半张读不到值的隐私面板比一句提示更危险。
        console.error('加载隐私设置失败:', error)
      })
    return () => {
      cancelled = true
    }
  }, [loadProfile])

  /**
   * 单字段部分更新（doc:162-189：只带一个字段的请求是文档给出的正常用法）。
   *
   * 刻意**不做乐观更新**：控件的取值一律读 `profile`，也就是后端确认过的那一份。
   * 失败时 `profileStore.updateProfile` 不会写 `profile`，开关自然停在原位——
   * 不需要"回滚"这段逻辑，也就没有回滚写错的可能。代价是一次往返的延迟，
   * 期间控件是禁用的。
   */
  const save = async (patch: UpdateProfileRequest, label: string) => {
    setSaving(true)
    try {
      await updateProfile(patch)
      toast({ title: '已保存', description: label })
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!ready || !profile) {
    return <div className="py-3 text-sm text-muted-foreground">正在加载隐私设置…</div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b py-3">
        <div>
          <div className="text-sm font-medium">允许被搜索</div>
          {/* doc:104 逐字：`false` = 完全不可被搜索/添加。 */}
          <div className="text-xs text-muted-foreground">关闭后完全不可被搜索或添加</div>
        </div>
        <Switch
          aria-label="允许被搜索"
          checked={profile.allow_search}
          disabled={saving}
          onCheckedChange={(v) => save({ allow_search: v }, v ? '现在可以被搜索' : '现在完全不可被搜索')}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-b py-3">
        <div>
          <div className="text-sm font-medium">允许通过用户 ID 被搜索</div>
          <div className="text-xs text-muted-foreground">别人可以用用户 ID / 用户名找到并添加你</div>
        </div>
        {/*
          总开关关掉时这一项没有意义（doc:104 的「完全不可被搜索/添加」已经覆盖了它），
          禁用而不是隐藏：隐藏会让用户以为这个设置消失了。
        */}
        <Switch
          aria-label="允许通过用户 ID 被搜索"
          checked={profile.search_visible_by_id}
          disabled={saving || !profile.allow_search}
          onCheckedChange={(v) => save({ search_visible_by_id: v }, '已更新用户 ID 搜索设置')}
        />
      </div>

      <div className="space-y-2 py-1">
        <Label>好友申请处理方式</Label>
        <Select
          value={profile.friend_request_policy}
          disabled={saving}
          onValueChange={(v) => save({ friend_request_policy: v as ProfilePolicy }, '已更新好友申请策略')}
        >
          <SelectTrigger aria-label="好友申请处理方式"><SelectValue /></SelectTrigger>
          <SelectContent>
            {POLICY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 py-1">
        <Label>群邀请处理方式</Label>
        <Select
          value={profile.group_invite_policy}
          disabled={saving}
          onValueChange={(v) => save({ group_invite_policy: v as ProfilePolicy }, '已更新群邀请策略')}
        >
          <SelectTrigger aria-label="群邀请处理方式"><SelectValue /></SelectTrigger>
          <SelectContent>
            {POLICY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/**
 * 三档策略的中文标签。`value` 取自 `PROFILE_POLICIES`（`profile.ts` 的同一份常量，
 * 解析器也用它），所以下拉里选不出后端不认的值——**枚举的执行者是解析器和这张表，
 * 不是 TS 类型**。
 */
const POLICY_OPTIONS: readonly { value: ProfilePolicy; label: string }[] = [
  { value: PROFILE_POLICIES[0], label: '人工处理' },
  { value: PROFILE_POLICIES[1], label: '自动同意' },
  { value: PROFILE_POLICIES[2], label: '自动拒绝' },
]
