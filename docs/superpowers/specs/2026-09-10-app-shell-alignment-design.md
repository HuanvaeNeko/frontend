# Web 对齐 APP · 第 1 期：壳与视觉（App Shell）设计

日期：2026-09-10 · 分支：`feat/app-shell`（自 `main` `be4b40f`）· 状态：待用户评审

## 1. 背景、目标与分期

Web（本仓）与 Tauri APP（github.com/huanwei520/Huanvae-Chat-App）连的是同一个后端，但两边的功能面与 UI/UX 已经分叉：APP 是「侧栏 + 统一会话列表 + 聊天面板」的单页三栏、毛玻璃视觉、内嵌设置与模态框；Web 是每个功能一个 URL 的分页应用、shadcn 默认皮。用户的要求是**以 APP 为准对齐 Web**，凡浏览器做得到的都做。

整体分八期，每期一份 spec → 计划 → 实施 → 上线：

| 期 | 内容 |
|---|---|
| **1 壳与视觉（本 spec）** | token/暗色主题、三栏壳（侧栏含工具拖拽钉住）、统一会话列表、联系人栏、设置面板基础分区、资料模态框、文件/会议/机器人/小程序模态框、AI 助手工具、旧路由重定向与删除、响应式折叠 |
| 2 设置补全 | 主题编辑器（预设/自定义/生成器）、黑名单（`/api/friends/blacklist`）、OAuth 授权应用与客户端（`/api/oauth/*`）、通知声音选择器 |
| 3 聊天对齐 | 3a 消息核心（回复引用、转发、多选、撤回、已读回执）；3b 媒体（相册、视频缩略图、文件预览、上传进度）；3c 群（详情/公告/禁言/入群策略/转让/邀请/名片与二维码）；3d 搜索（会话内与全局） |
| 4 AI 会话 | `/api/ai` 会话模型进统一列表、历史面板、语音通话、斜杠命令、卡片消息 |
| 5 机器人与小程序完整版 | 创建/管理机器人、命令面板；小程序内嵌运行 |
| 6 会议对齐 | 邀请卡片、分享、悬浮小窗、媒体权限引导 |
| 7 移动端页面组 | APP 的 MobileMain：底部 TabBar、列表→聊天两级、抽屉 |
| 8 股票研究 | 先 spike 确认数据来源（TS 侧没有 fetch/invoke，疑在 Rust 侧），能做再排 |

**真正排除**（浏览器做不到或不适用）：NFC、局域网互传、VPN 组网、应用自更新、`huanvaeGuard`。APP 里其余 Tauri 依赖全是系统集成（文件对话框、剪贴板、在文件夹中显示、权限设置页、多窗口），Web 用等价物（`<input type=file>`、Clipboard API、下载、路由/模态框）。

**本期完成的判定**：桌面端打开 `/app/chat` 看到的是 APP 的三栏与视觉；所有旧功能都能从新壳到达；旧 URL 全部重定向；`MainLayout`/`Navigation`/旧页面组件删除；vitest 全绿，e2e 在最后收口时跑一次全绿。

## 2. 现状（只写决定设计的部分）

- Web 路由：`/app/chat|friends|groups|files|webrtc|ai-chat|video-meeting|devices|settings|profile`，`MainLayout` + `DesktopSidebar/MobileTabBar`（`src/components/layout/`）。聊天页 `ChatPage` 内部用 `chatStore.activeTab/selectedConversation` 与 URL 双写。
- Web 数据：`friendsStore.friends`、`groupStore.myGroups`、`chatStore.unreadSummary`（来自 WS `unread_summary`：每个好友/群的 `unread_count / last_message_preview / last_message_time`）。这与 APP 统一列表用的是同一份服务端数据；APP 只是再叠了本地 SQLite 缓存，Web 不需要。
- Web 视觉：Tailwind v4 + shadcn（59 个基础组件），token 在 `src/styles/globals.css` 的 `@theme inline`，暗色是 `.dark` 类（`app-theme` cookie，provider 在 `root.tsx`）。
- APP 壳：`Sidebar`（60px：头像 / 聊天·联系人 tab / 底部「更多」与设置）、`UnifiedList`（300–400px：搜索框、「+」菜单、会话卡片、右键菜单、待处理申请、三态）、`ChatPanel`（或 EmptyChat / OtherProfileView / GroupDetailView / SettingsPanel 内嵌）。视觉 token 在 `src/styles/variables.css`（202 个，`[data-theme='dark']`），玻璃卡片在 `styles/components/glass-card.css`。工具钉住：`sidebarLayout.ts` 的 `{ pinned, more }` 存 localStorage `sidebar_layout`，dnd-kit 拖拽。

