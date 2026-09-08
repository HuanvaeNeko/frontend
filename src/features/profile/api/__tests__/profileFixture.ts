import type { UserProfile } from '../profile'

/**
 * `UserProfile` 的**完整**测试夹具——一处定义，七个测试文件共用。
 *
 * 建这一份，是因为本批把 `UserProfile` 从 8 个字段补到了 16 个
 * （`backend-docs/profile/个人资料管理.md:92-109` 的字段表），而在此之前**六个**
 * 测试文件各自手抄了一份 8 字段的 `PROFILE_DTO`：Navigation、sessionHandoff、
 * profileStore、profile、ProfilePage、ProfileModal（`profileStore.test.ts` 里还有
 * 两处内联的）。本批新增的 PrivacySettings 是第七个用它的地方。
 * 下一次后端加字段时，「改七处」与「改一处」的区别就是这条注释存在的理由。
 *
 * 默认值取自文档 :68-87 的响应样例与字段表里写明的默认值
 * （`allow_search` / `search_visible_by_id` 默认 `true`，两个 policy 默认 `manual`）。
 */
export const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  user_id: 'u1',
  user_nickname: '测试用户',
  user_email: 'a@example.com',
  user_signature: null,
  user_avatar_url: null,
  background_url: null,
  gender: null,
  birthday: null,
  region: null,
  admin: 'false',
  allow_search: true,
  search_visible_by_id: true,
  friend_request_policy: 'manual',
  group_invite_policy: 'manual',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  ...overrides,
})

/**
 * 后端**线上**那一份（还没过 `profileApi.getProfile` 的出口）：类型刻意放松成
 * `Record<string, unknown>`，这样用例可以塞进文档里那种相对路径的头像地址、
 * 也可以把某个字段整个删掉或换成错误类型，去验证解析器的严格/宽松两档。
 * 用 `UserProfile` 的话这些形状根本写不出来，而那正是要测的东西。
 */
export const makeProfileWire = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...makeProfile(),
  ...overrides,
})
