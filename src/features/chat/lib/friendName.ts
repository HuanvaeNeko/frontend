/** 私聊显示名：备注 > 昵称 > friend_id（APP `utils/friendName.ts`）。群聊一律用群昵称，不走这里。 */
export function friendDisplayName(friend: {
  friend_id: string
  friend_nickname?: string | null
  friend_remark?: string | null
}): string {
  const remark = friend.friend_remark?.trim()
  if (remark) return remark
  const nickname = friend.friend_nickname?.trim()
  if (nickname) return nickname
  return friend.friend_id
}