## 3. 路由与 URL 表

新增布局路由 `src/app/routes/app-shell.tsx`，承载 `/app/*` 下所有受保护页面；视频会议房间页（`/app/video-meeting`）仍全屏独立。壳内三栏：`Sidebar`（60px）｜`ListColumn`（320px）｜`Content`（剩余）。

| 新 URL | 壳的状态 | 替代的旧路由 |
|---|---|---|
| `/app/chat` | 侧栏「聊天」tab；列表 = 统一会话列表；内容 = 空态（APP `EmptyChat`） | `/app/chat` |
| `/app/chat/:conversationId` | 同上；内容 = 聊天面板（现 `ChatWindow`）。id 形状 `f-<userId>` / `g-<groupId>` | `/app/chat` + store 选中态 |
| `/app/contacts` | 侧栏「联系人」tab；列表 = 好友 / 群 / 待处理申请；内容 = 空态 | `/app/friends`、`/app/groups` |
| `/app/contacts/friends/:userId` | 内容 = 对方资料（现 `ProfileModal` 的只读视图 + 现有好友操作：备注、删除、发消息） | — |
| `/app/contacts/groups/:groupId` | 内容 = 群详情（现 `GroupManagement`） | — |
| `/app/settings` → 重定向到 `/app/settings/appearance` | 列表栏 = 分区列表；内容 = 分区 | `/app/settings` |
| `/app/settings/:section` | `section` ∈ `appearance / notifications / account / about`（§8） | `/app/devices` → `account` |
| `/app/profile` | 壳上的模态框 = 现 `ProfileModal`（查看 + 编辑资料、头像、背景），从侧栏头像打开；与 APP 的 ProfileModal 同位 | `/app/profile`（原整页） |
| `/app/files` | 壳上的模态框 = 现 `FileManager` | `/app/files` |
| `/app/meeting` | 壳上的模态框 = 现 `WebRTCPanel` 的创建/加入对话框；确认后跳 `/app/video-meeting` | `/app/webrtc` |
| `/app/bots` | 壳上的模态框 = `GET /api/bots` 列表（只读；创建/命令是第 5 期） | 新 |
| `/app/miniapps` | 壳上的模态框 = `GET /api/miniapps/my` 列表；「打开」在新标签页打开小程序入口 URL（`/apps/*` 已在 BFF 透传前缀里） | 新 |
| `/app/ai-chat` | 内容区整栏 = 现 `AiChatPage`；列表栏保持当前 tab | `/app/ai-chat` |
| `/app/video-meeting` | 全屏，不进壳 | 不变 |

规则：
- **URL 是「选中了什么」的唯一真值**：选中会话、选中联系人、设置分区、哪个模态框开着，全部来自路由；`chatStore.selectedConversation` 改为由路由同步写入的派生值（供聊天窗口内部继续使用），`chatStore.activeTab` 与 `ChatPage` 里的 tab/子 tab 状态删除。
- 模态框路由是壳路由的子路由：列表栏保持当前 tab（由 `sessionStorage` 记住最近 tab，默认聊天），内容区显示空态 + 对话框；关闭 = 有来路则 `navigate(-1)`，直接进入则回 `/app/chat`。
- `ROUTES` 常量按新表重写，旧键删除不留别名；`DEFAULT_AUTHENTICATED_ROUTE = '/app/chat'`；`CHAT_TAB_ROUTE_MAP`、`getChatTabFromPath`、`ChatTabRouteKey`、`SEGMENT_LABELS` 里的死条目删除。
- 重定向（`replace`，在各旧路由模块的 `loader` 里 `redirect()`）：`/app/friends|groups → /app/contacts`，`/app/webrtc → /app/meeting`，`/app/devices → /app/settings/account`，`/app/profile` 保持 URL 但语义改为模态框，`/app/group-chat`（legacy）→ `/app/chat`。

