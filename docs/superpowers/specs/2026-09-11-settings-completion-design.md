# Web 对齐 APP · 第 2 期：设置补全（主题编辑器 / 黑名单 / OAuth / 提示音）设计

> 上期：`docs/superpowers/specs/2026-09-10-app-shell-alignment-design.md`（壳与视觉，已上线 `c38578a`）。本期是路线图第 2 期。APP 源码：github.com/huanwei520/Huanvae-Chat-App；后端契约：github HuanvaeNeko/backend-docs（`friends/好友添加删除.md`、`oauth/OAuth授权服务器API.md`、`profile/个人资料管理.md`）。

## 1. 背景、目标与范围

上期把 Web 的 `/app/*` 换成了 APP 的三栏壳与 token，设置面板只做了五个基础分区。本期把 APP 设置面板里剩下的四块功能搬过来，并收掉上期终审留下的两件结构性小事。

| 项 | 做什么 | 依据 |
|---|---|---|
| 1 主题编辑器 | APP 全量：模式 / 预设 / 主色与强调色取色器 / 毛玻璃 4 滑块 / 高级透明度 17 滑块，OKLCH 生成器移植，运行时写 CSS 变量 | owner 选「APP 全量」 |
| 2 黑名单 | 列表 / 拉黑 / 取消拉黑，好友列表标灰 | APP `BlacklistPanel`，契约 `POST/DELETE/GET /api/friends/blacklist` |
| 3 OAuth | 已授权应用（列表 / 取消授权）、我的客户端（创建 / 列表 / 删除 / 重置密钥）、**托管授权页** `/app/oauth/authorize` | APP `AuthorizedAppsPanel` / `OAuthClientsPanel` / `OAuthConsentModal`；owner 选「做托管授权页」 |
| 4 提示音 | 内置 `water.mp3` + 保留现在的合成音 + 上传自定义 mp3（IndexedDB），选择 / 试听 / 删除 | APP `SoundSelector` + `useNotificationSounds` |
| 5 收尾 | `CreateGroupDialog` 抽出；「账户与安全」加「修改密码」入口；删孤儿文件 | 上期终审 #4、spec §8 遗留 |

**明确不做**：「开源许可」页（APP 没有这一页，上期 spec §8 写错，撤回）；修改密码不搬家（Web 已在资料模态框实现且与契约对齐，只加入口）；APP 主题编辑器的独立窗口（Web 内嵌在外观分区）；提示音的原生文件对话框（用 `<input type=file>`）；OAuth 的 `token / userinfo / revoke`（那是第三方与后端之间的接口，Web 不调）。

**本期完成的判定**：默认用户首屏与上期逐字节相同（默认预设不写内联变量）；自定义主题刷新不闪；黑名单三个动作在联系人右栏与设置里都能做；`/app/oauth/authorize?client_id=…` 对外部客户端走完 同意 → 带 code 跳回 全流程，拒绝带 `error=access_denied` 跳回；选中的提示音在收到消息时真的响；vitest 全绿，e2e 收口一次全绿。

## 2. 现状（只写决定设计的部分）

- `src/styles/globals.css` 的 `:root` / `.dark` 是 APP 生成器对默认预设的**静态输出**（上期 Task 1），`@theme inline` 把 shadcn 的 `--color-*` 别名到这些 token。文件头注释已写明「第 2 期的主题编辑器只需改写这一组变量」。
- 明暗模式：`settingsStore.theme: 'light' | 'dark' | 'auto'`（设备级字段），`src/app/root.tsx` 里有 `<head>` 内联防闪脚本（读 `app-settings` 切 `.dark`）与 `SettingsSync`（切 class、写 `app-theme` cookie、`colorScheme`）。APP 的 `ThemeMode` 是 `'system'`，Web 是 `'auto'`——**保留 Web 的 `auto`**，生成器入口做一次映射。
- 声音：`src/hooks/useSound.ts` 是 Web Audio 合成音（`SoundManager`，11 种 `SoundType`），`playMessage` 由 `useRealtimeMessages.ts:119` / `useNotification.ts` 触发，`playNotification` 由 `use-toast.ts` 触发；`enabled / volume` 从 `sound_enabled / sound_volume` 两个设备级键读，由 `SettingsSync` 单向同步。仓里没有任何音频文件。
- 好友：`Friend.is_blacklisted` 字段已存在（`src/features/chat/api/friends.ts`），无黑名单 API / store / UI。
- OAuth：Web 零代码。
- 设置壳：`src/components/shell/settings/sections.tsx` 注册表（五分区）、`SettingsSection / SettingsGroup / SettingsRow` 三个积木、`AccountSection` 嵌 `PrivacySettings` + `Devices embedded` 的模式；文案在 `shell.settings.*`（老的 `settings.*` 命名空间只有语言选项标签还在用）。
- 建群对话框内嵌在 `GroupList.tsx`（`dialogOnly` / `initialCreateOpen` 是上期的临时 prop）。

