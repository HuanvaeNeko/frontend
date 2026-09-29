import { defineMessages } from './define'

/**
 * 实时通知（useRealtimeMessages 的系统通知 / 桌面通知）与 Service Worker 推送。
 *
 * Service Worker（src/app/sw.ts）**不读**这里：SW 是独立 bundle，不能把整本字典打进去，
 * 它自带一份只有三句话的中英小表。
 */
export const notify = defineMessages(
  {
    /** 通知里拿不到对方昵称时的兜底称呼 */
    someone: '某人',
    /** 群消息桌面通知的标题 */
    groupMessageTitle: '群聊 · {name}',
    /** WS message_recalled 落到当前会话时，被撤回那条的正文（气泡本身渲染撤回胶囊，不显示它） */
    messageRecalled: '此消息已被撤回',
    friendRequest: { title: '好友请求', body: '{name} 请求添加你为好友' },
    friendRequestApproved: { title: '好友请求已通过', body: '{name} 已通过你的好友请求' },
    friendRequestRejected: { title: '好友请求被拒绝', body: '{name} 拒绝了你的好友请求' },
    groupInvite: { title: '群邀请', body: '{name} 邀请你加入群聊 {group}' },
    groupJoinRequest: { title: '入群申请', body: '{name} 申请加入群聊 {group}' },
    groupJoinApproved: { title: '入群申请已通过', body: '你已加入群聊 {group}' },
    groupRemoved: { title: '已被移出群聊', body: '你已被移出群聊 {group}' },
    groupDisbanded: { title: '群聊已解散', body: '群聊 {group} 已解散' },
    groupNoticeUpdated: { title: '群公告更新', body: '群聊 {group} 的公告已更新' },
    ownerTransferred: { title: '群主已转让', body: '群聊 {group} 的群主已转让给 {name}' },
  },
  {
    someone: 'Someone',
    groupMessageTitle: 'Group · {name}',
    messageRecalled: 'This message was recalled',
    friendRequest: { title: 'Friend request', body: '{name} wants to add you as a friend' },
    friendRequestApproved: { title: 'Friend request accepted', body: '{name} accepted your friend request' },
    friendRequestRejected: { title: 'Friend request declined', body: '{name} declined your friend request' },
    // 「the group {group}」与中文「群聊 {group}」同构：群名缺失（后端契约里恒有，只防万一）时读起来仍是一句话
    groupInvite: { title: 'Group invitation', body: '{name} invited you to join the group {group}' },
    groupJoinRequest: { title: 'Join request', body: '{name} asked to join the group {group}' },
    groupJoinApproved: { title: 'Join request approved', body: 'You joined the group {group}' },
    groupRemoved: { title: 'Removed from group', body: 'You were removed from the group {group}' },
    groupDisbanded: { title: 'Group disbanded', body: 'The group {group} was disbanded' },
    groupNoticeUpdated: { title: 'Group notice updated', body: 'The group {group} has a new notice' },
    ownerTransferred: { title: 'Group ownership transferred', body: 'Ownership of the group {group} was transferred to {name}' },
  },
)