**响应式折叠**（本期只保证可用，APP 的移动端页面组是第 7 期）：
- `≥ 1024px`：三栏。
- `768–1023px`：侧栏 + （列表｜内容）二选一：有选中项时显示内容并在顶部给「返回列表」。
- `< 768px`：侧栏变底部条（聊天 / 联系人 / 更多 三项，沿用现在 `MobileTabBar` 的位置），列表与内容二选一。

## 4. 设计 token 与主题

- **来源**：APP `src/styles/variables.css` 的语义 token：`--primary/--accent`（蓝 `#3b82f6` / 紫 `#8b5cf6` 及 hover/active/subtle/text）、`--bg-primary/secondary/tertiary/surface/muted/inverse`、`--text-primary/secondary/muted/light/inverse/link`、`--border-default/subtle/strong/focus`、`--status-*`、玻璃面（`--gradient-glass`、`--glass-border`、`--blur-*`、`--saturate-high`）、`--radius-*`、阴影、角色标签色（群主/管理员）。暗色值取自它的 `[data-theme='dark']` 块。
- **落点**：`src/styles/globals.css` 的 `@theme` 用 APP 的名字定义 `--color-*`/`--radius-*` 等；shadcn 的 `--background/--foreground/--card/--popover/--primary/--secondary/--muted/--accent/--destructive/--border/--input/--ring` **别名到 APP token**（`--background: var(--bg-primary)` 这样），59 个基础组件不改代码就换皮。暗色沿用 Web 现有 `.dark` 类与 `app-theme` cookie/provider（不改成 `data-theme`）；`.dark` 块里写 APP 的暗色值。
- **组件类**（Tailwind `@utility`）：`glass-card`（渐变底 + `backdrop-filter: blur(xl) saturate(high)` + 1.5px 玻璃边 + 3xl 圆角 + 阴影）、`glass-input`、`subtle-button`、`app-scrollbar`（APP 的统一滚动条）。
- **字体**：沿用 APP `variables.css` 的字体栈。
- **测试**：一条 vitest 读取真实 `globals.css` 文本，断言 shadcn 变量确实别名到 APP token（防「只是像」），并断言 `.dark` 块与 `@theme` 定义的是同一组 APP 名字。
- 主题编辑器（第 2 期）只需改写同一组变量，本期不做。

## 5. 壳层组件（`src/components/shell/`）

**`AppShell`**：`grid-cols-[60px_320px_1fr] h-[100dvh]`；持有折叠状态（§3）；渲染 `Sidebar`、`ListColumn`（按 tab 渲染 `UnifiedList` / `ContactsList` / `SettingsSections`）、`Content`（`<Outlet>`）。

**`Sidebar`**（对齐 APP `Sidebar.tsx` 的 avatar / nav / bottom 三区）：
- 顶部头像（40px）→ `/app/profile`。
- 导航 tab：聊天（未读总数角标 = `unreadSummary` 全部 `unread_count` 之和）、联系人（待处理申请数角标）。
- 已钉住的工具项（见下）。
- 底部：「更多」（弹出工具面板）、设置（`/app/settings`）、明暗切换。
- **工具注册表**（静态）：`meeting`（视频会议 → `/app/meeting`）、`files`（我的文件 → `/app/files`）、`bots`（机器人 → `/app/bots`）、`miniapps`（小程序 → `/app/miniapps`）、`ai`（AI 助手 → `/app/ai-chat`）。key 集合与 APP `sidebarLayout.ts` 同名（`lan/guard/stocks` 不在 Web 集合内）。
- **拖拽钉住**：移植 APP 的 `SidebarLayout { pinned, more }` 模型与 `normalizeLayout`：从「更多」面板拖到侧栏为钉住，拖回为收纳；顺序可拖。持久化 localStorage `huanvae.sidebar-layout`（**设备级**，加入 `sessionScope` 的设备级反向名单，登出不清——和 APP 一样是本机偏好）。拖拽库：仓里没有任何拖拽依赖，引入 APP 同款 `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`（不自己写指针事件；`Sidebar` 与 `SidebarMorePanel` 的拖拽交互按 APP 移植）。

