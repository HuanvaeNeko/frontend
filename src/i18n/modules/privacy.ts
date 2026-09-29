import { defineMessages } from './define'

/** 隐私设置（PrivacySettings.tsx）。中文措辞参考 APP src/components/profile/PrivacySettingsForm.tsx */
export const privacy = defineMessages(
  {
    loading: '加载中...',
    loadFailed: '加载隐私设置失败：{message}',
    loadFailedHint: '在读到后端当前值之前，这四项不会显示——显示一份猜出来的取值，比这条提示危险得多。',
    retry: '重试',
    retryLater: '请稍后重试',
    saved: '已保存',
    saveFailed: '保存失败',
    allowSearch: '允许被搜索 / 添加',
    allowSearchHint: '关闭后完全不可被搜索或添加',
    searchOn: '现在可以被搜索',
    searchOff: '现在完全不可被搜索',
    searchById: '允许通过 ID / 用户名被添加',
    searchByIdHint: '别人可以用用户 ID / 用户名找到并添加你',
    searchByIdSaved: '已更新用户 ID 搜索设置',
    friendPolicy: '好友申请处理方式',
    friendPolicySaved: '已更新好友申请策略',
    groupPolicy: '群邀请处理方式',
    groupPolicySaved: '已更新群邀请策略',
    /** friend_request_policy / group_invite_policy 的三档 */
    policy: {
      manual: '手动处理',
      autoAccept: '自动通过',
      autoReject: '自动拒绝',
    },
  },
  {
    loading: 'Loading...',
    loadFailed: 'Failed to load privacy settings: {message}',
    loadFailedHint:
      'These settings stay hidden until their current values are loaded — showing a guess would be riskier than this message.',
    retry: 'Retry',
    retryLater: 'Please try again later',
    saved: 'Saved',
    saveFailed: 'Failed to save',
    allowSearch: 'Allow others to find or add me',
    allowSearchHint: 'When off, no one can find or add you',
    searchOn: 'Others can now find you',
    searchOff: 'No one can find you now',
    searchById: 'Allow adding me by ID / username',
    searchByIdHint: 'Others can find and add you by your user ID or username',
    searchByIdSaved: 'ID search setting updated',
    friendPolicy: 'Friend request handling',
    friendPolicySaved: 'Friend request handling updated',
    groupPolicy: 'Group invite handling',
    groupPolicySaved: 'Group invite handling updated',
    policy: {
      manual: 'Review manually',
      autoAccept: 'Accept automatically',
      autoReject: 'Decline automatically',
    },
  },
)
