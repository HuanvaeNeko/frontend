import { type Asset, assets, clientFileHash } from './media/assets'
import { avatarPath, blobKey, convIdOf, pairKey, typeFolder } from './model'
import { randHex, reseed, uuid } from './random'
import { type Clock, DAY, HOUR, iso, MINUTE } from './time'
import type {
  Bucket,
  ChatMessageRec,
  FileRef,
  FriendConvRec,
  GroupRec,
  JoinPolicy,
  JoinRequestType,
  MessageType,
  Role,
  StorageLocation,
  UserRec,
  World,
} from './types'

/**
 * 种子世界：确定性（同一个种子、相对「重置那一刻」的时间），中文内容，照真实用户会遇到的样子铺。
 *
 * 主视角是 alice（爱丽丝）。她名下：5 个好友（一个带备注、一个特别关心、一个被她拉黑、一个刚加
 * 还没聊过）、一条待处理好友申请（frank → alice）、一条发出的申请（alice → grace）、4 个群
 * （自己建的 8 人群、36 人大群里的普通成员、当管理员的读书会、以及还没进的群的一条邀请）、
 * 一条发出的入群申请、若干未读、跨越一年的聊天记录，以及网盘里将近 30 个文件。
 *
 * `e2e` 是旧 fixture 的账号，保持空世界，资料逐字不变（tests/bff-session、chat、device-matrix 依赖它）。
 */

export const PASSWORD = 'correct-horse'

/** 群 ID 固定写死，报告、用例、手工探索可以直接引用（`/app/chat/g-<id>`）。 */
export const GROUP_IDS = {
  hiking: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e01',
  frontend: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e02',
  bookclub: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e03',
  photo: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e04',
  boardgame: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e05',
  oss: '0199b7a0-4c1e-7d2a-9f3b-1a2b3c4d5e06',
} as const

interface UserSpec {
  id: string
  nick: string
  avatar: boolean
  sig?: string | null
  gender?: UserRec['gender']
  region?: string | null
  birthday?: string | null
  email?: string | null
  createdDaysAgo?: number
}

const CAST: UserSpec[] = [
  { id: 'alice', nick: '爱丽丝', avatar: true, sig: '今天也要元气满满 ☀️', gender: 'female', region: '上海', birthday: '1998-04-12', createdDaysAgo: 640 },
  { id: 'bob', nick: '鲍勃', avatar: true, sig: '代码写累了就去跑步 🏃', gender: 'male', region: '杭州', birthday: '1996-11-03', createdDaysAgo: 600 },
  { id: 'carol', nick: '卡萝尔', avatar: false, sig: null, gender: 'female', region: '北京', createdDaysAgo: 910 },
  { id: 'dave', nick: '大卫', avatar: true, sig: '摄影 / 咖啡 / 胶片', gender: 'male', region: '成都', birthday: '1994-07-21', createdDaysAgo: 500 },
  { id: 'erin', nick: '艾琳', avatar: true, sig: '一切随缘', gender: 'female', region: null, createdDaysAgo: 320 },
  { id: 'frank', nick: '弗兰克', avatar: true, sig: '读书会常驻成员 📚', gender: 'male', region: '南京', createdDaysAgo: 410 },
  { id: 'grace', nick: '格蕾丝', avatar: false, sig: '在路上', gender: 'female', region: '广州', createdDaysAgo: 380 },
  { id: 'heidi', nick: '海蒂', avatar: true, sig: '猫奴一枚 🐱', gender: 'female', region: '苏州', createdDaysAgo: 90 },
  { id: 'ivan', nick: '伊凡', avatar: true, sig: 'Rust 与咖啡因', gender: 'male', region: '深圳', createdDaysAgo: 450 },
  { id: 'judy', nick: '朱迪', avatar: true, sig: '设计师，喜欢一切好看的东西', gender: 'female', region: '上海', createdDaysAgo: 470 },
  { id: 'mallory', nick: '马洛里', avatar: false, sig: null, gender: 'other', region: null, createdDaysAgo: 60 },
  { id: 'walter', nick: '沃尔特', avatar: true, sig: '前端技术交流群群主 · 欢迎提问', gender: 'male', region: '北京', createdDaysAgo: 800 },
]

/** 大群凑人数用的 28 个成员：dev01…dev28，一半有头像、一半走首字母回退。 */
const EXTRA_NAMES = ['张伟', '王芳', '李娜', '刘洋', '陈静', '杨帆', '赵磊', '黄敏', '周杰', '吴婷', '徐明', '孙丽', '胡军', '朱琳', '高峰', '林晓', '何伟', '郭敏', '马超', '罗丹', '梁静', '宋佳', '郑浩', '谢娜', '韩雪', '唐亮', '冯雨', '曹阳']
export const EXTRA_USER_IDS = EXTRA_NAMES.map((_, i) => `dev${String(i + 1).padStart(2, '0')}`)

const DEFAULT_POLICY: JoinPolicy = {
  join_approval_required: true,
  admin_can_approve: true,
  card_share_scope: 'all_members',
  qr_show_scope: 'all_members',
  search_scope: 'everyone',
  allow_join_via_qr: true,
  allow_join_via_search: true,
  allow_join_via_referral: true,
}

class Builder {
  readonly w: World
  private readonly readMarks: Array<() => void> = []

  constructor(readonly clock: Clock) {
    this.w = {
      users: new Map(),
      friendships: new Map(),
      remarks: new Map(),
      blacklist: new Map(),
      specialCare: new Map(),
      friendRequests: [],
      convs: new Map(),
      groups: new Map(),
      groupRequests: [],
      files: new Map(),
      blobs: new Map(),
      uploads: new Map(),
      devices: [],
      bots: [],
      miniapps: [],
      oauthClients: [],
      oauthGrants: [],
    }
  }

  daysAgo(days: number, extraMs = 0): string {
    return iso(this.clock.now - days * DAY + extraMs)
  }

  // ── 用户 ──────────────────────────────────────────────