**`UnifiedList`**（对齐 APP `UnifiedList.tsx`）：
- 顶部：搜索框（本地过滤名称/预览）+「+」菜单（创建群聊 → 现有创建群流程；添加好友 → 现有搜索添加流程；加入群 → 现有加群流程）。
- `ConversationCard`：头像（好友/群，复用现有 Avatar）、名称（好友显示备注优先）、最后一条预览（群消息带「发送者: 」前缀，与 APP `groupSenderPrefix` 同构）、时间（APP `formatMessageTime` 规则：今天显示 HH:mm，昨天「昨天」，更早显示日期）、未读角标、置顶标记。
- 右键/长按菜单：置顶/取消置顶、标记已读。
- 三态：加载中 / 错误（可重试）/ 空，复刻 APP `ListStates`。
- 选中高亮来自 URL（`useParams().conversationId`），不来自 store。

**`ContactsList`**：好友（现 `FriendList` 的数据与操作，外观按 APP）、群（现 `GroupList`）、待处理申请（现 pending/sent 请求视图，对齐 APP `PendingRequestsPanel`）。点击 → `/app/contacts/friends/:id` 或 `/app/contacts/groups/:id`。

**`Content`**：`<Outlet>`；空态复刻 APP `EmptyChat`（品牌图 + 一句提示）。

## 6. 统一列表的数据

- `useUnifiedConversations()`（`src/features/chat/hooks/`）：由 `friendsStore.friends × groupStore.myGroups × chatStore.unreadSummary × pinned` 派生 `UnifiedConversation { id: 'f-<uid>' | 'g-<gid>', kind, name, avatarUrl, preview, lastMessageTime, unreadCount, pinned }`；排序移植 APP `conversationSort.ts`（`comparePinnedThenTime`：置顶优先，再按时间倒序，同时间按 key 稳定）。
- 置顶：localStorage `huanvae.pinned-conversations`（**账号级**：普通命名空间，`endSession()` 清盘），值为 id 数组。
- 未读：`unreadSummary` 由 WS `unread_summary` 更新（现状）；打开会话清未读走 `chatStore` 现有逻辑；侧栏角标从同一来源求和。
- 会话 id ↔ 现有 `Conversation` 模型：新增纯函数 `conversationIdOf(conversation)` / `parseConversationId(id)`，聊天窗口继续消费现有 `Conversation` 对象（由路由参数 + stores 解析后写入 `chatStore.selectedConversation`）。
- 预览文案由服务端 `last_message_preview` 决定，Web 不自行拼接（与 APP 一致：两端由构造保证一致）。

## 7. 联系人栏与右栏详情

- 好友 / 群 / 待处理 三个子列表沿用现有 stores 与 API，只换外观与选中态来源（URL）。
- 对方资料（`/app/contacts/friends/:userId`）：现 `ProfileModal` 的只读部分抽成 `ProfileView` 组件，内容区渲染；操作：发消息（→ `/app/chat/f-<id>`）、改备注、删除好友（现有 API）。
- 群详情（`/app/contacts/groups/:groupId`）：现 `GroupManagement` 内容区渲染；完整对齐（公告/禁言/策略/转让/二维码）是第 3c 期。

## 8. 设置面板（`/app/settings/:section`）

列表栏 = 分区列表（APP `SettingsPanel` 的分区名），内容区 = 分区，分区壳用 APP 的 `SettingsSection / SettingsGroup / SettingsRow` 结构重写外观：

| section | 内容（来源） |
|---|---|
| `appearance` 外观 | 明暗主题（现 `app-theme`）、语言（现 `settings.language`） |
| `notifications` 通知与提醒 | 通知开关、声音开关（现 app-settings 里的字段）；声音选择器对齐是第 2 期 |
| `account` 账户与安全 | 隐私（现 `PrivacySettings`）、修改密码（现改密表单，`PUT /api/profile/password` 业务 401 语义不变）、登录设备（现 `DevicesPage`，撤销当前设备仍走 `logout()`）、退出登录 |
| `about` 关于 | 版本（`VITE_APP_VERSION`）、下载页链接、开源许可 |

APP 的「存储与数据」（本地缓存）与「NFC」分区不适用；黑名单、OAuth 授权应用是第 2 期。AI 助手的自定义端点/Key 设置随 `AiChatPage` 一起留在 `/app/ai-chat` 内（现状），不进设置。

## 9. 模态框路由与工具页