## 3. 路由与 URL

| URL | 说明 |
|---|---|
| `/app/settings/appearance` | 外观分区扩成完整主题编辑器（不换 URL） |
| `/app/settings/notifications` | 加提示音选择器 |
| `/app/settings/account` | 加「修改密码」入口行（跳 `/app/profile`，模态框打开后由用户切到「修改密码」tab）与「黑名单」内嵌列表 |
| `/app/settings/apps` | **新分区**「授权与应用」：已授权应用列表 |
| `/app/miniapps` | 模态框加第二个 tab「OAuth 客户端」（与 APP 的 MiniAppsModal → 我的 → OAuth 客户端 同位） |
| `/app/oauth/authorize` | **新页面**，全屏、不进壳（与 `/app/video-meeting` 同层，`protected-layout` 之下）；query：`client_id`（必填）、`redirect_uri`（必填）、`scope`（默认 `profile`）、`state`（可选）、`code_challenge` + `code_challenge_method`（可选，同给同缺） |
| `/app/contacts/friends/:userId` | `ProfileView` 加「拉黑 / 取消拉黑」按钮 |

`SETTINGS_SECTIONS` 变为 `['appearance', 'notifications', 'account', 'apps', 'ai', 'about'] as const`；`SETTINGS_SECTION_META` 加 `{ key: 'apps', labelKey: 'shell.settings.apps', icon: AppWindow }`。

未登录访问 `/app/oauth/authorize?…`：`ProtectedRoute` 目前 `replace` 到 `/app/login` 不带回跳；本页自己在渲染前判断，跳 `/app/login?next=<encodeURIComponent(当前完整路径含 query)>`（`LoginForm` 已支持 `next`），登录后回到本页继续。

## 4. 主题编辑器

### 4.1 数据模型（移植 APP `theme/types.ts`，字段名不改）

```ts
type ThemePreset = 'default' | 'custom'
interface OpacityLevels { level97, level95, level90, level85, level80, level75, level70, level60, level50, level45, level40, level35, level30, level25, level20, level15, level10: number }  // 0–100
interface GlassConfig { baseColor: string; opacity: number; blur: number; saturation: number; borderOpacity: number; opacityLevels?: OpacityLevels }
interface CustomColors { primary: string; accent?: string; glass?: GlassConfig }
interface ThemeConfig { preset: ThemePreset; customColors: CustomColors }   // 没有 mode：明暗留在 settingsStore.theme
```

默认值（APP `presets.ts`）：`primary '#3b82f6'`、`accent '#8b5cf6'`、`glass { baseColor '#ffffff', opacity 0.8, blur 16, saturation 180, borderOpacity 0.3 }`；`opacityLevels` 默认为各 level 同名数值（97、95、…、10）。取值范围照 APP：`blur 4–40`、`saturation 100–250`、`borderOpacity 0.1–0.6`、每个 level `0–100`。

### 4.2 生成器（移植 APP `theme/generator.ts` + `theme/utils.ts`）

- 引入 `culori`（OKLCH），版本与 APP 同款 `^4.0.2`（+ `@types/culori`）。
- `generateThemeData({ preset, customColors, isDark }): ThemeData`——输出与 `globals.css` **同名**的整组变量：`--primary/-hover/-active/-subtle/-text`、`--accent-*`、`--bg-*`、`--text-*`、`--border-*`、`--status-*`、`--shadow-*`、`--color-primary-1..12 / -accent-1..12 / -neutral-1..12`、`--white-alpha-10..97`、`--glass-*`、`--blur-*`。
- **对照用例**：用默认预设 + 浅色 / 深色跑生成器，输出必须逐键等于 `globals.css` 里 `:root` / `.dark` 的值（上期就是用这个生成器产出的静态 CSS）。这条用例既是移植正确性的证据，也是「默认预设不写内联变量」这个优化的前提。
- `toCssVariables(themeData): Record<string, string>`（`--name → value`）。

