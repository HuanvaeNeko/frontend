import { friendsApi, type Friend } from '@/features/chat/api/friends'
import { groupsApi, type MyGroup } from '@/features/chat/api/groups'

/**
 * 会话列表的数据访问入口。
 *
 * 阶段 1：直接透传上游 API（api.huanvae.cn）。
 * 阶段 2：改为服务端 loader + Drizzle 查询本地 Postgres 缓存，
 *         调用方不受影响 —— 这正是本抽象层存在的理由。
 */
export async function loadFriends(): Promise<Friend[]> {
  return friendsApi.getFriendsList()
}

export async function loadGroups(): Promise<MyGroup[]> {
  return groupsApi.getMyGroups()
}