- 四个模态框（`/app/files`、`/app/meeting`、`/app/bots`、`/app/miniapps`）各是壳路由的一个子路由模块，元素 = 空态内容 + `Dialog`（shadcn，换 APP token 与玻璃面）。`Dialog` 的 `onOpenChange(false)` → 关闭规则见 §3。
- `/app/bots`：`GET /api/bots` → 列表（名称、Bot ID、创建时间）；空态文案；错误可重试。只读。
- `/app/miniapps`：`GET /api/miniapps/my` → 列表（图标、名称、简介）；「打开」`window.open(entryUrl, '_blank', 'noopener')`，`entryUrl` 由后端返回的相对路径经 `toAbsoluteApiUrl` 落到同源 `/apps/*`。
- `/app/ai-chat`：内容区整栏渲染现 `AiChatPage`（去掉它自带的页面级外框），列表栏保持当前 tab。

后端契约以 `HuanvaeNeko/backend-docs` 为准，`/api/bots`、`/api/miniapps/my` 的响应形状在计划阶段对照文档确认并写严格解析器（本仓惯例）。

## 10. 迁移与删除

实施顺序（每步可独立上线）：
1. token 与主题（§4）——先换皮，所有旧页面立即变成 APP 配色。
2. 壳 + 聊天主路径（§5 `AppShell/Sidebar/UnifiedList/Content` + `/app/chat/:id`），旧 `MainLayout` 仍包着其它旧页。
3. 联系人栏 + 右栏详情（§7）。
4. 设置面板（§8）+ 资料模态框。
5. 四个模态框 + AI 工具（§9）+ 侧栏工具拖拽钉住。
6. 重定向表落地；删除 `MainLayout`、`DesktopSidebar/MobileTabBar`（`Navigation.tsx`）、旧 `ChatPage`（保留其子组件）、旧 `SettingsPage`/`ProfilePage`/`DevicesPage` 页面壳（内容组件迁入分区后删除）、`ROUTES` 旧键与死工具函数、对应旧测试。
7. 三份 e2e 改到新 URL；`bun --bun run build`（Docker 路径）与 e2e 只在最后收口时跑一次。

删除是本期的一部分，不留「以后清理」。

## 11. 测试

- vitest（每步随改动）：`useUnifiedConversations`（合并/排序/置顶/未读，含正对照：改排序规则用例必红）；`Sidebar`（tab ↔ URL、角标求和、工具注册表、钉住布局的 `normalizeLayout` 移植用例）；`UnifiedList`（三态、右键菜单、选中来自 URL）；`ContactsList`；设置分区路由；重定向表（每条旧 URL → 新 URL）；token 别名（§4）；`conversationIdOf/parseConversationId` 往返。
- 「断言不可失败」纪律沿用：每条负断言配前置状态或正对照；期望值不用被测函数拼。
- e2e：`tests/chat.spec.ts`、`device-matrix.spec.js`、`bff-session.spec.ts` 改到新 URL，最后收口跑一次；`device-matrix` 的 8 台设备矩阵覆盖折叠。
- 视觉对照：应用内浏览器截图与 APP 截图并排看（APP 跑不起来，以 token 值为准）。

## 12. 已知风险与开放问题

- APP 的 `formatMessageTime`/`friendDisplayName`/`groupSenderPrefix` 规则在计划阶段逐条移植并配用例，避免两端文案漂移。
- `chatStore.selectedConversation` 改为派生值后，聊天窗口内所有「读 store 判断当前会话」的地方要核对一遍（P4 系列会话边界的 `stillMine()` 逻辑依赖它）。
- `/app/profile` 从整页变模态框：`ProfilePage` 里的编辑表单需与 `ProfileModal` 合并（现两处各一份）。
- 折叠断点与 e2e 的 `device-matrix` 期望要同步更新。
- `@dnd-kit` 三个包约 +30KB gzip 前；只在侧栏用，按需代码分割不做（壳是首屏）。

## 13. 与后续期的接口

- 侧栏工具注册表、设置分区注册表是第 2/4/5/6 期加条目的唯一入口。
- `ConversationCard` 预留「已读回执 / 发送中」插槽（第 3 期），`UnifiedConversation` 预留 `kind: 'ai'`（第 4 期）。
- 第 7 期移动端页面组复用本期的 token、`ConversationCard`、`ContactsList`、设置分区。