### 4.3 存储与应用

- `themeStore`（zustand persist，key **`huanvae.theme`**，**设备级**：进 `sessionScope.ts` 的 `DEVICE_SCOPED_KEYS`，登出不清；与 APP 的 `huanvae-theme` 同义）。持久化 `{ config, snapshot }`：`snapshot = { light: Record<string,string>, dark: Record<string,string> } | null`，`preset === 'custom'` 时才有（两套模式各一份，切明暗不用重新生成）。
- 动作：`setPreset`、`setPrimaryColor`、`setAccentColor`、`setGlassConfig(partial)`、`setOpacityLevel(key, value)`、`reset()`；每次改动同步重算 `snapshot`。
- `ThemeProvider`（挂在 `root.tsx` 的 `SettingsSync` 旁）：订阅 `themeStore` 与 `settingsStore.theme`；`preset === 'default'` → 清掉 `:root` 上所有本模块写过的内联变量（记录写过的键名），页面回到静态 CSS；`custom` → 按当前明暗把 `snapshot.light / dark` 逐键 `style.setProperty`。跨标签页：监听 `storage` 事件 key `huanvae.theme`，`setState` 后重应用（APP `ThemeProvider.tsx:221-245` 同款）。
- 防闪：`root.tsx` 的内联脚本在现有明暗逻辑之后追加——读 `huanvae.theme`，若 `state.config.preset === 'custom'` 且有 `snapshot`，按 `isDark` 把对应那份 `Object.entries` 逐条 `setProperty`。脚本只做赋值不做计算，`culori` 不进内联脚本。
- 编辑器在 `AppearanceSection` 内展开：模式三选一（不动）→ 预设（默认 / 自定义，卡片带三色预览）→ 自定义色（`react-colorful` `HexColorPicker` × 2，仅 custom 时显示）→ 毛玻璃（底色 + 3 滑块）→ 高级透明度（6 组 17 滑块，默认折叠，组名与 APP 一致：弹窗层 / 主背景层 / 卡片层 / 面板层 / 辅助层 / 遮罩层）→ 重置。滑块 50ms 防抖写 store（APP 同款）。所有文案走 `shell.settings.theme.*`。
- 引入 `react-colorful ^5.7.0`（APP 同款，无依赖，约 3KB）。

## 5. 黑名单

- API（`src/features/chat/api/friends.ts` 追加，严格解析）：`getBlacklist(): Promise<BlacklistedUser[]>`（`GET /api/friends/blacklist`，`BlacklistedUser { user_id: string; user_nickname: string | null; user_avatar_url: string | null; created_at: string }`，头像相对路径经 `toAbsoluteApiUrl`）；`addBlacklist(targetUserId)`（`POST /api/friends/blacklist` body `{ target_user_id }`，无 data）；`removeBlacklist(targetUserId)`（`DELETE /api/friends/blacklist/{target_user_id}`）。
- `friendsStore` 追加：`blacklist: BlacklistedUser[]`、`blacklistLoaded: boolean`、`loadBlacklist()`、`addBlacklist(userId)`、`removeBlacklist(userId)`；两个动作成功后把 `friends[].is_blacklisted` 同步翻转（APP `useBlacklist` 的 `setFriendBlacklisted` 同义），并从 / 向 `blacklist` 列表增删（`addBlacklist` 后用好友的昵称 / 头像本地补一条，不重拉）。会话边界：随 `registerPristineStoreReset` 归零。
- UI：
  - `AccountSection` 加 `<SettingsSection title=黑名单>` 内嵌 `BlacklistPanel`：加载 / 错误可重试 / 空态「没有拉黑任何人」；每行 头像 / 昵称 / `@id` / 拉黑时间；「取消拉黑」两步确认（APP 同款）；顶部提示文案照抄 APP：「被拉黑的用户与你互相收不到对方发送的消息；好友关系仍保留」。
  - `ProfileView`（联系人右栏）：好友时显示「拉黑」或「取消拉黑」（按 `is_blacklisted`），拉黑走 `window.confirm`（与删除好友一致），失败显示错误行。
  - `ConversationCard` / `ContactsList` 的行：`is_blacklisted` 为真时名字加 `text-muted-foreground line-through`-级的标灰（契约注释「前端据此标灰 / 分组」，只标灰不分组）。`UnifiedConversation` 加 `blacklisted: boolean`。