  user(spec: UserSpec): UserRec {
    const created = this.clock.now - (spec.createdDaysAgo ?? 200) * DAY
    const rec: UserRec = {
      user_id: spec.id,
      nickname: spec.nick,
      email: spec.email === undefined ? `${spec.id}@huanvae.test` : spec.email,
      password: PASSWORD,
      signature: spec.sig ?? null,
      avatar: null,
      background: null,
      gender: spec.gender ?? null,
      birthday: spec.birthday ?? null,
      region: spec.region ?? null,
      admin: 'false',
      allow_search: true,
      search_visible_by_id: true,
      friend_request_policy: 'manual',
      group_invite_policy: 'manual',
      created_at: iso(created),
      updated_at: iso(created + 3 * DAY),
    }
    if (spec.avatar) {
      const key = `${spec.id}.png`
      this.putBlob('avatars', key, assets.userAvatar(spec.id))
      rec.avatar = avatarPath(key, created + 5 * DAY)
    }
    this.w.users.set(rec.user_id, rec)
    return rec
  }

  putBlob(bucket: Bucket, key: string, asset: Asset): void {
    this.w.blobs.set(blobKey(bucket, key), { bytes: asset.bytes, content_type: asset.contentType })
  }

  // ── 好友 ──────────────────────────────────────────────

  friends(a: string, b: string, daysAgo: number): void {
    const key = pairKey(a, b)
    this.w.friendships.set(key, { key, users: [a, b], add_time: this.daysAgo(daysAgo), active: true })
  }

  ownerMap(map: Map<string, Map<string, string>>, owner: string): Map<string, string> {
    let inner = map.get(owner)
    if (!inner) {
      inner = new Map()
      map.set(owner, inner)
    }
    return inner
  }

  friendRequest(from: string, to: string, message: string | null, at: number): void {
    this.w.friendRequests.push({ request_id: uuid(), from, to, message, created_at: iso(at), status: 'pending' })
  }

  // ── 文件 ──────────────────────────────────────────────

  file(spec: {
    owner: string
    filename: string
    asset: Asset
    location: StorageLocation
    related?: string | null
    at: number
  }): FileRef {
    const bucket: Bucket = spec.location === 'friend_messages' ? 'friends-file' : spec.location === 'group_files' ? 'group-file' : 'user-file'
    const prefix =
      spec.location === 'friend_messages'
        ? convIdOf(spec.owner, spec.related ?? spec.owner)
        : spec.location === 'group_files'
          ? (spec.related ?? '')
          : spec.owner
    const hash = clientFileHash(spec.asset.bytes)
    const key = `${prefix}/${typeFolder(spec.asset.contentType)}/${spec.at}_${hash.slice(0, 8)}_${spec.filename}`
    const file_uuid = uuid()
    this.putBlob(bucket, key, spec.asset)
    this.w.files.set(file_uuid, {
      file_uuid,
      owner_id: spec.owner,
      filename: spec.filename,
      content_type: spec.asset.contentType,
      file_size: spec.asset.bytes.length,
      file_hash: hash,
      bucket,
      key,
      created_at: iso(spec.at),
      storage_location: spec.location,
      related_id: spec.related ?? null,
      width: spec.asset.width,
      height: spec.asset.height,
      deleted: false,
    })
    return {
      file_uuid,
      filename: spec.filename,
      content_type: spec.asset.contentType,
      file_size: spec.asset.bytes.length,
      width: spec.asset.width,
      height: spec.asset.height,
    }
  }

  // ── 私聊 ──────────────────────────────────────────────

  conv(a: string, b: string): FriendConvRec {
    const id = convIdOf(a, b)
    let conv = this.w.convs.get(id)
    if (!conv) {
      conv = { conv_id: id, users: [a, b], seq: 0, messages: [], last_read: new Map() }
      this.w.convs.set(id, conv)
    }
    return conv
  }

  dm(from: string, to: string, at: number, content: string, opts: { type?: MessageType; file?: FileRef; recalled?: boolean } = {}): ChatMessageRec {
    const msg: ChatMessageRec = {
      message_uuid: uuid(),
      seq: 0,
      sender_id: from,
      content: opts.recalled ? '[消息已撤回]' : content,
      type: opts.recalled ? 'text' : (opts.type ?? 'text'),
      file: opts.recalled ? null : (opts.file ?? null),
      is_recalled: opts.recalled ?? false,
      send_time: iso(at),
      deleted_by: new Set(),
      reply_to: null,
    }
    this.conv(from, to).messages.push(msg)
    return msg
  }

  /** 把 `user` 在该会话里的已读位置钉到 `upTo` 这条（seq 在收尾时才定，所以延迟求值）。 */
  readUpTo(conv: FriendConvRec, user: string, upTo: ChatMessageRec | 'all'): void {
    this.readMarks.push(() => conv.last_read.set(user, upTo === 'all' ? conv.seq : upTo.seq))
  }

  // ── 群 ────────────────────────────────────────────────

  group(spec: { id: string; name: string; owner: string; avatar: boolean; description: string | null; createdDaysAgo: number; policy?: Partial<JoinPolicy> }): GroupRec {
    const created = this.clock.now - spec.createdDaysAgo * DAY
    const rec: GroupRec = {
      group_id: spec.id,
      name: spec.name,
      avatar: null,
      description: spec.description,
      creator_id: spec.owner,
      created_at: iso(created),
      status: 'active',
      policy: { ...DEFAULT_POLICY, ...spec.policy },
      members: new Map(),
      seq: 0,
      messages: [],
      notices: [],
    }
    if (spec.avatar) {
      const key = `group-${spec.id}.png`
      this.putBlob('avatars', key, assets.groupAvatar(spec.id))
      rec.avatar = avatarPath(key, created + DAY)
    }
    this.w.groups.set(rec.group_id, rec)
    this.member(rec, spec.owner, 'owner', spec.createdDaysAgo, 'create')
    return rec
  }

  member(group: GroupRec, userId: string, role: Role, joinedDaysAgo: number, joinMethod = 'owner_invite'): void {
    group.members.set(userId, {
      user_id: userId,
      role,
      group_nickname: null,
      joined_at: this.daysAgo(joinedDaysAgo),
      join_method: joinMethod,
      muted_until: null,
      last_read_seq: 0,
    })
  }

  gmsg(group: GroupRec, from: string, at: number, content: string, opts: { type?: MessageType; file?: FileRef; recalled?: boolean } = {}): ChatMessageRec {
    const msg: ChatMessageRec = {
      message_uuid: uuid(),
      seq: 0,
      sender_id: from,
      content: opts.recalled ? '[消息已撤回]' : content,
      type: opts.recalled ? 'text' : (opts.type ?? 'text'),
      file: opts.recalled ? null : (opts.file ?? null),
      is_recalled: opts.recalled ?? false,
      send_time: iso(at),
      deleted_by: new Set(),
      reply_to: null,
    }
    group.messages.push(msg)
    return msg
  }

