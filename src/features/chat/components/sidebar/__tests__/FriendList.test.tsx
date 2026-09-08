import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useChatStore } from '@/features/chat/store/chatStore'
import type { Friend, PendingRequest, SentRequest } from '@/features/chat/api/friends'
import FriendList from '../FriendList'

/**
 * 渲染层验证：字段改名的真正门禁。
 *
 * `bun run typecheck` 能抓到旧字段名，但抓不到**可空**字段上的运行时崩溃——
 * `friend_nickname: null` 在类型上完全合法，`null.toLowerCase()` 照样白屏。
 * 而 filter 每次渲染都执行（不需要用户输入搜索词），所以旧代码只要好友列表
 * 非空就立刻炸；`request.nickname[0]?.toUpperCase()` 同理，`?.` 挡不住前面的 `[0]`。
 *
 * mock 数据一律用**后端文档的形状**（backend-docs/friends/好友添加删除.md
 * :107-118 / :87-96 / :67-78）。用当前接口的形状造 mock 的话，接口写错了
 * mock 也会跟着错，测试永远绿。
 */

const { friendsState, toastMock } = vi.hoisted(() => ({
  friendsState: {
    friends: [] as Friend[],
    pendingRequests: [] as PendingRequest[],
    sentRequests: [] as SentRequest[],
    isLoading: false,
    sendFriendRequest: vi.fn(async () => {}),
    approveFriendRequest: vi.fn(async () => {}),
    rejectFriendRequest: vi.fn(async () => {}),
    removeFriend: vi.fn(async () => {}),
    isOnline: () => false,
  },
  toastMock: vi.fn(),
}))