## 6. OAuth

### 6.1 API（`src/features/oauth/api/oauth.ts`，严格解析，全部经 BFF 同源 `/api/*`）

```ts
interface OAuthClient { client_id: string; client_type: string; app_name: string; app_description: string; app_homepage_url: string | null; app_logo_url: string | null; redirect_uris: string[]; allowed_scopes: string[]; is_active: boolean; created_at: string }
interface CreateClientRequest { app_name: string; app_description?: string; app_homepage_url?: string; app_logo_url?: string; redirect_uris: string[]; scopes?: string[] }
interface CreateClientResponse { client_id: string; client_secret: string; app_name: string }
interface OAuthGrant { id: string; client_id: string; app_name: string; app_logo_url: string | null; scope: string; created_at: string }
interface AuthorizeRequest { client_id: string; redirect_uri: string; scope?: string; state?: string; code_challenge?: string; code_challenge_method?: 'S256'; consent?: boolean }
type AuthorizeResult = { kind: 'code'; code: string; state: string | null; redirect_uri: string } | { kind: 'consent'; app_name: string; app_logo_url: string | null; scopes: string[] }
listClients / createClient / deleteClient(clientId) / resetClientSecret(clientId): Promise<{ client_secret: string }> / listGrants / revokeGrant(grantId) / authorize(req): Promise<AuthorizeResult>
```

`app_logo_url` 经 `resolveSameOriginUrl` 同源校验（上期小程序同规则，站外 → `null` 不渲染）。scope 标签：`profile 基本资料 / email 邮箱 / friends 好友数 / groups 群数`（APP `SCOPE_LABELS`）。

### 6.2 已授权应用（设置分区 `apps`）

`AppsSection`：`listGrants` → 卡片（logo 或首字 / 应用名 / scope 标签 / 相对时间「x 天前授权」）+ 两步「取消授权」→ `revokeGrant` → 本地移除；空态「还没有授权任何应用」；错误可重试。

### 6.3 我的客户端（小程序模态框第二个 tab）

`/app/miniapps` 的 `RouteDialog` 加顶部分段「我的小程序 / OAuth 客户端」；`OAuthClientsPanel`：`listClients` → `ClientCard`（应用名、`client_type` 标签、`client_id` + 复制按钮（Clipboard API，成功 toast）、scope、回调地址列表；`client_type === 'external'` 才有「重置密钥」「删除」，均两步确认）；「新建客户端」对话框（名称 必填 / 描述 / 主页 / 回调地址多条可增删（至少一条，必须是绝对 http(s) 或以 `/` 开头）/ scope 勾选，默认 `profile`）→ `createClient` → `SecretDisplay`（`client_secret` 只显示一次，复制按钮 + 「我已保存」才关闭）；重置密钥同样进 `SecretDisplay`。

### 6.4 托管授权页 `/app/oauth/authorize`

1. 解析 query；`client_id` 或 `redirect_uri` 缺失 → 错误页「无效的授权请求」（不跳转）。
2. 未登录 → `replace('/app/login?next=' + encodeURIComponent(location.pathname + location.search))`。
3. 已登录：先 `authorize(req)`（不带 `consent`）。
   - `kind: 'code'`（内部客户端或已授权的外部客户端）→ 直接跳。
   - `kind: 'consent'` → 展示 `app_name` / logo / scope 列表 + 「允许」「拒绝」；允许 → `authorize({ ...req, consent: true })` → 跳；拒绝 → 跳 `redirect_uri` 加 `error=access_denied`（+ `state`）。
4. **跳转目标只用后端回传的 `redirect_uri`**（`kind: 'code'` 里的），不用页面自己的 query（后端已按注册白名单校验；页面不做开放重定向）。拒绝分支没有后端回传，用 query 里的 `redirect_uri` 但必须满足：绝对 `http(s)` 或以 `/` 开头，否则只显示「已拒绝」不跳转。跳转用 `window.location.assign`，用 `URL` 拼 `code / state / error` 参数（保留原有 query）。
5. 请求失败（400/404/403）→ 显示后端文案 + 「返回聊天」链接。
6. 页面样式：居中的 `glass-card`，与登录页同一背景；文案 `shell.oauth.*`。