  groupReadUpTo(group: GroupRec, user: string, upTo: ChatMessageRec | 'all'): void {
    this.readMarks.push(() => {
      const member = group.members.get(user)
      if (member) member.last_read_seq = upTo === 'all' ? group.seq : upTo.seq
    })
  }

  notice(group: GroupRec, publisher: string, at: number, title: string, content: string, pinned: boolean): void {
    group.notices.push({ id: uuid(), title, content, publisher_id: publisher, published_at: iso(at), is_pinned: pinned, updated_at: iso(at) })
  }

  groupRequest(spec: { group: string; user: string; inviter?: string | null; type: JoinRequestType; message: string | null; at: number; accepted?: boolean }): void {
    this.w.groupRequests.push({
      request_id: uuid(),
      group_id: spec.group,
      user_id: spec.user,
      inviter_id: spec.inviter ?? null,
      message: spec.message,
      request_type: spec.type,
      user_accepted: spec.accepted ?? spec.type === 'search_apply',
      status: 'pending',
      created_at: iso(spec.at),
      expires_at: spec.type === 'search_apply' ? null : iso(spec.at + 7 * DAY),
    })
  }

  // ── 收尾：按时间排序、编 seq、落已读位置 ────────────────

  finish(): World {
    const bySendTime = (a: ChatMessageRec, b: ChatMessageRec) => Date.parse(a.send_time) - Date.parse(b.send_time)
    for (const conv of this.w.convs.values()) {
      conv.messages.sort(bySendTime)
      conv.messages.forEach((m, i) => {
        m.seq = i + 1
      })
      conv.seq = conv.messages.length
      // 默认：双方都读到最新；需要未读的会话由 readUpTo 覆盖
      for (const u of conv.users) conv.last_read.set(u, conv.seq)
    }
    for (const group of this.w.groups.values()) {
      group.messages.sort(bySendTime)
      group.messages.forEach((m, i) => {
        m.seq = i + 1
      })
      group.seq = group.messages.length
      for (const member of group.members.values()) member.last_read_seq = group.seq
    }
    for (const mark of this.readMarks) mark()
    return this.w
  }
}