vi.mock('@/features/chat/store/friendsStore', () => ({
  useFriendsStore: Object.assign(() => friendsState, { getState: () => friendsState }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}))

// t 直接回显 key：断言与语言环境无关，且"这个文案还在不在"看得最清楚。
vi.mock('@/i18n/I18nProvider', () => ({
  useI18n: () => ({ locale: 'zh', t: (key: string) => key }),
}))

const FRIEND: Friend = {
  friend_id: 'u1',
  friend_nickname: '张三',
  friend_avatar_url: null,
  add_time: '2026-01-01T00:00:00Z',
  approve_reason: null,
  friend_remark: null,
  is_blacklisted: false,
  is_special_care: false,
}

const PENDING: PendingRequest = {
  request_id: 'r1',
  request_user_id: 'u2',
  request_message: '加个好友吧',
  request_time: '2026-01-01T00:00:00Z',
  requester_nickname: '李四',
  requester_avatar_url: null,
}

const SENT: SentRequest = {
  request_id: 'r9',
  sent_to_user_id: 'u3',
  sent_message: '想认识一下',
  sent_time: '2026-01-01T08:30:00Z',
  sent_to_nickname: '王五',
  sent_to_avatar_url: null,
}

beforeEach(() => {
  friendsState.friends = []
  friendsState.pendingRequests = []
  friendsState.sentRequests = []
  friendsState.isLoading = false
  friendsState.approveFriendRequest.mockClear()
  friendsState.rejectFriendRequest.mockClear()
  toastMock.mockClear()
  useChatStore.setState({ selectedConversation: null, unreadSummary: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('好友列表（main）', () => {
  it('渲染出真实的好友行，而不是空白', () => {
    friendsState.friends = [FRIEND]

    render(<FriendList subTab="main" searchQuery="" />)

    // 用 role 而不是 getByText：ConversationItem 的头像回退也会渲染
    // name.slice(0,2)，中文昵称下和名字本身是同一串文本。
    expect(screen.getByRole('button', { name: /张三/ })).toBeInTheDocument()
  })

  it('备注优先于昵称显示', () => {
    friendsState.friends = [{ ...FRIEND, friend_remark: '大学室友' }]

    render(<FriendList subTab="main" searchQuery="" />)

    expect(screen.getByText('大学室友')).toBeInTheDocument()
    expect(screen.queryByText('张三')).not.toBeInTheDocument()
  })

  it('备注和昵称都为 null 时回退到 friend_id，且搜索不崩', () => {
    // 旧代码在这里是 `friend.nickname.toLowerCase()` → TypeError → 整页白屏。
    friendsState.friends = [{ ...FRIEND, friend_nickname: null, friend_remark: null }]

    render(<FriendList subTab="main" searchQuery="u1" />)

    expect(screen.getByText('u1')).toBeInTheDocument()
  })

  it('搜索词不匹配时正常显示空态（不是崩溃，也不是全量展示）', () => {
    friendsState.friends = [FRIEND]

    render(<FriendList subTab="main" searchQuery="不存在的人" />)

    expect(screen.queryByText('张三')).not.toBeInTheDocument()
    expect(screen.getByText('chat.friendList.noFriends')).toBeInTheDocument()
  })

  it('点击好友后，会话 id 是 friend_id 而不是 undefined', () => {
    friendsState.friends = [FRIEND]

    render(<FriendList subTab="main" searchQuery="" />)
    fireEvent.click(screen.getByRole('button', { name: /张三/ }))

    expect(useChatStore.getState().selectedConversation).toMatchObject({
      id: 'u1',
      type: 'friend',
      name: '张三',
    })
  })
})

describe('新朋友（pending）', () => {
  it('渲染申请人昵称、用户 ID 和附言', () => {
    friendsState.pendingRequests = [PENDING]

    render(<FriendList subTab="new" searchQuery="" />)

    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.getByText('u2')).toBeInTheDocument()
    // 附言此前读的是已废弃的 request.reason，恒为 undefined，静默不显示
    expect(screen.getByText(/加个好友吧/)).toBeInTheDocument()
  })

  it('昵称为 null 时头像首字母不崩，正文回退到用户 ID', () => {
    friendsState.pendingRequests = [{ ...PENDING, requester_nickname: null }]

    render(<FriendList subTab="new" searchQuery="" />)

    expect(screen.getAllByText('u2').length).toBeGreaterThan(0)
  })

  it('同意按钮传的是 request_user_id 这个具体值', () => {
    friendsState.pendingRequests = [PENDING]

    render(<FriendList subTab="new" searchQuery="" />)
    fireEvent.click(screen.getByText('chat.friendList.approve'))

    expect(friendsState.approveFriendRequest).toHaveBeenCalledWith('u2')
  })

  it('拒绝按钮传的是 request_user_id 这个具体值', () => {
    friendsState.pendingRequests = [PENDING]

    render(<FriendList subTab="new" searchQuery="" />)
    fireEvent.click(screen.getByText('chat.friendList.reject'))

    expect(friendsState.rejectFriendRequest).toHaveBeenCalledWith('u2')
  })
})

describe('已发送（sent）', () => {
  it('渲染目标用户昵称与附言', () => {
    friendsState.sentRequests = [SENT]

    render(<FriendList subTab="sent" searchQuery="" />)

    expect(screen.getByText('王五')).toBeInTheDocument()
    expect(screen.getByText(/想认识一下/)).toBeInTheDocument()
  })

  it('时间取自 sent_time，渲染成合法日期而不是 Invalid Date', () => {
    friendsState.sentRequests = [SENT]

    render(<FriendList subTab="sent" searchQuery="" />)

    // 不写死具体日期：date-fns 按本地时区格式化，断言格式本身即可钉住
    // "字段名错了 → new Date(undefined) → Invalid Date / RangeError"。
    expect(screen.getByText(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('三态徽章的死分支已删除，只剩待处理', () => {
    friendsState.sentRequests = [SENT]

    render(<FriendList subTab="sent" searchQuery="" />)

    expect(screen.getByText('chat.friendList.statusPending')).toBeInTheDocument()
    expect(screen.queryByText('chat.friendList.statusApproved')).not.toBeInTheDocument()
    expect(screen.queryByText('chat.friendList.statusRejected')).not.toBeInTheDocument()
  })

  it('昵称为 null 时回退到 sent_to_user_id，不崩', () => {
    friendsState.sentRequests = [{ ...SENT, sent_to_nickname: null }]

    render(<FriendList subTab="sent" searchQuery="" />)

    expect(screen.getByText('u3')).toBeInTheDocument()
  })
})