## 7. 通知提示音

- 内置：把 APP 的 `Notification-Sounds/water.mp3`（19 KB）复制到 `public/sounds/water.mp3`；再保留一个 `classic`（= 现在的合成音）。`SoundOption { id: string; name: string; kind: 'builtin' | 'custom'; src: string | null }`。
- 自定义：`src/features/settings/sounds/soundLibrary.ts` 用原生 IndexedDB（库 `huanvae-sounds`，store `sounds`，键 `id`，值 `{ id, name, blob, createdAt }`），`listCustom / saveCustom(file) / deleteCustom(id)`；只收 `audio/mpeg`，≤ 2 MB，文件名（去扩展名）作 name，重名加序号；播放用 `URL.createObjectURL(blob)`（用完 revoke）。设备级：`sessionScope` 只清 localStorage / sessionStorage，IndexedDB 天然不在清盘范围——与 APP 的用户目录同义，注释里写明。
- `settingsStore` 加 `notificationSound: string`（默认 `'water'`；设备级字段，进 `DEVICE_SCOPED_SETTING_FIELDS`）。
- 播放：`useSound.ts` 的 `SoundManager` 加 `playFile(src)`（`HTMLAudioElement`，音量 = 主音量，AudioContext 不参与）；`playMessage / playNotification` 改为：`notificationSound === 'classic'` 或文件播放失败 → 合成音；否则 `playFile`。选中项由 `SettingsSync` 同步进 manager（同 `soundEnabled / soundVolume` 的做法）。其余 `tap / button / …` 不变。
- UI（`NotificationsSection`）：现有三行下加「提示音」列表：每行 选中态（`role=radio`，原生 radio + label）/ 名称 / 试听（播放 ⇄ 停止）/ 删除（仅 custom，两步）；「上传自定义提示音」（`<input type=file accept="audio/mpeg">`）；选中即试听（APP 同款）；上传 / 删除错误显示在列表下。

## 8. 收尾与删除

- `CreateGroupDialog`（`src/features/chat/components/sidebar/CreateGroupDialog.tsx`，props `{ open, onClose, onCreated? }`）从 `GroupList.tsx` 抽出，`GroupList` 与 `ContactsList`（`?add=create-group` 面板只渲染它，关闭即清 `add` 参数）共用；删除 `dialogOnly` / `initialCreateOpen` 两个 prop 及其用例。
- `AccountSection` 加「修改密码」行（`NavLink` 到 `/app/profile`，副标题「在资料对话框中修改」）。
- 删除：`src/features/settings/components/SettingsModal.tsx`（+ 测试，若有）、`src/types/models.ts` 里的死 `Friend` 副本（若整个文件只剩它则删文件）。删之前 `grep` 证明零引用。
- 上期延后的两条顺手一起：`chatPath` 对参数 `encodeURIComponent`（与 `contactFriendPath` 一致）；`formatMessageTime` 补零点与 7 天边界用例。

## 9. 持久化与会话边界

| 数据 | 位置 | 级别 |
|---|---|---|
| 主题配置与快照 | localStorage `huanvae.theme` | 设备级（进 `DEVICE_SCOPED_KEYS`） |
| 明暗模式 | `settingsStore.theme`（不变） | 设备级 |
| 提示音选择 | `settingsStore.notificationSound` | 设备级字段 |
| 自定义提示音文件 | IndexedDB `huanvae-sounds` | 设备级（不在清盘范围，注释说明） |
| 黑名单 | `friendsStore.blacklist` 内存 | 账号级，登出归零 |
| OAuth 客户端 / 授权 | 组件内存态（按需拉取） | 账号级 |
| 授权页的 `next` 回跳 | 仅 URL query | — |

## 10. 迁移顺序（每步可独立上线）