export function buildWorld(clock: Clock): World {
  reseed()
  const b = new Builder(clock)
  const { now } = clock
  const T = (daysAgo: number, hh: number, mm: number, sec = 0) => clock.dayAt(daysAgo, hh, mm, sec)

  // ── 人 ────────────────────────────────────────────────
  // e2e：旧 fixture 的账号，资料逐字保持原样（/api/profile 的断言与 chat.spec 依赖它）
  b.w.users.set('e2e', {
    user_id: 'e2e',
    nickname: 'E2E 用户',
    email: 'e2e@example.com',
    password: PASSWORD,
    signature: null,
    avatar: 'avatars/e2e.png',
    background: null,
    gender: null,
    birthday: null,
    region: null,
    admin: 'false',
    allow_search: true,
    search_visible_by_id: true,
    friend_request_policy: 'manual',
    group_invite_policy: 'manual',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })
  b.putBlob('avatars', 'e2e.png', assets.userAvatar('e2e'))

  for (const spec of CAST) b.user(spec)
  EXTRA_NAMES.forEach((nick, i) => b.user({ id: EXTRA_USER_IDS[i], nick, avatar: i % 2 === 0, createdDaysAgo: 100 + i * 7 }))
  // alice 有一张资料背景图（封面区不是空的）
  b.putBlob('avatars', 'background/alice.png', assets.photo('lake'))
  const alice = b.w.users.get('alice') as UserRec
  alice.background = avatarPath('background/alice.png', now - 30 * DAY)
  // dave 设成自动通过好友申请：在 UI 里加他为好友会直接成功（对照 manual 的 pending 流程）
  ;(b.w.users.get('dave') as UserRec).friend_request_policy = 'auto_accept'
  // mallory 不可被搜索：发现搜索里搜不到她
  ;(b.w.users.get('mallory') as UserRec).allow_search = false

  // ── 好友关系 ──────────────────────────────────────────
  b.friends('alice', 'bob', 560)
  b.friends('alice', 'carol', 900)
  b.friends('alice', 'dave', 480)
  b.friends('alice', 'erin', 300)
  b.friends('alice', 'heidi', 1)
  for (const [x, y, d] of [
    ['bob', 'carol', 400], ['bob', 'dave', 350], ['bob', 'frank', 300], ['bob', 'judy', 200], ['bob', 'walter', 500],
    ['carol', 'dave', 380], ['dave', 'erin', 250], ['dave', 'heidi', 80], ['frank', 'grace', 330], ['grace', 'judy', 150],
    ['judy', 'walter', 420], ['ivan', 'walter', 390], ['ivan', 'judy', 260],
  ] as const) b.friends(x, y, d)

  b.ownerMap(b.w.remarks, 'alice').set('carol', '卡卡（大学室友）')
  b.ownerMap(b.w.remarks, 'bob').set('alice', '爱丽丝（徒步搭子）')
  b.ownerMap(b.w.specialCare, 'alice').set('dave', b.daysAgo(120))
  b.ownerMap(b.w.blacklist, 'alice').set('erin', b.daysAgo(5))

  b.friendRequest('frank', 'alice', '你好，我是弗兰克，我们在读书会见过～', now - 3 * HOUR)
  b.friendRequest('alice', 'grace', '格蕾丝你好！我是爱丽丝，想约你周五一起玩桌游', now - 2 * DAY)
  b.friendRequest('ivan', 'bob', '鲍勃你好，我是前端群的伊凡', now - 20 * HOUR)

  // ── alice ↔ bob：80+ 条，跨一年 ────────────────────────
  const ab = b.conv('alice', 'bob')
  b.dm('bob', 'alice', clock.lastYear(12, 24, 20, 14), '圣诞快乐！🎄 今年的礼物收到了吗')
  b.dm('alice', 'bob', clock.lastYear(12, 24, 20, 16), '收到啦！！那本《三体》精装版太好看了 😭 谢谢你')
  b.dm('bob', 'alice', clock.lastYear(12, 24, 20, 17), '哈哈喜欢就好，明年一起去看极光？')
  b.dm('alice', 'bob', clock.lastYear(12, 24, 20, 21), '说好了！立个 flag 🚩')
  b.dm('alice', 'bob', clock.lastYear(12, 31, 23, 59), '新年快乐 🎆')
  b.dm('bob', 'alice', clock.lastYear(12, 31, 23, 59) + 2 * MINUTE, '新年快乐！新的一年冲冲冲 🚀')

  b.dm('alice', 'bob', T(45, 8, 32), '你上次推荐的那个播客叫什么来着')
  b.dm('bob', 'alice', T(45, 8, 40), '《忽左忽右》，历史和社会类的，挺好听')
  b.dm('alice', 'bob', T(45, 8, 41), '谢谢！通勤路上听刚好 🎧')

  b.dm('bob', 'alice', T(6, 21, 2), '周末那条线路我查了一下，发你看看')
  b.dm(
    'bob',
    'alice',
    T(6, 21, 4),
    '九溪十八涧 → 龙井村 → 狮峰山，全程大概 12 公里，累计爬升 600 米左右。前半段都是溪边的石板路，比较好走；后半段上狮峰山有一段陡坡，下雨天会比较滑，建议穿有抓地力的鞋。中午可以在龙井村吃农家菜，那家「老张家」的笋干老鸭煲很有名，不过周末要排队，最好提前打电话订位。下山可以走满觉陇，秋天的桂花特别香。',
  )
  b.dm('alice', 'bob', T(6, 21, 9), '看起来不错！12 公里我应该可以 💪')
  b.dm('bob', 'alice', T(6, 21, 11), '装备清单：\n\n- 登山鞋 👟\n- 雨衣（天气预报说可能有阵雨）\n- 至少 **1.5L** 水\n- 充电宝\n- 身份证（龙井村那边偶尔查）\n\n> 别穿新鞋，会磨脚')
  b.dm('alice', 'bob', T(6, 21, 15), '天气预报在这里：https://www.weather.com.cn/weather/101210101.shtml')
  b.dm('bob', 'alice', T(6, 21, 16), '周六多云转阵雨，还好')
  b.dm('alice', 'bob', T(6, 21, 18), '那我去群里发个公告')
  b.dm('bob', 'alice', T(6, 21, 18, 40), '👍')

  b.dm('bob', 'alice', T(4, 10, 0), JSON.stringify({ room_id: 'R8K2QF', password: '246810', room_name: '周会', creator_name: '鲍勃', creator_avatar: 'avatars/bob.png' }), { type: 'meeting_invite' })
  b.dm('alice', 'bob', T(4, 10, 1), '收到，马上进')
  b.dm('bob', 'alice', T(4, 18, 20), '这个群挺有意思的，都是玩胶片的，你之前不是说想学')
  b.dm('bob', 'alice', T(4, 18, 20, 30), JSON.stringify({ group_id: GROUP_IDS.photo }), { type: 'group_card' })

  b.dm('alice', 'bob', T(3, 14, 30), '问你个问题，这段代码为啥一直报错')
  b.dm('alice', 'bob', T(3, 14, 31), "```ts\nconst res = await fetch('/api/friends')\nconst data = await res.json()\nconsole.log(data.friends.length) // TypeError\n```")
  b.dm('bob', 'alice', T(3, 14, 35), '后端早就改成信封格式了，`data.friends` 永远是 `undefined` 啊 😂\n\n要读 `data.data`，或者直接用 `readEnvelopeList`')
  b.dm('alice', 'bob', T(3, 14, 36), '……我居然被这个坑了半个小时')
  b.dm('bob', 'alice', T(3, 14, 37), '欢迎来到信封化的世界 📨')
  b.dm('alice', 'bob', T(3, 14, 50), '对了，MDN 上那篇讲 AbortController 的文章你看过吗 https://developer.mozilla.org/zh-CN/docs/Web/API/AbortController')
  b.dm('bob', 'alice', T(3, 14, 52), '看过，写得很清楚，超时和取消可以合成一个 signal')

  const filler: Array<[string, string]> = [
    ['alice', '在吗'], ['bob', '在的，刚开完会 😮‍💨'], ['alice', '周末有空吗？'], ['bob', '周六白天有安排，晚上可以'],
    ['alice', '那周日呢'], ['bob', '周日全天有空！'], ['alice', '想去新开的那家书店看看'], ['bob', '哪家？'],
    ['alice', '就是滨江那边的「单向空间」'], ['bob', '听说设计得很好看'], ['alice', '对！而且二楼有咖啡'], ['bob', '那必须去'],
    ['alice', '顺便把上次借你的书还你 📖'], ['bob', '不急不急'], ['alice', '你最近在看什么'], ['bob', '在看《置身事内》，讲地方政府和经济的'],
    ['alice', '听起来好硬核'], ['bob', '还好，写得挺通俗的'], ['alice', '我最近在追一部日剧'], ['bob', '哪部？'],
    ['alice', '《重版出来》，讲漫画编辑的'], ['bob', '这个我也看过！超级治愈'], ['alice', '黑泽心真的太可爱了'], ['bob', '哈哈哈同意'],
    ['bob', '对了你们组那个项目上线了吗'], ['alice', '上周五上的，还算顺利'], ['alice', '就是有个 WebSocket 重连的 bug 折腾了好久'], ['bob', '是不是断线之后 token 过期那个'],
    ['alice', '对对对，你怎么知道'], ['bob', '我们之前也踩过 😂'], ['alice', '最后是在 BFF 那层升级握手的时候刷新 token 解决的'], ['bob', '这个思路不错'],
    ['alice', '晚上吃什么'], ['bob', '不知道，点外卖吧'], ['alice', '我想吃麻辣烫'], ['bob', '那我也来一份'],
    ['alice', '好，我下单了'], ['bob', '爱了爱了 ❤️'], ['alice', '吃完早点睡，明天还要早起'], ['bob', '晚安 🌙'],
  ]
  filler.forEach(([from, text], i) => b.dm(from, from === 'alice' ? 'bob' : 'alice', T(2, 19, 0) + i * 97_000, text))

  const sunset = b.file({ owner: 'bob', filename: 'IMG_20260928_184012.png', asset: assets.photo('sunset'), location: 'friend_messages', related: 'alice', at: T(1, 18, 41) })
  const review = b.file({ owner: 'alice', filename: '2026Q3-项目复盘.pdf', asset: assets.pdf('q3-review'), location: 'friend_messages', related: 'bob', at: T(1, 20, 10) })
  const nightRun = b.file({ owner: 'bob', filename: '西湖夜跑.mp4', asset: assets.video(), location: 'friend_messages', related: 'alice', at: T(1, 21, 30) })
  b.dm('bob', 'alice', T(1, 18, 40), '昨天拍的照片 📷')
  b.dm('bob', 'alice', T(1, 18, 41), `[图片] ${sunset.filename}`, { type: 'image', file: sunset })
  b.dm('alice', 'bob', T(1, 18, 45), '哇这个晚霞绝了！！')
  b.dm('alice', 'bob', T(1, 18, 46), '是在西湖边拍的吗')
  b.dm('bob', 'alice', T(1, 18, 47), '对，断桥那边')
  b.dm('alice', 'bob', T(1, 20, 10), `[文件] ${review.filename}`, { type: 'file', file: review })
  b.dm('bob', 'alice', T(1, 20, 12), '收到，晚点看')
  b.dm('bob', 'alice', T(1, 21, 30), `[视频] ${nightRun.filename}`, { type: 'video', file: nightRun })
  b.dm('bob', 'alice', T(1, 21, 31), '这条是发给跑团群的通知，发错了', { recalled: true })
  b.dm('bob', 'alice', T(1, 21, 32), '发错了哈哈')
  b.dm('alice', 'bob', T(1, 22, 5), '明天记得：\n1. 带伞 ☂️\n2. 八点在地铁站 B 口集合\n3. 别迟到！！')
  b.dm('bob', 'alice', T(1, 22, 6), '遵命 🫡')

  const todayAB = clock.todaySlots(8, 150, 6)
  b.dm('alice', 'bob', todayAB[0], '早！今天降温了，多穿点')
  b.dm('bob', 'alice', todayAB[1], '收到 🧥')
  b.dm('bob', 'alice', todayAB[2], '中午吃啥')
  b.dm('alice', 'bob', todayAB[3], '楼下新开的拉面店？')
  const lastReadByAlice = b.dm('bob', 'alice', todayAB[4], '可以！')
  b.dm('bob', 'alice', todayAB[5], '对了周六的事定了吗')
  b.dm('bob', 'alice', todayAB[6], '我这边都 OK 👌')
  b.dm('bob', 'alice', todayAB[7], '晚上一起吃饭吗？🍜')
  b.readUpTo(ab, 'alice', lastReadByAlice)

  // ── alice ↔ carol（备注「卡卡（大学室友）」），前天 ────────
  const carolLines: Array<[string, string]> = [
    ['carol', '爱丽丝！！下周大学同学聚会你来吗'], ['alice', '来呀！几号？'], ['carol', '下周三晚上，在五道口那家烤鸭店'],
    ['alice', '好久没吃烤鸭了 🦆'], ['carol', '小林和阿杰也来，就差你了'], ['alice', '那我请假也要来'], ['carol', '哈哈哈好'],
    ['carol', '对了你还记得宿舍楼下那只橘猫吗'], ['alice', '大橘！！当然记得'], ['carol', '听说它现在是学校的「猫校长」了 😂'],
    ['alice', '太好笑了'], ['carol', '那就这么定了，下周三晚上见！'],
  ]
  carolLines.forEach(([from, text], i) => b.dm(from, from === 'alice' ? 'carol' : 'alice', T(2, 12, 10) + i * 140_000, text))

  // ── alice ↔ dave（特别关心），今天早上，2 条未读 ────────
  const ad = b.conv('alice', 'dave')
  const lake = b.file({ owner: 'dave', filename: '000012.png', asset: assets.photo('lake'), location: 'friend_messages', related: 'alice', at: now - 70 * MINUTE })
  b.dm('dave', 'alice', now - 95 * MINUTE, '早上好 ☕')
  b.dm('dave', 'alice', now - 94 * MINUTE, '上次拍的那卷 Portra 400 冲出来了')
  const lastDaveRead = b.dm('alice', 'dave', now - 90 * MINUTE, '快给我看看！')
  b.dm('dave', 'alice', now - 70 * MINUTE, `[图片] ${lake.filename}`, { type: 'image', file: lake })
  b.dm('dave', 'alice', now - 69 * MINUTE, '胶片冲洗好了，周末给你带过去')
  b.readUpTo(ad, 'alice', lastDaveRead)

  // ── alice ↔ erin（被 alice 拉黑）：上个月的一段可疑对话 ──
  b.dm('erin', 'alice', T(31, 23, 40), '在吗')
  b.dm('erin', 'alice', T(31, 23, 41), '借我 500 块急用，明天还')
  b.dm('alice', 'erin', T(31, 23, 50), '？？你是本人吗')
  b.dm('erin', 'alice', T(31, 23, 52), '是啊是啊')
  // heidi：昨天刚加的好友，还没聊过（列表里应显示空会话态）

  // ── 群：周末徒步小分队（alice 群主，8 人） ──────────────
  const hiking = b.group({
    id: GROUP_IDS.hiking,
    name: '周末徒步小分队 🥾',
    owner: 'alice',
    avatar: true,
    description: '每周六早上 8 点集合，路线见群公告～ 小雨照常，大雨改期',
    createdDaysAgo: 140,
  })
  b.member(hiking, 'bob', 'admin', 139)
  for (const [id, d] of [['carol', 138], ['dave', 120], ['heidi', 30], ['ivan', 60], ['judy', 45], ['mallory', 5]] as const) b.member(hiking, id, 'member', d)
  b.gmsg(hiking, 'alice', T(6, 21, 30), '大家好！这周六徒步路线定了：九溪十八涧 → 龙井村 → 狮峰山 🥾')
  b.gmsg(hiking, 'bob', T(6, 21, 31), '收到！')
  b.gmsg(hiking, 'carol', T(6, 21, 33), '我可以带一些零食 🍪')
  b.gmsg(hiking, 'dave', T(6, 21, 34), '我带相机 📷')
  b.gmsg(hiking, 'heidi', T(6, 21, 40), '第一次参加，有点紧张哈哈')
  b.gmsg(hiking, 'alice', T(6, 21, 42), '不用紧张，强度不大～ 跟着队伍走就行')
  b.gmsg(hiking, 'alice', T(5, 9, 0), '爱丽丝 邀请 马洛里 加入了群聊', { type: 'system' })
  b.gmsg(hiking, 'mallory', T(5, 9, 5), '大家好，我是马洛里 👋')
  b.gmsg(hiking, 'judy', T(2, 20, 10), '周六下雨怎么办')
  b.gmsg(hiking, 'alice', T(2, 20, 15), '小雨照常出发，大雨改期，周五晚上 8 点群里通知')
  b.gmsg(hiking, 'ivan', T(2, 20, 16), '👌')
  const trail = b.file({ owner: 'dave', filename: 'trail-recon.png', asset: assets.photo('trail'), location: 'group_files', related: GROUP_IDS.hiking, at: T(1, 21, 0) })
  b.gmsg(hiking, 'dave', T(1, 21, 0), `[图片] ${trail.filename}`, { type: 'image', file: trail })
  b.gmsg(hiking, 'dave', T(1, 21, 1), '上次踩点拍的，路况还不错')
  b.gmsg(hiking, 'carol', T(1, 21, 5), '好美！')
  b.gmsg(hiking, 'bob', T(1, 21, 20), '周六 8 点地铁站 B 口集合，别迟到哦')
  b.gmsg(hiking, 'alice', clock.todaySlots(1, 60, 48)[0], '明天见！记得带伞 ☂️')
  b.notice(hiking, 'alice', T(6, 21, 45), '本周六：九溪十八涧 → 龙井村 🥾', '集合：周六 08:00 龙井路地铁站 B 口\n全程约 12 公里，累计爬升 600 米\n午饭：龙井村农家菜（AA）\n小雨照常，大雨改期（周五 20:00 群内通知）', true)
  b.notice(hiking, 'bob', T(5, 10, 0), '装备清单', '登山鞋、雨衣、1.5L 水、充电宝、身份证、少量现金', false)
  b.groupRequest({ group: GROUP_IDS.hiking, user: 'frank', type: 'search_apply', message: '我也想一起爬山！去年爬过九溪，路线很熟 🙋', at: now - 3 * HOUR })
  b.groupRequest({ group: GROUP_IDS.hiking, user: 'grace', inviter: 'bob', type: 'admin_invite', message: '格蕾丝，一起来爬山呀', at: now - 26 * HOUR, accepted: false })

  // ── 群：前端技术交流群（36 人，alice 普通成员，12 条未读） ──
  const fe = b.group({
    id: GROUP_IDS.frontend,
    name: '前端技术交流群',
    owner: 'walter',
    avatar: true,
    description: '聊前端、聊工程化、聊踩过的坑。禁止广告，提问请附最小复现。',
    createdDaysAgo: 700,
    policy: { join_approval_required: false },
  })
  b.member(fe, 'judy', 'admin', 690)
  b.member(fe, 'ivan', 'admin', 600)
  for (const [id, d] of [['alice', 400], ['bob', 380], ['carol', 200], ['dave', 150], ['mallory', 20]] as const) b.member(fe, id, 'member', d, 'search_direct')
  EXTRA_USER_IDS.forEach((id, i) => b.member(fe, id, 'member', 300 - i * 9, 'search_direct'))
  const feSpeakers = ['walter', 'judy', 'ivan', 'bob', 'carol', 'dave', ...EXTRA_USER_IDS]
  const techLines = [
    '有人用过 Bun 1.4 的新 fetch 吗？', 'TanStack Query 和 RR8 的 loader 怎么配合比较好', '我们项目刚把 Jest 换成 Vitest，快了三倍',
    'Tailwind v4 的 @theme 真香', 'CSS 容器查询终于可以放心用了', '有没有人遇到 Safari 下 WebSocket 断连的问题', 'iOS 的 PWA 推送还是不太稳',
    'Biome 的 lint 速度是真的快', '今天又被时区坑了……new Date() 真是万恶之源', '推荐一下 date-fns 的 formatDistanceToNow',
    'Zustand 的 persist 中间件记得加 version 和 migrate', '面试被问到 React 的 Fiber 架构，答得一塌糊涂', 'Rust 写的前端工具链越来越多了',
    'Vite 的 SSR 模块运行器有点复杂', '有人在用 shadcn/ui 吗，组件质量怎么样', 'Radix 的 Dialog 在移动端滚动锁定有坑',
    'framer-motion 的 layout 动画在列表里很丝滑', '大家的 monorepo 用 pnpm 还是 bun workspace？', 'WebRTC 的 TURN 服务器自建还是买云服务？',
    'Playwright 的 trace viewer 太好用了', '有没有人研究过 View Transitions API', 'Service Worker 更新策略真的是个大坑',
    'HTTP/3 在国内的支持情况怎么样', '这周末的技术沙龙有人去吗', 'TypeScript 的 isolatedDeclarations 有人用了吗', 'React Compiler 在生产环境稳定吗',
    '我觉得 signals 迟早会进 React', 'Node 24 大家升级了吗', '今天学到一个技巧：structuredClone 可以深拷贝 Map',
    'Intl.Segmenter 处理中文分词挺好用的', '有人做过 IM 的消息已读回执吗，方案怎么设计的', '分享一个调试 WebSocket 的小工具：websocat',
    'CORS 的 preflight 缓存可以用 Access-Control-Max-Age', '同源 + BFF 真的省了很多事', 'httpOnly cookie 存会话比 localStorage 存 token 安全太多',
    '有人踩过 SameSite=Lax 的坑吗', '预签名 URL 千万别重新编码，签名会挂', '今天 code review 又被挑出三个 any 😅', 'StrictMode 下 useEffect 会跑两次，别慌',
    '性能优化第一步：先量，再改', 'Lighthouse 分数不等于真实用户体验', '图片懒加载记得给宽高，不然 CLS 爆炸', '周五了，大家早点下班 🍻',
    '收到', '学到了', '+1', '哈哈哈哈', '👍', '同问', 'mark 一下',
  ]
  const feDay = (daysAgo: number, count: number, startH: number, spanMinutes: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const at = T(daysAgo, startH, 0) + Math.round((i * spanMinutes * MINUTE) / count)
      b.gmsg(fe, feSpeakers[(i * 7 + offset) % feSpeakers.length], at, techLines[(i * 5 + offset) % techLines.length])
    }
  }
  b.gmsg(fe, 'walter', T(2, 9, 0), '早上好各位！今天聊聊 React Router 8 的资源路由～')
  feDay(2, 24, 9, 540, 3)
  b.gmsg(fe, 'ivan', T(2, 15, 12), "```ts\nexport async function loader({ request }: LoaderFunctionArgs) {\n  const url = new URL(request.url)\n  return Response.json({ q: url.searchParams.get('q') })\n}\n```\n资源路由就是只导出 loader/action、不导出组件")
  b.gmsg(fe, 'alice', T(2, 15, 20), '请教一下，React Router 8 的 clientLoader 和 loader 可以同时用吗？')
  b.gmsg(fe, 'walter', T(2, 15, 24), '可以的，clientLoader 里调用 `serverLoader()` 就能拿到服务端那份数据')
  b.gmsg(fe, 'alice', T(2, 15, 25), '感谢！🙏')
  b.gmsg(fe, 'walter', T(2, 16, 0), '沃尔特 将 伊凡 设为管理员', { type: 'system' })
  feDay(1, 20, 10, 600, 11)
  const chart = b.file({ owner: 'judy', filename: 'bundle-size.png', asset: assets.chart(), location: 'group_files', related: GROUP_IDS.frontend, at: T(1, 16, 30) })
  b.gmsg(fe, 'judy', T(1, 16, 30), `[图片] ${chart.filename}`, { type: 'image', file: chart })
  b.gmsg(fe, 'judy', T(1, 16, 31), '升级 Vite 8 之后首屏包体积对比，第四根是没开 tree-shaking 的')
  b.gmsg(fe, 'bob', T(1, 16, 40), 'Vite 8 的发布说明：https://vite.dev/blog/announcing-vite8')
  b.gmsg(fe, 'dave', T(1, 17, 2), '这个群消息太多了，我先开免打扰', { recalled: true })
  const feRead = b.gmsg(fe, 'carol', T(1, 22, 0), '晚安各位 🌙')
  const todayFe = clock.todaySlots(12, 170, 3)
  todayFe.slice(0, 11).forEach((at, i) => b.gmsg(fe, feSpeakers[(i * 3 + 5) % feSpeakers.length], at, techLines[(i * 11 + 2) % techLines.length]))
  b.gmsg(fe, 'walter', todayFe[11], '今晚 8 点线上分享：《React 19 的 use() 与 Suspense 实战》，会议号见群公告 📢')
  b.groupReadUpTo(fe, 'alice', feRead)
  b.notice(fe, 'walter', T(3, 9, 0), '群规（新人必读）', '1. 禁止广告和招聘刷屏\n2. 提问请附最小复现（CodeSandbox / StackBlitz）\n3. 分享会每周三晚 8 点，会议号提前一天公布', true)

  // ── 群：读书会·第七期（bob 群主，alice 管理员，2 条未读） ──
  const bookclub = b.group({ id: GROUP_IDS.bookclub, name: '读书会·第七期 📚', owner: 'bob', avatar: false, description: null, createdDaysAgo: 30 })
  b.member(bookclub, 'alice', 'admin', 30)
  for (const id of ['carol', 'frank', 'grace', 'erin'] as const) b.member(bookclub, id, 'member', 28)
  const readingList = b.file({ owner: 'frank', filename: '第七期书单.pdf', asset: assets.pdf('reading-list'), location: 'group_files', related: GROUP_IDS.bookclub, at: T(10, 20, 0) })
  b.gmsg(bookclub, 'frank', T(10, 20, 0), `[文件] ${readingList.filename}`, { type: 'file', file: readingList })
  b.gmsg(bookclub, 'bob', T(10, 20, 2), '新一期书单来啦，两周一本')
  b.gmsg(bookclub, 'grace', T(10, 20, 10), '《活着》我读过三遍了')
  b.gmsg(bookclub, 'carol', T(10, 20, 12), '这次终于有《挪威的森林》')
  b.gmsg(bookclub, 'alice', T(10, 20, 15), '我负责订场地～')
  b.gmsg(bookclub, 'erin', T(3, 11, 0), '这周日我可能来不了')
  b.gmsg(bookclub, 'bob', T(3, 11, 5), '没事，下次补上')
  b.gmsg(bookclub, 'frank', T(1, 19, 0), '第一本读到哪了大家')
  const bookRead = b.gmsg(bookclub, 'carol', T(1, 19, 4), '刚看完红岸基地那段，头皮发麻')
  const todayBook = clock.todaySlots(2, 60, 25)
  b.gmsg(bookclub, 'grace', todayBook[0], '这周读到第 12 章了，好压抑……')
  b.gmsg(bookclub, 'frank', todayBook[1], '周日见，老地方 ☕')
  b.groupReadUpTo(bookclub, 'alice', bookRead)
  b.notice(bookclub, 'bob', T(10, 20, 5), '第七期读书会安排', '每两周日 15:00，老地方咖啡馆\n本期共四本书，书单见群文件', true)
  b.groupRequest({ group: GROUP_IDS.bookclub, user: 'ivan', type: 'search_apply', message: '听说这里的书单很好，想加入', at: now - 5 * HOUR })

  // ── 还没进的群：一条邀请、一条申请、一个免审核的公开群 ──
  const photo = b.group({
    id: GROUP_IDS.photo,
    name: '胶片摄影同好会 📷',
    owner: 'dave',
    avatar: true,
    description: '每月一次扫街，互相借器材',
    createdDaysAgo: 200,
    policy: { allow_join_via_search: false },
  })
  for (const id of ['erin', 'heidi', 'bob'] as const) b.member(photo, id, 'member', 150)
  b.gmsg(photo, 'dave', T(8, 19, 0), '这个月扫街定在武康路，周日下午两点')
  b.gmsg(photo, 'heidi', T(8, 19, 5), '我带我的 FM2 🎞️')
  b.groupRequest({ group: GROUP_IDS.photo, user: 'alice', inviter: 'dave', type: 'owner_invite', message: '来玩胶片吧～ 我们每月一次扫街', at: now - 22 * HOUR, accepted: false })

  const boardgame = b.group({ id: GROUP_IDS.boardgame, name: '周五桌游夜 🎲', owner: 'grace', avatar: false, description: '阿瓦隆、狼人杀、璀璨宝石', createdDaysAgo: 90 })
  for (const id of ['frank', 'judy'] as const) b.member(boardgame, id, 'member', 80)
  b.gmsg(boardgame, 'grace', T(4, 21, 0), '这周五还是老地方，7 点开局')
  b.groupRequest({ group: GROUP_IDS.boardgame, user: 'alice', type: 'search_apply', message: '想来玩阿瓦隆！', at: now - 2 * DAY })

  const oss = b.group({
    id: GROUP_IDS.oss,
    name: '开源周报读者群',
    owner: 'walter',
    avatar: true,
    description: '每周一期开源项目推荐，免审核直接进',
    createdDaysAgo: 365,
    policy: { join_approval_required: false },
  })
  for (const id of ['ivan', 'judy', ...EXTRA_USER_IDS.slice(0, 5)]) b.member(oss, id, 'member', 200)
  b.gmsg(oss, 'walter', T(7, 10, 0), '第 52 期：本周推荐 Biome、Rolldown、Oxc 三个 Rust 工具链项目')

  // ── alice 的网盘（个人文件 22 个；好友/群里收到的文件也会出现在列表里） ──
  const drive: Array<[string, Asset, number]> = [
    ['旅行攻略-京都.pdf', assets.pdf('kyoto'), 40],
    ['IMG_2031.png', assets.photo('sunset'), 12],
    ['猫咪视频.mp4', assets.video(), 20],
    ['会议纪要-0926.txt', assets.text('minutes', '会议纪要 2026-09-26\n\n参会：爱丽丝、鲍勃、朱迪\n\n1. BFF 会话层已上线，观察一周\n2. 群文件透传前缀需要核对（group-file）\n3. 下周开始端到端体验审计\n'), 3],
    ['2026-09 账单.csv', assets.text('bill', '日期,项目,金额\n2026-09-01,房租,4500\n2026-09-03,超市,326.5\n2026-09-10,话费,58\n2026-09-18,徒步装备,899\n', 'text/csv; charset=utf-8'), 2],
    ['读书笔记-三体.md', assets.text('three-body', '# 三体 读书笔记\n\n> 弱小和无知不是生存的障碍，傲慢才是。\n\n- 红岸基地\n- 古筝行动\n- 黑暗森林法则\n', 'text/markdown; charset=utf-8'), 9],
  ]
  for (let week = 38; week >= 23; week--) {
    drive.push([
      `周报-第${week}周.md`,
      assets.text(`weekly-${week}`, `# 周报 第 ${week} 周\n\n## 本周完成\n- 修复会话列表未读数\n- 联调文件上传\n\n## 下周计划\n- e2e 审计\n`, 'text/markdown; charset=utf-8'),
      (38 - week) * 7 + 1,
    ])
  }
  drive.forEach(([filename, asset, daysAgo], i) => b.file({ owner: 'alice', filename, asset, location: 'user_files', at: now - daysAgo * DAY - i * MINUTE }))

  // ── 设备、机器人、小程序、OAuth ────────────────────────
  b.w.devices.push(
    { device_id: uuid(), user_id: 'alice', device_info: 'iPhone 15 Pro · 焕微 App 2.3.1', ip_address: '223.104.3.18', created_at: b.daysAgo(60), last_active_at: iso(now - 2 * HOUR) },
    { device_id: uuid(), user_id: 'alice', device_info: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', ip_address: '117.136.8.2', created_at: b.daysAgo(33), last_active_at: b.daysAgo(9) },
  )

  b.w.bots.push(
    { bot_user_id: `bot_${randHex(24)}`, owner_id: 'alice', username: 'weather_helper', nickname: '天气小助手', description: '每天早上 8 点推送天气和穿衣建议', is_active: true, is_discoverable: true, created_at: b.daysAgo(50) },
    { bot_user_id: `bot_${randHex(24)}`, owner_id: 'alice', username: 'standup_bot', nickname: '站会提醒', description: '工作日 9:45 提醒站会', is_active: false, is_discoverable: false, created_at: b.daysAgo(15) },
  )

  b.w.miniapps.push(
    { miniapp_id: uuid(), owner_id: 'alice', name: 'weather', display_name: '天气', description: '看看今天要不要带伞', icon_url: '/apps/weather/icon.png', access_url: '/apps/weather/', status: 'published' },
    { miniapp_id: uuid(), owner_id: 'alice', name: 'ledger', display_name: '记账本', description: '一笔一笔记清楚', icon_url: '/apps/ledger/icon.png', access_url: '/apps/ledger/', status: 'published' },
    { miniapp_id: uuid(), owner_id: 'alice', name: 'filmdiary', display_name: '胶片日记', description: '外部托管，审核中', icon_url: 'https://filmdiary.example.com/icon.png', access_url: 'https://filmdiary.example.com/app', status: 'reviewing' },
  )

  const weatherClient = uuid()
  const filmClient = uuid()
  b.w.oauthClients.push(
    {
      client_id: weatherClient, client_secret: `sk_${randHex(40)}`, owner_id: 'alice', client_type: 'internal', app_name: '天气', app_description: '小程序「天气」的内部客户端',
      app_homepage_url: null, app_logo_url: '/apps/weather/icon.png', redirect_uris: ['/apps/weather/oauth/callback'], allowed_scopes: ['profile'], is_active: true, created_at: b.daysAgo(50),
    },
    {
      client_id: filmClient, client_secret: `sk_${randHex(40)}`, owner_id: 'alice', client_type: 'external', app_name: '胶片日记 Web', app_description: '记录每一卷胶片的拍摄参数',
      app_homepage_url: 'https://filmdiary.example.com', app_logo_url: 'https://filmdiary.example.com/logo.png', redirect_uris: ['https://filmdiary.example.com/oauth/callback'], allowed_scopes: ['profile', 'friends'], is_active: true, created_at: b.daysAgo(20),
    },
  )
  b.w.oauthGrants.push(
    { id: uuid(), user_id: 'alice', client_id: filmClient, app_name: '胶片日记 Web', app_logo_url: 'https://filmdiary.example.com/logo.png', scope: 'profile friends', created_at: b.daysAgo(3) },
    { id: uuid(), user_id: 'alice', client_id: uuid(), app_name: '记账本', app_logo_url: '/apps/ledger/icon.png', scope: 'profile', created_at: iso(now - 2 * HOUR) },
    { id: uuid(), user_id: 'alice', client_id: uuid(), app_name: 'Huanvae 小组件', app_logo_url: null, scope: 'profile email', created_at: b.daysAgo(40) },
  )

  return b.finish()
}