1. 主题生成器移植 + 对照用例（纯逻辑，不接 UI）。
2. `themeStore` + `ThemeProvider` + 防闪脚本 + 外观分区编辑器。
3. 黑名单 API / store / 设置内嵌面板 / `ProfileView` 按钮 / 列表标灰。
4. OAuth API + 已授权应用分区 + 路由注册。
5. OAuth 客户端面板（小程序模态框第二 tab）。
6. 托管授权页。
7. 提示音库（内置 + IndexedDB）+ 播放接线 + 选择器 UI。
8. 收尾：`CreateGroupDialog` 抽出、修改密码入口、删除孤儿、两条延后 Minor；e2e 加用例并全量跑一次；`bun --bun run build`。

## 11. 测试

- 生成器：默认预设浅 / 深两套输出与 `globals.css` 逐键相等（从 CSS 文本解析出变量表做期望，不是从生成器自己拼）；自定义主色改变后 `--primary` 系列变化而 `--neutral-*` 不变（正对照）；透明度 level 改动只影响对应 `--white-alpha-N`。
- `ThemeProvider`：默认预设不写内联变量（`document.documentElement.style.length === 0` 的正对照）；切到 custom 写入 / 切回 default 清除；`storage` 事件触发重应用。
- 黑名单：解析器严格（缺 `user_id` 抛 `ApiShapeError`）；store 动作成功后 `friends[].is_blacklisted` 翻转（正对照：失败不翻转）；面板两步确认（第一次点不调 API）。
- OAuth：解析器严格；授权页三条路径（内部客户端直接跳、外部客户端同意后跳、拒绝带 `error=access_denied`）+ 缺参数不跳 + 未登录带 `next` 去登录；跳转目标来自后端回传（变异：改用 query 的 `redirect_uri` 必红）；`SecretDisplay` 只在「我已保存」后关闭。
- 提示音：`soundLibrary` 用 `fake-indexeddb` 跑（新增 devDependency）；类型 / 大小校验；`SoundManager.playMessage` 在 `notificationSound='water'` 时调 `playFile` 而不是合成音（正对照 `classic`）；播放失败回退合成音。
- 纪律沿用上期：字面量期望、负断言配正对照、真表 i18n mock、`createMemoryRouter`、不 mock `@/lib/navigation`、`biome-ignore` 零容忍、圆角别名。
- e2e：`tests/chat.spec.ts` 加一条「设置六个分区可达 + 授权页缺参数显示错误页」（授权流本身依赖真实 client，不进 e2e）；收口时全量跑一次。

## 12. 已知风险与开放问题

- `culori` 在 Bun 构建路径（Docker）下必须可 bundle：纯 ESM 无 Node 内建依赖，风险低；第 1 步就跑 `bun --bun run build` 验证。
- 自定义主题的内联变量会覆盖 `.dark` 的静态值——切明暗时必须重写另一份快照，否则深色下出现浅色变量；`ThemeProvider` 同时订阅两个 store。
- `HTMLAudioElement` 首次播放受浏览器自动播放策略限制：用户已与页面交互（登录、点击）后才会响；试听按钮本身是交互，无此问题。
- IndexedDB 在隐私模式可能不可用：`soundLibrary` 全部 `try/catch`，失败时选择器隐藏上传按钮并提示。
- 授权页的拒绝分支使用 query 里的 `redirect_uri`（后端没有回传）——限定 http(s) 绝对地址或站内相对路径，已在 §6.4 写明。
- `/app/oauth/authorize` 在 `protected-layout` 之下：`ProtectedRoute` 的未登录跳转不带 `next`，本页在它之前用 `useAuthStore` 自行判断并带 `next` 跳转（顺序：本页效果先于 `ProtectedRoute` 的 `replace`？——**实现时验证**，若 `ProtectedRoute` 抢先，改为把 `next` 支持加进 `ProtectedRoute`（对所有受保护页都有益）。

## 13. 与后续期的接口

- `themeStore` / `generateThemeData` 是第 7 期移动端页面组共用的主题源；第 3 期聊天面板的新组件只能用 token。
- `oauthApi.authorize` 与授权页的 consent UI 是第 5 期小程序内嵌时复用的部件（小程序容器里改为弹窗形态）。
- `soundLibrary` 的 `SoundOption` 供第 3 期「按会话静音 / 特别关心提示音」扩展。
- `friendsStore.blacklist` 供第 3 期群消息折叠（APP `getBlacklistTimes` 按拉黑时间折叠群内消息）。
