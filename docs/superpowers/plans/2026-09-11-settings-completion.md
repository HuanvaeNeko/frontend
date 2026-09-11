# Web 对齐 APP · 第 2 期：设置补全 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 APP 设置面板里剩下的四块功能——主题编辑器（OKLCH 生成器 + 运行时 CSS 变量）、黑名单、OAuth（已授权应用 / 我的客户端 / 托管授权页 `/app/oauth/authorize`）、通知提示音（内置 + IndexedDB 自定义）——搬进 Web 的 `/app/settings/*`，并收掉上期终审留下的 `CreateGroupDialog` 抽出、修改密码入口、孤儿文件三件事。

**Architecture:** 主题走「生成器 → 快照 → 内联变量」三段：`src/features/theme/` 移植 APP 的 `culori` 生成器并输出与 `globals.css` **同名同值**的 115 个变量（默认预设逐键相等，已用 spike 验证），`themeStore`（localStorage `huanvae.theme`，设备级）只在 `preset === 'custom'` 时持久化 `{light, dark}` 两份快照，`ThemeProvider` + `root.tsx` 防闪脚本只做 `setProperty` 不做计算；默认预设**不写任何内联变量**，首屏与上期逐字节相同。黑名单进 `friendsStore`（账号级，`registerPristineStoreReset` 归零），OAuth 是组件内存态 + 一个全屏授权页，提示音是 `settingsStore.notificationSound` 设备级字段 + `SoundManager.playFile`。

**Tech Stack:** React Router 8.3（framework mode，配置式路由 `src/app/routes.ts`）、React 19、zustand 5 + `sessionScopedLocalStorage`、Tailwind v4 + shadcn/Radix、vitest 5 + happy-dom + @testing-library、Playwright、Bun 1.3.14 生产构建；新增 `culori ^4.0.2`（+ `@types/culori`）、`react-colorful ^5.7.0`、devDependency `fake-indexeddb`。

**Spec:** `docs/superpowers/specs/2026-09-11-settings-completion-design.md`（§1–§13；本计划的每个任务在标题下注明对应章节）。上期 spec / plan：`docs/superpowers/specs/2026-09-10-app-shell-alignment-design.md`、`docs/superpowers/plans/2026-09-10-app-shell-alignment.md`。

**APP 参考源码（移植依据）：** 已复制到 `.superpowers/sdd/2026-09-11-settings-completion/app-ref/`（`theme/*`、`api/oauth.ts`、`api/friends.ts`、`hooks/useOAuthGrants.ts`、`hooks/useOAuthClients.ts`、`hooks/useNotificationSounds.ts`、`hooks/useBlacklist.ts`、`components/settings/{AuthorizedAppsPanel,BlacklistPanel,SoundSelector}.tsx`、`components/oauth/{OAuthClientsPanel,OAuthConsentModal}.tsx`、`components/common/SecretDisplay.tsx`、`sounds/water.mp3`）。该目录是 git-ignored 的工作区，任务文本里引用它时用这个相对路径；若目录不存在，从 github.com/huanwei520/Huanvae-Chat-App 的 `src/` 同名路径取（`water.mp3` 在 `Notification-Sounds/water.mp3`）。**只读**：任何任务都不把它复制进 `src/` 之外的位置，也不 commit 它。

## Global Constraints

（每个任务的要求都隐含本节。逐条抄自 spec 与上期 plan 的纪律；执行者与审阅者都以此为准。）

- **分支与目录**：工作在 `feat/settings-completion`（从 `d607a6f` 起），worktree `/Users/i/Code/huanvae/frontend/.claude/worktrees/app-shell`。**不读** `/Users/i/Code/huanvae/backend/`（那是过期文档快照，后端契约以 github HuanvaeNeko/backend-docs 为准，本计划已把需要的契约逐字写进任务）。
- **不提交**：`.superpowers/`、`build/`、`.react-router/`、`*.sqlite*`、`.env*.local`、`.claude/`、`playwright-report/`、`test-results/`。永远不用裸 `git stash`。
- **依赖版本（spec §4.2 / §4.3 / §11）**：`culori` `^4.0.2`（`bun add culori@^4.0.2`）、`@types/culori`（devDependency，`bun add -d @types/culori`）、`react-colorful` `^5.7.0`、`fake-indexeddb`（devDependency）。不加其它依赖。
- **构建门槛**：`bun --bun run build` 必须成功（Docker 里就是这样跑的；`culori` 纯 ESM，第 1 个任务就验证）。`bun run typecheck` 0 错误（当前基线 0）。`bun run lint` 基线 **158 warnings / 22 infos / 0 errors**——只能降不能升；**禁止**新增任何 `biome-ignore`。
- **测试纪律（spec §11）**：期望值一律**字面量**（不用「生成器自己拼出来的值」当期望）；负断言必须配正对照；i18n 用「对真实 `zhCN` 字典做路径查找」的 mock（见 `src/components/shell/__tests__/ProfileView.test.tsx` 顶部，**identity `t` 禁用**）；组件测试用 `createMemoryRouter`；**不 mock `@/lib/navigation`**；圆角只用别名（8→`rounded-sm`、12→`rounded-md`、14→`rounded-lg`、16→`rounded-xl`、22→`rounded-2xl`、28→`rounded-3xl`，其它值用 `rounded-[Npx]`）。
- **e2e 只在收口时跑一次**（Task 8 末尾）：`bun run test:e2e`；沙箱 `navigator.language=en-US`，所有文案匹配写成中英双语正则（`/设置|Settings/`）。中途任务只跑 vitest 全量 `bun run test`。
- **文案**：所有新 UI 文案进 `src/i18n/messages.ts` 的 `shell.*` 命名空间（zh 与 en 两份都加，键名一致；`src/i18n/__tests__/messages.test.ts` 不检查键集合，但审阅者会）。禁止硬编码中文。
- **API 解析**：每个新端点都用 `readEnvelope` / `readEnvelopeList` / `assertEnvelopeOk`（`src/lib/apiEnvelope.ts`）+ `src/lib/apiParse.ts` 的 `asRecord / str / nullableStr / bool / arr / describe` 严格解析；缺必需字段抛 `ApiShapeError`。注意 `str()` **拒绝空串**——可为空串的字段（如 `app_description`）用 `typeof r.x === 'string' ? r.x : ''`。同源：`fetchWithAuth('/api/...')` 相对路径，不拼 host。
- **会话边界**：新增 store 字段若是账号级，必须被 `registerPristineStoreReset` / `registerSessionReset` 覆盖；设备级键 / 字段登记进 `src/lib/sessionScope.ts` 的 `DEVICE_SCOPED_KEYS` / `DEVICE_SCOPED_SETTING_FIELDS`，并写明「为什么属于设备」。
- **主题不变量（spec §1 完成判定）**：`preset === 'default'` 时 `document.documentElement.style` 上**没有**本模块写过的任何变量；生成器对默认预设（浅 / 深）的输出逐键等于 `globals.css` 的 `:root` / `.dark`。
- **提交**：每个任务至少一次 commit，message 用中文 conventional 风格（`feat(theme): …`、`test(oauth): …`），结尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- **回复语言**：简体中文；代码、符号、命令原样。

---

## File Structure

新建（按任务归属）：

| 文件 | 职责 | 任务 |
|---|---|---|
| `src/features/theme/types.ts` | `ColorScale / ThemePreset / OpacityLevels / GlassConfig / CustomColors / ThemeConfig / SemanticTokens / ThemeData / ThemeSnapshot` | 1 |
| `src/features/theme/utils.ts` | `generateColorScale / generateNeutralScale / hexToRgb / withAlpha / generateShadows`（APP `theme/utils.ts` 逐行移植，culori OKLCH） | 1 |
| `src/features/theme/presets.ts` | `DEFAULT_OPACITY_LEVELS / DEFAULT_GLASS_CONFIG / DEFAULT_CUSTOM_COLORS / THEME_PRESETS / getPresetConfig` | 1 |
| `src/features/theme/generator.ts` | `generateThemeData({ preset, customColors, isDark })`、`toCssVariables(themeData, glass, isDark)`、`buildSnapshot(config)` | 1 |
| `src/features/theme/__tests__/generator.test.ts` | 默认预设浅 / 深与 `globals.css` 逐键相等（115 键）；自定义主色只动 primary 系；透明度只动对应 alpha | 1 |
| `src/features/theme/store.ts` | `useThemeStore`（persist `huanvae.theme`，`{ config, snapshot }`），动作 `setPreset / setPrimaryColor / setAccentColor / setGlassConfig / setOpacityLevel / reset / setConfig` | 2 |
| `src/features/theme/applyTheme.ts` | `applyThemeSnapshot(root, vars)`、`clearThemeVariables(root)`（记录写过的键名） | 2 |
| `src/features/theme/ThemeProvider.tsx` | 订阅 `themeStore` + `settingsStore.theme`，写 / 清内联变量，`storage` 事件跨标签同步 | 2 |
| `src/features/theme/__tests__/store.test.ts`、`__tests__/ThemeProvider.test.tsx` | 见 Task 2 | 2 |
| `src/components/shell/settings/ThemeEditor.tsx` | 预设卡片 / 两个取色器 / 毛玻璃 4 滑块 / 高级透明度 17 滑块 / 重置（`react-colorful`） | 2 |
| `src/components/shell/settings/__tests__/ThemeEditor.test.tsx` | 见 Task 2 | 2 |
| `src/components/shell/settings/BlacklistPanel.tsx` | 黑名单内嵌面板（两步确认） | 3 |
| `src/components/shell/settings/__tests__/BlacklistPanel.test.tsx` | 见 Task 3 | 3 |
| `src/features/oauth/api/oauth.ts` | `oauthApi.{listClients, createClient, deleteClient, resetClientSecret, listGrants, revokeGrant, authorize}` + 解析器 + `SCOPE_LABEL_KEYS` | 4 |
| `src/features/oauth/api/__tests__/oauth.test.ts` | 解析器严格性 / 请求形状 | 4 |
| `src/components/shell/settings/AppsSection.tsx` | 「授权与应用」分区（已授权应用卡片 + 两步撤销） | 4 |
| `src/components/shell/settings/__tests__/AppsSection.test.tsx` | 见 Task 4 | 4 |
| `src/features/oauth/components/SecretDisplay.tsx` | 只显示一次的凭据对话框（复制 + 「我已保存」才关） | 5 |
| `src/features/oauth/components/OAuthClientsPanel.tsx` | 客户端列表 / 创建对话框 / 删除 / 重置密钥 | 5 |
| `src/features/oauth/components/__tests__/OAuthClientsPanel.test.tsx` | 见 Task 5 | 5 |
| `src/features/oauth/lib/redirect.ts` | `isAllowedRedirectTarget(raw)`、`appendQuery(target, params)` | 6 |
| `src/features/oauth/components/AuthorizePage.tsx` | 托管授权页三条路径 | 6 |
| `src/app/routes/oauth-authorize.tsx` | 路由模块（`protected-layout` 之下、壳之外） | 6 |
| `src/features/oauth/components/__tests__/AuthorizePage.test.tsx`、`src/features/oauth/lib/__tests__/redirect.test.ts` | 见 Task 6 | 6 |
| `public/sounds/water.mp3` | APP 内置提示音（19 KB，二进制复制） | 7 |
| `src/features/settings/sounds/soundLibrary.ts` | `BUILTIN_SOUNDS`、`listCustom / saveCustom / deleteCustom`（IndexedDB `huanvae-sounds`）、`resolveSoundSrc` | 7 |
| `src/features/settings/sounds/__tests__/soundLibrary.test.ts` | `fake-indexeddb` | 7 |
| `src/components/shell/settings/SoundSelector.tsx` | 提示音列表 / 试听 / 上传 / 删除 | 7 |
| `src/components/shell/settings/__tests__/SoundSelector.test.tsx` | 见 Task 7 | 7 |
| `src/features/chat/components/sidebar/CreateGroupDialog.tsx` | 从 `GroupList.tsx` 抽出的建群对话框 | 8 |
| `src/features/chat/components/sidebar/__tests__/CreateGroupDialog.test.tsx` | 见 Task 8 | 8 |

修改：`src/styles/globals.css`（不改值；Task 2 加一行注释）、`src/app/root.tsx`（防闪脚本追加 + 挂 `ThemeProvider`）、`src/lib/sessionScope.ts`（`huanvae.theme` 键、`notificationSound` 字段）、`src/components/shell/settings/{AppearanceSection,NotificationsSection,AccountSection,sections}.tsx`、`src/lib/routes.ts`（`SETTINGS_SECTIONS` 加 `apps`、`chatPath` 编码、`ROUTES.app.oauthAuthorize`）、`src/app/routes.ts`（授权页路由）、`src/app/routes/shell/miniapps.tsx`（第二个 tab）、`src/features/chat/api/friends.ts`（黑名单三接口）、`src/features/chat/store/friendsStore.ts`（黑名单状态 / 动作）、`src/features/chat/store/__tests__/friendsStore.test.ts`（矩阵扩容）、`src/components/shell/ProfileView.tsx`（拉黑按钮）、`src/components/shell/ContactsList.tsx`（标灰 + `CreateGroupDialog`）、`src/components/shell/ConversationCard.tsx`（标灰）、`src/features/chat/hooks/useUnifiedConversations.ts`（`blacklisted`）、`src/features/auth/components/ProtectedRoute.tsx`（`next` 回跳）、`src/features/settings/store/settingsStore.ts`（`notificationSound`）、`src/hooks/useSound.ts`（`playFile` + 选中音）、`src/features/chat/components/sidebar/GroupList.tsx`（删内嵌对话框与两个 prop）、`src/i18n/messages.ts`、`tests/chat.spec.ts`、`package.json`。

删除（Task 8）：`src/features/settings/components/SettingsModal.tsx`、`src/types/models.ts` 里的 `Friend` 接口。

---
### Task 1: 主题生成器移植 + 与 `globals.css` 的逐键对照用例（spec §4.1 / §4.2 / §10.1 / §11）

**Files:**
- Create: `src/features/theme/types.ts`
- Create: `src/features/theme/utils.ts`
- Create: `src/features/theme/presets.ts`
- Create: `src/features/theme/generator.ts`
- Test: `src/features/theme/__tests__/generator.test.ts`
- Modify: `package.json`（`bun add culori@^4.0.2`、`bun add -d @types/culori`）

**Interfaces:**
- Consumes: APP 源 `app-ref/theme/{types,utils,presets,generator}.ts`（移植依据）；`src/styles/globals.css` 的 `:root` / `.dark`（期望值来源）。
- Produces（Task 2 直接依赖）:
  - `type ThemePreset = 'default' | 'custom'`；`interface ThemeConfig { preset: ThemePreset; customColors: CustomColors }`（**没有 `mode`**，明暗留在 `settingsStore.theme`）；`interface GlassConfig { baseColor: string; opacity: number; blur: number; saturation: number; borderOpacity: number; opacityLevels?: OpacityLevels }`；`type CssVariables = Record<string, string>`；`interface ThemeSnapshot { light: CssVariables; dark: CssVariables }`。
  - `DEFAULT_OPACITY_LEVELS`、`DEFAULT_GLASS_CONFIG`、`DEFAULT_CUSTOM_COLORS`、`THEME_PRESETS`、`getPresetConfig(preset)`、`OPACITY_LEVEL_KEYS`（17 个 key 的有序数组）、`OPACITY_GROUPS`（6 组，编辑器用）。
  - `generateThemeData(input: ThemeConfig & { isDark: boolean }): ThemeData`；`toCssVariables(data: ThemeData, glass: GlassConfig, isDark: boolean): CssVariables`（**恰好 115 个键**）；`buildSnapshot(config: ThemeConfig): ThemeSnapshot`；`resolveColors(config): Required<Pick<CustomColors,'primary'>> & CustomColors`；`resolveGlass(config): GlassConfig`。

**与 APP 的三处有意差异（已在 spec §4.1 / §4.2 写明，审阅时不要当成移植错误）：**
1. `borderOpacity` 默认 **0.6**、范围 0.1–0.8（APP 是 0.3 / 0.1–0.6）：上期静态 CSS 的 `--glass-border` 取自 APP `variables.css` 的 `rgba(255,255,255,0.6)`；深色一律 `rgba(255, 255, 255, round(borderOpacity/5, 2))`（默认 0.12），边框恒用白色不用底色。
2. `--blur-*` 用函数形式 `blur(Npx)` 且比例按 Web 静态值反推：xs = round(blur×0.375)、sm = round(blur×0.625)、md = round(blur×0.75)、lg = blur、xl = round(blur×1.5)、`--glass-backdrop` 用 round(blur×1.25)；`--saturate-normal` = round(saturation×5/6)、`--saturate-high` = saturation。blur=16 / saturation=180 时恰好是 6/10/12/16/24、20、150/180。
3. 深色模式下 `glass.baseColor === '#ffffff'` 视为「跟随模式」，底色改用 `neutralScale[3]`（默认 `#14171c` → `rgb(20, 23, 28)`，与 `.dark` 里的 `--white-alpha-*` / `--glass-white-*` 一致）；用户改过底色则两种模式都用用户的颜色。alpha 文本用 `String(level / 100)`（`0.9` 而不是 APP 的 `toFixed(2)` → `0.90`），否则与 CSS 不相等。

- [ ] **Step 1: 装依赖并确认 Bun 构建路径能 bundle culori**

```bash
bun add culori@^4.0.2
bun add -d @types/culori
grep -n '"culori"\|"@types/culori"' package.json
```
Expected: `"culori": "^4.0.2"` 在 dependencies，`"@types/culori"` 在 devDependencies。

- [ ] **Step 2: 写类型文件 `src/features/theme/types.ts`**

```ts
/**
 * 主题系统类型（移植 APP `theme/types.ts`，字段名不改；去掉 `mode`——明暗留在
 * `settingsStore.theme`，见 spec §2）。
 */
export interface ColorScale {
  1: string; 2: string; 3: string; 4: string; 5: string; 6: string
  7: string; 8: string; 9: string; 10: string; 11: string; 12: string
}

export type ThemePreset = 'default' | 'custom'

/** 各 UI 层级透明度，0–100（百分比）。分组见 presets.ts 的 OPACITY_GROUPS。 */
export interface OpacityLevels {
  level97: number; level95: number; level90: number; level85: number; level80: number; level75: number
  level70: number; level60: number; level50: number; level45: number; level40: number; level35: number
  level30: number; level25: number; level20: number; level15: number; level10: number
}

export interface GlassConfig {
  /** 底色（HEX）；深色模式下 '#ffffff' 视为「跟随模式」，见 generator.ts */
  baseColor: string
  /** APP 的历史字段，生成器不读它；保留是为了与 APP 的持久化形状一致 */
  opacity: number
  /** 模糊度 4–40 px */
  blur: number
  /** 饱和度 100–250 % */
  saturation: number
  /** 边框透明度 0.1–0.8（Web 默认 0.6，见 spec §4.1） */
  borderOpacity: number
  opacityLevels?: OpacityLevels
}

export interface CustomColors {
  primary: string
  accent?: string
  glass?: GlassConfig
}

export interface ThemeConfig {
  preset: ThemePreset
  /** preset === 'custom' 时生效；default 时忽略（但保留，切回 custom 时复用） */
  customColors: CustomColors
}

export interface SemanticTokens {
  bg: { primary: string; secondary: string; tertiary: string; surface: string; surfaceHover: string; muted: string; inverse: string }
  text: { primary: string; secondary: string; muted: string; light: string; inverse: string; link: string }
  border: { default: string; subtle: string; strong: string; focus: string }
  primary: { default: string; hover: string; active: string; subtle: string; text: string }
  accent: { default: string; hover: string; active: string; subtle: string; text: string }
  status: { success: string; successSubtle: string; warning: string; warningSubtle: string; error: string; errorSubtle: string; info: string; infoSubtle: string }
  shadow: { sm: string; md: string; lg: string; glow: string; focus: string }
}

export interface ThemeData {
  primaryScale: ColorScale
  accentScale: ColorScale
  neutralScale: ColorScale
  semantic: SemanticTokens
}

/** `--name → value`，直接喂 `style.setProperty` */
export type CssVariables = Record<string, string>

/** 两种模式各一份，切明暗不重算（spec §4.3） */
export interface ThemeSnapshot {
  light: CssVariables
  dark: CssVariables
}
```

- [ ] **Step 3: 写 `src/features/theme/utils.ts`（APP `theme/utils.ts` 逐函数移植；`forEach` 改 `for…of`，`parseInt` 改 `Number.parseInt`，去掉 `console.warn`）**

```ts
import { formatHex, oklch, parse } from 'culori'
import type { ColorScale } from './types'

/** 浅色模式 12 级亮度（APP theme/utils.ts LIGHT_MODE_LIGHTNESS，逐值相同） */
const LIGHT_MODE_LIGHTNESS = [0.985, 0.965, 0.925, 0.885, 0.825, 0.745, 0.645, 0.565, 0.485, 0.425, 0.365, 0.255]
/** 深色模式 12 级亮度（APP DARK_MODE_LIGHTNESS） */
const DARK_MODE_LIGHTNESS = [0.135, 0.165, 0.205, 0.255, 0.315, 0.385, 0.465, 0.545, 0.625, 0.705, 0.795, 0.895]

const FALLBACK_PRIMARY = '#3b82f6'

/** 从单一主色生成 12 级色阶：保持 OKLCH 的色相与饱和度，只换亮度。解析失败回退默认蓝。 */
export function generateColorScale(baseColor: string, isDark = false): ColorScale {
  const parsed = parse(baseColor)
  const base = parsed ? oklch(parsed) : undefined
  if (!base) return generateColorScale(FALLBACK_PRIMARY, isDark)
  const lightnesses = isDark ? DARK_MODE_LIGHTNESS : LIGHT_MODE_LIGHTNESS
  const scale: Partial<ColorScale> = {}
  for (const [i, l] of lightnesses.entries()) {
    const step = (i + 1) as keyof ColorScale
    scale[step] = formatHex({ ...base, l }) || baseColor
  }
  return scale as ColorScale
}

/** 中性色阶：取主色色相、chroma 0.01（几乎纯灰） */
export function generateNeutralScale(primaryColor: string, isDark = false): ColorScale {
  const parsed = parse(primaryColor)
  const base = parsed ? oklch(parsed) : undefined
  const hue = base?.h ?? 220
  const lightnesses = isDark ? DARK_MODE_LIGHTNESS : LIGHT_MODE_LIGHTNESS
  const scale: Partial<ColorScale> = {}
  for (const [i, l] of lightnesses.entries()) {
    const step = (i + 1) as keyof ColorScale
    scale[step] = formatHex({ mode: 'oklch', l, c: 0.01, h: hue }) || '#808080'
  }
  return scale as ColorScale
}

/** `#rrggbb` → `"r, g, b"`；非法输入回退白色 */
export function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255, 255, 255'
  return `${Number.parseInt(result[1], 16)}, ${Number.parseInt(result[2], 16)}, ${Number.parseInt(result[3], 16)}`
}

export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex)}, ${alpha})`
}

export function generateShadows(primaryColor: string): { sm: string; md: string; lg: string; glow: string; focus: string } {
  return {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    glow: `0 0 20px ${withAlpha(primaryColor, 0.25)}, 0 0 40px ${withAlpha(primaryColor, 0.15)}`,
    focus: `0 0 0 3px ${withAlpha(primaryColor, 0.15)}`,
  }
}
```

- [ ] **Step 4: 写 `src/features/theme/presets.ts`**

```ts
import type { CustomColors, GlassConfig, OpacityLevels, ThemePreset } from './types'

export const DEFAULT_OPACITY_LEVELS: OpacityLevels = {
  level97: 97, level95: 95, level90: 90, level85: 85, level80: 80, level75: 75,
  level70: 70, level60: 60, level50: 50, level45: 45, level40: 40, level35: 35,
  level30: 30, level25: 25, level20: 20, level15: 15, level10: 10,
}

/** 有序：编辑器与生成器都按这个顺序遍历 */
export const OPACITY_LEVEL_KEYS = [
  'level97', 'level95', 'level90', 'level85', 'level80', 'level75', 'level70', 'level60', 'level50',
  'level45', 'level40', 'level35', 'level30', 'level25', 'level20', 'level15', 'level10',
] as const satisfies ReadonlyArray<keyof OpacityLevels>

/** 高级透明度的 6 组（组名 i18n key 后缀与 APP 组名一致：弹窗层 / 主背景层 / 卡片层 / 面板层 / 辅助层 / 遮罩层） */
export const OPACITY_GROUPS: ReadonlyArray<{ key: string; levels: ReadonlyArray<keyof OpacityLevels> }> = [
  { key: 'dialog', levels: ['level97', 'level95'] },
  { key: 'background', levels: ['level90', 'level85'] },
  { key: 'card', levels: ['level80', 'level75'] },
  { key: 'panel', levels: ['level70', 'level60'] },
  { key: 'auxiliary', levels: ['level50', 'level45', 'level40', 'level35'] },
  { key: 'overlay', levels: ['level30', 'level25', 'level20', 'level15', 'level10'] },
]

/** Web 默认：borderOpacity 0.6（APP 0.3）——理由见 spec §4.1 与本任务标题下的差异说明 */
export const DEFAULT_GLASS_CONFIG: GlassConfig = {
  baseColor: '#ffffff',
  opacity: 0.8,
  blur: 16,
  saturation: 180,
  borderOpacity: 0.6,
  opacityLevels: DEFAULT_OPACITY_LEVELS,
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  primary: '#3b82f6',
  accent: '#8b5cf6',
  glass: DEFAULT_GLASS_CONFIG,
}

export const GLASS_RANGES = {
  blur: { min: 4, max: 40, step: 1 },
  saturation: { min: 100, max: 250, step: 5 },
  borderOpacity: { min: 0.1, max: 0.8, step: 0.05 },
} as const

export interface PresetConfig {
  /** i18n key 后缀：shell.settings.theme.preset.<nameKey> */
  nameKey: string
  colors: CustomColors
  previewColors: readonly [string, string, string]
}

export const THEME_PRESETS: Record<ThemePreset, PresetConfig> = {
  default: { nameKey: 'default', colors: DEFAULT_CUSTOM_COLORS, previewColors: ['#3b82f6', '#60a5fa', '#93c5fd'] },
  custom: { nameKey: 'custom', colors: DEFAULT_CUSTOM_COLORS, previewColors: ['#3b82f6', '#60a5fa', '#93c5fd'] },
}

export function getPresetConfig(preset: ThemePreset): PresetConfig {
  return THEME_PRESETS[preset]
}
```

- [ ] **Step 5: 写失败用例 `src/features/theme/__tests__/generator.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CUSTOM_COLORS, DEFAULT_GLASS_CONFIG } from '../presets'
import { buildSnapshot, generateThemeData, toCssVariables } from '../generator'
import type { ThemeConfig } from '../types'

/**
 * 期望值来自 `src/styles/globals.css` 的 CSS 文本本身（上期 Task 1 用同一个 APP 生成器
 * 产出的静态 CSS），不是从生成器自己拼——所以这组用例既证明移植正确，也是
 * 「默认预设不写内联变量」（spec §4.3）这个优化的前提：默认输出与静态 CSS 相等，
 * 不写等于写。
 */
const css = readFileSync(new URL('../../../styles/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function cssBlock(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`)
  const end = css.indexOf('\n}', start)
  if (start < 0 || end < 0) throw new Error(`globals.css 里找不到 ${selector} 块`)
  const out: Record<string, string> = {}
  for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
const ROOT = cssBlock(':root')
const DARK = { ...ROOT, ...cssBlock('.dark') }

const DEFAULT: ThemeConfig = { preset: 'default', customColors: DEFAULT_CUSTOM_COLORS }
const varsOf = (config: ThemeConfig, isDark: boolean) =>
  toCssVariables(generateThemeData({ ...config, isDark }), config.customColors.glass ?? DEFAULT_GLASS_CONFIG, isDark)

describe('生成器对默认预设的输出 = globals.css 的静态值（spec §4.2 对照用例）', () => {
  it('浅色：115 个变量逐键等于 :root', () => {
    const vars = varsOf(DEFAULT, false)
    expect(Object.keys(vars)).toHaveLength(115)
    for (const [key, value] of Object.entries(vars)) expect({ key, value }).toEqual({ key, value: ROOT[key] })
  })
  it('深色：115 个变量逐键等于 .dark（未覆盖的键回落到 :root）', () => {
    const vars = varsOf(DEFAULT, true)
    expect(Object.keys(vars)).toHaveLength(115)
    for (const [key, value] of Object.entries(vars)) expect({ key, value }).toEqual({ key, value: DARK[key] })
  })
  it('字面量抽查（防止上面的循环在 CSS 与生成器同时错的时候一起绿）', () => {
    expect(varsOf(DEFAULT, false)['--primary']).toBe('#0956c6')
    expect(varsOf(DEFAULT, false)['--color-primary-1']).toBe('#acfaff')
    expect(varsOf(DEFAULT, false)['--white-alpha-90']).toBe('rgba(255, 255, 255, 0.9)')
    expect(varsOf(DEFAULT, false)['--glass-border']).toBe('rgba(255, 255, 255, 0.6)')
    expect(varsOf(DEFAULT, false)['--glass-backdrop']).toBe('blur(20px) saturate(180%)')
    expect(varsOf(DEFAULT, true)['--primary']).toBe('#3c83f7')
    expect(varsOf(DEFAULT, true)['--white-alpha-90']).toBe('rgba(20, 23, 28, 0.9)')
    expect(varsOf(DEFAULT, true)['--glass-border']).toBe('rgba(255, 255, 255, 0.12)')
    expect(varsOf(DEFAULT, true)['--bg-surface']).toBe('rgba(12, 14, 19, 0.9)')
  })
})

describe('自定义配置只改自己那一组变量', () => {
  const custom = (over: Partial<ThemeConfig['customColors']>): ThemeConfig => ({ preset: 'custom', customColors: { ...DEFAULT_CUSTOM_COLORS, ...over } })
  const diffKeys = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== b[k]).sort()

  it('改主色：--primary 系与 --color-primary-* 变，--accent 系与 --color-accent-* 一个都不变', () => {
    const base = varsOf(DEFAULT, false)
    const rose = varsOf(custom({ primary: '#e11d48' }), false)
    expect(rose['--primary']).not.toBe('#0956c6')
    expect(rose['--primary']).toBe('#bc002c')
    const changed = diffKeys(base, rose)
    expect(changed).toContain('--primary')
    expect(changed).toContain('--color-primary-9')
    expect(changed.filter((k) => k.startsWith('--accent') || k.startsWith('--color-accent'))).toEqual([])
    // 正对照：同一个 custom 预设、颜色不动时，与默认逐键相等
    expect(diffKeys(base, varsOf(custom({}), false))).toEqual([])
  })
  it('改强调色：只动 --accent 系与 --color-accent-*（含 12 级 + 5 个语义键 = 17 键）', () => {
    const base = varsOf(DEFAULT, false)
    const changed = diffKeys(base, varsOf(custom({ accent: '#059669' }), false))
    expect(changed).toHaveLength(17)
    expect(changed.every((k) => k.startsWith('--accent') || k.startsWith('--color-accent'))).toBe(true)
  })
  it('改单个透明度层级：只动同名的 --white-alpha-N 与 --glass-white-N', () => {
    const base = varsOf(DEFAULT, false)
    const glass = { ...DEFAULT_GLASS_CONFIG, opacityLevels: { ...DEFAULT_GLASS_CONFIG.opacityLevels!, level70: 40 } }
    const tuned = varsOf(custom({ glass }), false)
    expect(diffKeys(base, tuned)).toEqual(['--glass-white-70', '--white-alpha-70'])
    expect(tuned['--white-alpha-70']).toBe('rgba(255, 255, 255, 0.4)')
  })
  it('改 level97（没有对应的 --glass-white-97）只动 --white-alpha-97', () => {
    const base = varsOf(DEFAULT, false)
    const glass = { ...DEFAULT_GLASS_CONFIG, opacityLevels: { ...DEFAULT_GLASS_CONFIG.opacityLevels!, level97: 50 } }
    expect(diffKeys(base, varsOf(custom({ glass }), false))).toEqual(['--white-alpha-97'])
  })
  it('模糊与饱和度按 Web 比例：blur 24 → 9/15/18/24/36，backdrop 30；saturation 120 → normal 100 / high 120', () => {
    const vars = varsOf(custom({ glass: { ...DEFAULT_GLASS_CONFIG, blur: 24, saturation: 120 } }), false)
    expect([vars['--blur-xs'], vars['--blur-sm'], vars['--blur-md'], vars['--blur-lg'], vars['--blur-xl']]).toEqual(['blur(9px)', 'blur(15px)', 'blur(18px)', 'blur(24px)', 'blur(36px)'])
    expect(vars['--glass-backdrop']).toBe('blur(30px) saturate(120%)')
    expect(vars['--saturate-normal']).toBe('saturate(100%)')
    expect(vars['--saturate-high']).toBe('saturate(120%)')
  })
  it('深色下底色 #ffffff 跟随中性色 3 级；改了底色则两种模式都用它', () => {
    const dark = varsOf(custom({}), true)
    expect(dark['--white-alpha-50']).toBe('rgba(20, 23, 28, 0.5)')
    const tinted = varsOf(custom({ glass: { ...DEFAULT_GLASS_CONFIG, baseColor: '#102030' } }), true)
    expect(tinted['--white-alpha-50']).toBe('rgba(16, 32, 48, 0.5)')
    expect(varsOf(custom({ glass: { ...DEFAULT_GLASS_CONFIG, baseColor: '#102030' } }), false)['--white-alpha-50']).toBe('rgba(16, 32, 48, 0.5)')
  })
  it('borderOpacity 0.35：浅色 0.35，深色 round(0.35/5,2)=0.07；边框恒白不随底色', () => {
    const glass = { ...DEFAULT_GLASS_CONFIG, baseColor: '#102030', borderOpacity: 0.35 }
    expect(varsOf(custom({ glass }), false)['--glass-border']).toBe('rgba(255, 255, 255, 0.35)')
    expect(varsOf(custom({ glass }), true)['--glass-border']).toBe('rgba(255, 255, 255, 0.07)')
  })
  it('非法主色回退默认蓝（与 APP generateColorScale 的回退一致）', () => {
    expect(varsOf(custom({ primary: 'not-a-color' }), false)['--primary']).toBe('#0956c6')
  })
})

describe('buildSnapshot', () => {
  it('两份快照分别等于 toCssVariables 的浅 / 深输出', () => {
    const snap = buildSnapshot(DEFAULT)
    expect(snap.light).toEqual(varsOf(DEFAULT, false))
    expect(snap.dark).toEqual(varsOf(DEFAULT, true))
    expect(snap.light['--primary']).toBe('#0956c6')
    expect(snap.dark['--primary']).toBe('#3c83f7')
  })
})
```

- [ ] **Step 6: 跑用例确认失败**

Run: `bun run test -- src/features/theme/__tests__/generator.test.ts`
Expected: FAIL，`Cannot find module '../generator'`（或同类导入错误）。

- [ ] **Step 7: 写 `src/features/theme/generator.ts`**

```ts
import { DEFAULT_CUSTOM_COLORS, DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS, OPACITY_LEVEL_KEYS, getPresetConfig } from './presets'
import type { ColorScale, CssVariables, CustomColors, GlassConfig, SemanticTokens, ThemeConfig, ThemeData, ThemeSnapshot } from './types'
import { generateColorScale, generateNeutralScale, generateShadows, hexToRgb, withAlpha } from './utils'

// ---- 语义 token（APP theme/generator.ts 的两个函数，字面量逐个相同） ----

function lightSemanticTokens(primary: ColorScale, accent: ColorScale, neutral: ColorScale, primaryColor: string): SemanticTokens {
  return {
    bg: { primary: '#ffffff', secondary: neutral[1], tertiary: neutral[2], surface: withAlpha('#ffffff', 0.8), surfaceHover: withAlpha('#ffffff', 0.9), muted: neutral[3], inverse: neutral[12] },
    text: { primary: '#1e3a5f', secondary: '#475569', muted: '#64748b', light: '#94a3b8', inverse: '#ffffff', link: primary[9] },
    border: { default: withAlpha(primary[5], 0.3), subtle: withAlpha(primary[5], 0.15), strong: withAlpha(primary[6], 0.5), focus: withAlpha(primary[7], 0.6) },
    primary: { default: primary[9], hover: primary[10], active: primary[11], subtle: withAlpha(primary[4], 0.2), text: primary[11] },
    accent: { default: accent[9], hover: accent[10], active: accent[11], subtle: withAlpha(accent[4], 0.2), text: accent[11] },
    status: {
      success: '#22c55e', successSubtle: withAlpha('#22c55e', 0.15), warning: '#f59e0b', warningSubtle: withAlpha('#f59e0b', 0.15),
      error: '#ef4444', errorSubtle: withAlpha('#ef4444', 0.15), info: '#3b82f6', infoSubtle: withAlpha('#3b82f6', 0.15),
    },
    shadow: generateShadows(primaryColor),
  }
}

function darkSemanticTokens(primary: ColorScale, accent: ColorScale, neutral: ColorScale, primaryColor: string): SemanticTokens {
  return {
    bg: { primary: neutral[1], secondary: neutral[2], tertiary: neutral[3], surface: withAlpha(neutral[2], 0.9), surfaceHover: withAlpha(neutral[3], 0.9), muted: neutral[4], inverse: neutral[12] },
    text: { primary: '#f8fafc', secondary: '#e2e8f0', muted: '#94a3b8', light: '#64748b', inverse: '#1e293b', link: primary[9] },
    border: { default: withAlpha(neutral[6], 0.4), subtle: withAlpha(neutral[5], 0.25), strong: withAlpha(neutral[7], 0.5), focus: withAlpha(primary[7], 0.6) },
    primary: { default: primary[9], hover: primary[8], active: primary[7], subtle: withAlpha(primary[9], 0.2), text: primary[9] },
    accent: { default: accent[9], hover: accent[8], active: accent[7], subtle: withAlpha(accent[9], 0.2), text: accent[9] },
    status: {
      success: '#4ade80', successSubtle: withAlpha('#4ade80', 0.2), warning: '#fbbf24', warningSubtle: withAlpha('#fbbf24', 0.2),
      error: '#f87171', errorSubtle: withAlpha('#f87171', 0.2), info: '#60a5fa', infoSubtle: withAlpha('#60a5fa', 0.2),
    },
    shadow: generateShadows(primaryColor),
  }
}

// ---- 配置解析 ----

/** default 预设忽略 customColors（spec §4.1） */
export function resolveColors(config: ThemeConfig): CustomColors {
  return config.preset === 'custom' ? config.customColors : getPresetConfig('default').colors
}

export function resolveGlass(config: ThemeConfig): GlassConfig {
  const glass = resolveColors(config).glass ?? DEFAULT_GLASS_CONFIG
  return { ...glass, opacityLevels: glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS }
}

export function generateThemeData(input: ThemeConfig & { isDark: boolean }): ThemeData {
  const colors = resolveColors(input)
  const primaryColor = colors.primary
  const accentColor = colors.accent ?? colors.primary
  const primaryScale = generateColorScale(primaryColor, input.isDark)
  const accentScale = generateColorScale(accentColor, input.isDark)
  const neutralScale = generateNeutralScale(primaryColor, input.isDark)
  const semantic = input.isDark
    ? darkSemanticTokens(primaryScale, accentScale, neutralScale, primaryColor)
    : lightSemanticTokens(primaryScale, accentScale, neutralScale, primaryColor)
  return { primaryScale, accentScale, neutralScale, semantic }
}

// ---- CSS 变量输出（键名 = globals.css，恰好 115 个） ----

/** globals.css 里存在的 --glass-white-N 层级（没有 97/95/85/75） */
const GLASS_WHITE_LEVELS = [90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10] as const

export function toCssVariables(data: ThemeData, glass: GlassConfig, isDark: boolean): CssVariables {
  const vars: CssVariables = {}
  for (const [step, value] of Object.entries(data.primaryScale)) vars[`--color-primary-${step}`] = value
  for (const [step, value] of Object.entries(data.accentScale)) vars[`--color-accent-${step}`] = value
  for (const [step, value] of Object.entries(data.neutralScale)) vars[`--color-neutral-${step}`] = value

  const s = data.semantic
  vars['--primary'] = s.primary.default
  vars['--primary-hover'] = s.primary.hover
  vars['--primary-active'] = s.primary.active
  vars['--primary-subtle'] = s.primary.subtle
  vars['--primary-text'] = s.primary.text
  vars['--accent'] = s.accent.default
  vars['--accent-hover'] = s.accent.hover
  vars['--accent-active'] = s.accent.active
  vars['--accent-subtle'] = s.accent.subtle
  vars['--accent-text'] = s.accent.text
  vars['--bg-primary'] = s.bg.primary
  vars['--bg-secondary'] = s.bg.secondary
  vars['--bg-tertiary'] = s.bg.tertiary
  vars['--bg-surface'] = s.bg.surface
  vars['--bg-surface-hover'] = s.bg.surfaceHover
  vars['--bg-muted'] = s.bg.muted
  vars['--bg-inverse'] = s.bg.inverse
  vars['--text-primary'] = s.text.primary
  vars['--text-secondary'] = s.text.secondary
  vars['--text-muted'] = s.text.muted
  vars['--text-light'] = s.text.light
  vars['--text-inverse'] = s.text.inverse
  vars['--text-link'] = s.text.link
  vars['--border-default'] = s.border.default
  vars['--border-subtle'] = s.border.subtle
  vars['--border-strong'] = s.border.strong
  vars['--border-focus'] = s.border.focus
  vars['--status-success'] = s.status.success
  vars['--status-success-subtle'] = s.status.successSubtle
  vars['--status-warning'] = s.status.warning
  vars['--status-warning-subtle'] = s.status.warningSubtle
  vars['--status-error'] = s.status.error
  vars['--status-error-subtle'] = s.status.errorSubtle
  vars['--status-info'] = s.status.info
  vars['--status-info-subtle'] = s.status.infoSubtle
  vars['--shadow-sm'] = s.shadow.sm
  vars['--shadow-md'] = s.shadow.md
  vars['--shadow-lg'] = s.shadow.lg
  vars['--shadow-glow'] = s.shadow.glow
  vars['--shadow-focus'] = s.shadow.focus

  // 玻璃面：深色 + 默认白底 → 跟随中性色 3 级（.dark 的静态值就是 rgb(20, 23, 28)）
  const followsMode = isDark && glass.baseColor.toLowerCase() === '#ffffff'
  const base = hexToRgb(followsMode ? data.neutralScale[3] : glass.baseColor)
  const levels = glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS
  for (const key of OPACITY_LEVEL_KEYS) {
    const n = key.slice('level'.length)
    vars[`--white-alpha-${n}`] = `rgba(${base}, ${levels[key] / 100})`
  }
  for (const n of GLASS_WHITE_LEVELS) vars[`--glass-white-${n}`] = `rgba(${base}, ${levels[`level${n}`] / 100})`

  // 边框恒白（静态 CSS 如此）；深色取 1/5
  const borderAlpha = isDark ? Math.round(glass.borderOpacity * 20) / 100 : glass.borderOpacity
  vars['--glass-border'] = `rgba(255, 255, 255, ${borderAlpha})`

  // 模糊 / 饱和：按 Web 静态值的比例（blur 16 → 6/10/12/16/24 与 backdrop 20）
  const b = glass.blur
  vars['--blur-xs'] = `blur(${Math.round(b * 0.375)}px)`
  vars['--blur-sm'] = `blur(${Math.round(b * 0.625)}px)`
  vars['--blur-md'] = `blur(${Math.round(b * 0.75)}px)`
  vars['--blur-lg'] = `blur(${b}px)`
  vars['--blur-xl'] = `blur(${Math.round(b * 1.5)}px)`
  vars['--glass-backdrop'] = `blur(${Math.round(b * 1.25)}px) saturate(${glass.saturation}%)`
  vars['--saturate-normal'] = `saturate(${Math.round((glass.saturation * 5) / 6)}%)`
  vars['--saturate-high'] = `saturate(${glass.saturation}%)`
  return vars
}

export function buildSnapshot(config: ThemeConfig): ThemeSnapshot {
  const glass = resolveGlass(config)
  return {
    light: toCssVariables(generateThemeData({ ...config, isDark: false }), glass, false),
    dark: toCssVariables(generateThemeData({ ...config, isDark: true }), glass, true),
  }
}

export { DEFAULT_CUSTOM_COLORS }
```

- [ ] **Step 8: 跑用例确认通过**

Run: `bun run test -- src/features/theme/__tests__/generator.test.ts`
Expected: PASS（15 条）。字面量 `#bc002c` / `#00744a`（若用到）是 culori 4.0.2 对 `#e11d48` / `#059669` 取 l=0.485 的实算值（写计划时已跑过）；若不等，先怀疑 culori 版本或亮度表抄错，不要改期望。

- [ ] **Step 9: 变异校验（手动，各改一处 → 对应用例必红 → 改回）**

| 变异 | 必红的用例 |
|---|---|
| `toCssVariables` 里删掉 `--glass-white-*` 循环 | 浅色 115 键（长度 102） |
| alpha 改成 `toFixed(2)` | 浅色逐键（`--white-alpha-90` 得 `0.90`）+ 字面量抽查 |
| `followsMode` 判断去掉 `isDark &&` | 浅色逐键（`--white-alpha-*` 变成 rgb(226,230,237)） |
| `--blur-xl` 系数改 2 | 模糊比例用例 + 浅色逐键 |
| 深色 `borderAlpha` 直接用 `glass.borderOpacity` | 深色逐键 + 字面量抽查 |

- [ ] **Step 10: 门槛与提交**

```bash
bun run typecheck
bun run lint
bun --bun run build
git add package.json bun.lock src/features/theme
git commit -m "feat(theme): 移植 APP OKLCH 主题生成器，默认预设输出与 globals.css 逐键相等

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
Expected: typecheck 0 错误；lint 不高于 158 warnings / 22 infos / 0 errors；build 成功（`build/` 不提交）。

---
### Task 2: `themeStore` + `ThemeProvider` + 防闪脚本 + 外观分区的主题编辑器（spec §4.3 / §10.2 / §11）

**Files:**
- Create: `src/features/theme/store.ts`
- Create: `src/features/theme/applyTheme.ts`
- Create: `src/features/theme/ThemeProvider.tsx`
- Create: `src/app/themeInitScript.ts`（把 `root.tsx` 的内联脚本字符串搬出来并追加快照赋值，便于测试）
- Create: `src/components/shell/settings/ThemeEditor.tsx`
- Test: `src/features/theme/__tests__/store.test.ts`、`src/features/theme/__tests__/ThemeProvider.test.tsx`、`src/app/__tests__/themeInitScript.test.ts`、`src/components/shell/settings/__tests__/ThemeEditor.test.tsx`
- Modify: `src/app/root.tsx`（`themeInitScript` 改为 import；`<ThemeProvider />` 挂在 `<SettingsSync />` 旁）、`src/lib/sessionScope.ts`（`DEVICE_SCOPED_KEYS` 加 `huanvae.theme`）、`src/components/shell/settings/AppearanceSection.tsx`（追加 `<ThemeEditor />`）、`src/i18n/messages.ts`（`shell.settings.themeEditor.*` zh + en）、`src/styles/globals.css`（`:root` 前加一行注释）、`package.json`（`bun add react-colorful@^5.7.0`）

**Interfaces:**
- Consumes（Task 1）: `ThemeConfig / ThemeSnapshot / CssVariables / GlassConfig / OpacityLevels`、`buildSnapshot(config)`、`DEFAULT_CUSTOM_COLORS / DEFAULT_GLASS_CONFIG / DEFAULT_OPACITY_LEVELS / OPACITY_LEVEL_KEYS / OPACITY_GROUPS / GLASS_RANGES / THEME_PRESETS`。
- Produces:
  - `useThemeStore`（zustand persist，key `'huanvae.theme'`，持久化 `{ config, snapshot }`）：`config: ThemeConfig`、`snapshot: ThemeSnapshot | null`（`preset === 'custom'` 时才非空）、`setPreset(preset)`、`setPrimaryColor(hex)`、`setAccentColor(hex)`、`setGlassConfig(partial: Partial<GlassConfig>)`、`setOpacityLevel(key, value)`、`reset()`、`setConfig(config)`；`THEME_STORAGE_KEY = 'huanvae.theme'`；`DEFAULT_THEME_CONFIG`；`isThemeConfig(value): value is ThemeConfig`。
  - `applyThemeVariables(root, vars)`、`clearThemeVariables(root)`（只清 115 个主题键，不碰 `--animation-duration`）。
  - `ThemeProvider`（无 props，返回 null）；`themeInitScript: string`。
  - i18n 命名空间 **`shell.settings.themeEditor.*`**（不是 spec 写的 `shell.settings.theme.*`：`shell.settings.theme` 已经是字符串 '主题'，被外观分区的行标题用着，不能改成对象）。

**Ruling 已定（不要再问）：** `setPreset('default')` 保留 `customColors` 原样（含 17 个透明度层级），只把 `snapshot` 置 null——预设卡片是配色开关，不是恢复出厂；恢复出厂只有 `reset()`。跨标签页同步收到的 `config` 一律用本地 `buildSnapshot` 重算快照，不信任对方标签页的 `snapshot`。

- [ ] **Step 1: 装 react-colorful**

```bash
bun add react-colorful@^5.7.0
```

- [ ] **Step 2: 写 store 失败用例 `src/features/theme/__tests__/store.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_OPACITY_LEVELS } from '../presets'
import { DEFAULT_THEME_CONFIG, THEME_STORAGE_KEY, isThemeConfig, useThemeStore } from '../store'

beforeEach(() => {
  localStorage.clear()
  useThemeStore.getState().reset()
})

describe('themeStore：快照只在 custom 时存在', () => {
  it('初始：default 预设、snapshot 为 null、落盘键是 huanvae.theme', () => {
    expect(useThemeStore.getState().config).toEqual(DEFAULT_THEME_CONFIG)
    expect(useThemeStore.getState().snapshot).toBeNull()
    expect(THEME_STORAGE_KEY).toBe('huanvae.theme')
    const persisted = JSON.parse(localStorage.getItem('huanvae.theme') ?? 'null')
    expect(persisted.state.config.preset).toBe('default')
    expect(persisted.state.snapshot).toBeNull()
  })
  it('setPrimaryColor 自动切到 custom，两份快照都算出来并落盘', () => {
    useThemeStore.getState().setPrimaryColor('#e11d48')
    const { config, snapshot } = useThemeStore.getState()
    expect(config.preset).toBe('custom')
    expect(config.customColors.primary).toBe('#e11d48')
    expect(snapshot?.light['--primary']).toBe('#bc002c')
    expect(snapshot?.dark['--primary']).not.toBe('#bc002c')
    expect(Object.keys(snapshot?.light ?? {})).toHaveLength(115)
    const persisted = JSON.parse(localStorage.getItem('huanvae.theme') ?? 'null')
    expect(persisted.state.snapshot.light['--primary']).toBe('#bc002c')
  })
  it('setPreset(default) 清快照但保留 customColors；setPreset(custom) 恢复快照', () => {
    useThemeStore.getState().setPrimaryColor('#e11d48')
    useThemeStore.getState().setOpacityLevel('level70', 40)
    useThemeStore.getState().setPreset('default')
    expect(useThemeStore.getState().snapshot).toBeNull()
    expect(useThemeStore.getState().config.customColors.primary).toBe('#e11d48')
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels?.level70).toBe(40)
    useThemeStore.getState().setPreset('custom')
    expect(useThemeStore.getState().snapshot?.light['--white-alpha-70']).toBe('rgba(255, 255, 255, 0.4)')
  })
  it('setGlassConfig 合并局部字段；setOpacityLevel 夹在 0–100', () => {
    useThemeStore.getState().setGlassConfig({ blur: 24 })
    expect(useThemeStore.getState().config.customColors.glass?.blur).toBe(24)
    expect(useThemeStore.getState().config.customColors.glass?.saturation).toBe(180)
    useThemeStore.getState().setOpacityLevel('level10', 250)
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels?.level10).toBe(100)
    useThemeStore.getState().setOpacityLevel('level10', -5)
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels?.level10).toBe(0)
  })
  it('reset 回到默认配置与 null 快照', () => {
    useThemeStore.getState().setAccentColor('#059669')
    useThemeStore.getState().reset()
    expect(useThemeStore.getState().config).toEqual(DEFAULT_THEME_CONFIG)
    expect(useThemeStore.getState().config.customColors.glass?.opacityLevels).toEqual(DEFAULT_OPACITY_LEVELS)
    expect(useThemeStore.getState().snapshot).toBeNull()
  })
  it('setConfig（跨标签页）用本地生成器重算快照，不信任传入的快照', () => {
    useThemeStore.getState().setConfig({ preset: 'custom', customColors: { primary: '#e11d48' } })
    expect(useThemeStore.getState().snapshot?.light['--primary']).toBe('#bc002c')
  })
})

describe('isThemeConfig', () => {
  it('认合法配置，拒绝坏形状', () => {
    expect(isThemeConfig({ preset: 'custom', customColors: { primary: '#000000' } })).toBe(true)
    expect(isThemeConfig({ preset: 'rainbow', customColors: { primary: '#000000' } })).toBe(false)
    expect(isThemeConfig({ preset: 'custom' })).toBe(false)
    expect(isThemeConfig(null)).toBe(false)
  })
})
```

- [ ] **Step 3: 跑用例确认失败**

Run: `bun run test -- src/features/theme/__tests__/store.test.ts`
Expected: FAIL（找不到 `../store`）。

- [ ] **Step 4: 写 `src/features/theme/store.ts`**

```ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sessionScopedLocalStorage } from '@/lib/sessionScope'
import { buildSnapshot } from './generator'
import { DEFAULT_CUSTOM_COLORS, DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS } from './presets'
import type { GlassConfig, OpacityLevels, ThemeConfig, ThemePreset, ThemeSnapshot } from './types'

/** 与 APP 的 `huanvae-theme` 同义；设备级键，登记在 sessionScope.ts 的 DEVICE_SCOPED_KEYS */
export const THEME_STORAGE_KEY = 'huanvae.theme'

export const DEFAULT_THEME_CONFIG: ThemeConfig = { preset: 'default', customColors: DEFAULT_CUSTOM_COLORS }

export function isThemeConfig(value: unknown): value is ThemeConfig {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.preset !== 'default' && v.preset !== 'custom') return false
  const colors = v.customColors
  return !!colors && typeof colors === 'object' && typeof (colors as Record<string, unknown>).primary === 'string'
}

interface ThemeState {
  config: ThemeConfig
  /** preset === 'custom' 时才有；default 时 null，防闪脚本与 ThemeProvider 都据此决定写不写 */
  snapshot: ThemeSnapshot | null
  setPreset: (preset: ThemePreset) => void
  setPrimaryColor: (hex: string) => void
  setAccentColor: (hex: string) => void
  setGlassConfig: (glass: Partial<GlassConfig>) => void
  setOpacityLevel: (key: keyof OpacityLevels, value: number) => void
  reset: () => void
  /** 跨标签页 storage 事件用：整份替换并重算快照 */
  setConfig: (config: ThemeConfig) => void
}

const withSnapshot = (config: ThemeConfig): Pick<ThemeState, 'config' | 'snapshot'> => ({
  config,
  snapshot: config.preset === 'custom' ? buildSnapshot(config) : null,
})

const currentGlass = (config: ThemeConfig): GlassConfig => config.customColors.glass ?? DEFAULT_GLASS_CONFIG

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      ...withSnapshot(DEFAULT_THEME_CONFIG),

      setPreset: (preset) => set(withSnapshot({ ...get().config, preset })),

      setPrimaryColor: (hex) => {
        const config = get().config
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, primary: hex } }))
      },

      setAccentColor: (hex) => {
        const config = get().config
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, accent: hex } }))
      },

      setGlassConfig: (glass) => {
        const config = get().config
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, glass: { ...currentGlass(config), ...glass } } }))
      },

      setOpacityLevel: (key, value) => {
        const config = get().config
        const glass = currentGlass(config)
        const levels = { ...(glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS), [key]: Math.max(0, Math.min(100, value)) }
        set(withSnapshot({ preset: 'custom', customColors: { ...config.customColors, glass: { ...glass, opacityLevels: levels } } }))
      },

      reset: () => set(withSnapshot(DEFAULT_THEME_CONFIG)),

      setConfig: (config) => set(withSnapshot(config)),
    }),
    {
      name: THEME_STORAGE_KEY,
      storage: createJSONStorage(() => sessionScopedLocalStorage),
      partialize: (state) => ({ config: state.config, snapshot: state.snapshot }),
      // 恢复时只信 config，快照用本地生成器重算：生成器改版后旧快照自动失效
      merge: (persisted, current) => {
        const raw = persisted as Partial<Pick<ThemeState, 'config'>> | undefined
        const config = raw && isThemeConfig(raw.config) ? raw.config : DEFAULT_THEME_CONFIG
        return { ...current, ...withSnapshot(config) }
      },
    },
  ),
)
```

- [ ] **Step 5: 跑 store 用例确认通过**

Run: `bun run test -- src/features/theme/__tests__/store.test.ts`
Expected: PASS（7 条）。

- [ ] **Step 6: 登记设备级键（`src/lib/sessionScope.ts`，在 `['huanvae.sidebar-layout', { keep: 'whole' }],` 之后加）**

```ts
  /**
   * 主题配置与快照（`features/theme/store.ts`）。这台屏幕的配色偏好，不含账号数据，
   * 与 APP 的 `huanvae-theme` 同义按设备保存（spec §9）；`root.tsx` 的防闪脚本在
   * React 挂载前读它，清掉会让登出后的首屏先闪一次默认配色。
   */
  ['huanvae.theme', { keep: 'whole' }],
```

- [ ] **Step 7: 写 `src/features/theme/applyTheme.ts`**

```ts
import { buildSnapshot } from './generator'
import { DEFAULT_THEME_CONFIG } from './store'
import type { CssVariables } from './types'

let themeKeys: Set<string> | null = null
/** 本模块会写的全部键名（= 生成器输出的 115 个）；懒算一次 */
function getThemeKeys(): Set<string> {
  if (!themeKeys) themeKeys = new Set(Object.keys(buildSnapshot({ ...DEFAULT_THEME_CONFIG, preset: 'custom' }).light))
  return themeKeys
}

export function applyThemeVariables(root: HTMLElement, vars: CssVariables): void {
  for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value)
}

/** 只清主题键，不碰 SettingsSync 写的 `--animation-duration` 等 */
export function clearThemeVariables(root: HTMLElement): void {
  const keys = getThemeKeys()
  for (let i = root.style.length - 1; i >= 0; i -= 1) {
    const name = root.style.item(i)
    if (keys.has(name)) root.style.removeProperty(name)
  }
}
```

- [ ] **Step 8: 写 ThemeProvider 失败用例 `src/features/theme/__tests__/ThemeProvider.test.tsx`**

```tsx
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { ThemeProvider } from '../ThemeProvider'
import { useThemeStore } from '../store'

/** prefers-color-scheme 可控桩（happy-dom 没有 matchMedia） */
function stubColorScheme(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  let matches = dark
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return query.includes('dark') ? matches : false },
    media: query, onchange: null,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.add(cb) },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.delete(cb) },
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  return { flip(next: boolean) { matches = next; for (const cb of listeners) cb({ matches: next }) } }
}

const root = () => document.documentElement
const inline = (name: string) => root().style.getPropertyValue(name)

beforeEach(() => {
  localStorage.clear()
  useThemeStore.getState().reset()
  useSettingsStore.setState({ theme: 'light' })
  root().removeAttribute('style')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('ThemeProvider', () => {
  it('默认预设：一个内联变量都不写（正对照：切到 custom 才写）', () => {
    stubColorScheme(false)
    render(<ThemeProvider />)
    expect(root().style.length).toBe(0)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    expect(inline('--primary')).toBe('#bc002c')
    expect(root().style.length).toBe(115)
  })
  it('切回 default 清掉全部主题键，但不动别人写的 --animation-duration', () => {
    stubColorScheme(false)
    root().style.setProperty('--animation-duration', '1')
    render(<ThemeProvider />)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    act(() => useThemeStore.getState().setPreset('default'))
    expect(inline('--primary')).toBe('')
    expect(inline('--animation-duration')).toBe('1')
    expect(root().style.length).toBe(1)
  })
  it('settingsStore.theme 切到 dark 时改写为深色快照', () => {
    stubColorScheme(false)
    render(<ThemeProvider />)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    const light = inline('--primary')
    act(() => useSettingsStore.setState({ theme: 'dark' }))
    expect(inline('--primary')).toBe(useThemeStore.getState().snapshot?.dark['--primary'])
    expect(inline('--primary')).not.toBe(light)
    expect(inline('--white-alpha-90')).toMatch(/^rgba\(\d+, \d+, \d+, 0\.9\)$/)
  })
  it('auto 模式跟随系统：媒体查询翻转时重应用', () => {
    const scheme = stubColorScheme(false)
    useSettingsStore.setState({ theme: 'auto' })
    render(<ThemeProvider />)
    act(() => useThemeStore.getState().setPrimaryColor('#e11d48'))
    expect(inline('--primary')).toBe('#bc002c')
    act(() => scheme.flip(true))
    expect(inline('--primary')).toBe(useThemeStore.getState().snapshot?.dark['--primary'])
  })
  it('跨标签页：storage 事件里的 huanvae.theme 触发 setConfig 并重应用；坏 JSON 忽略', () => {
    stubColorScheme(false)
    render(<ThemeProvider />)
    const newValue = JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#e11d48' } } }, version: 0 })
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'huanvae.theme', newValue })) })
    expect(useThemeStore.getState().config.preset).toBe('custom')
    expect(inline('--primary')).toBe('#bc002c')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'huanvae.theme', newValue: '{not json' })) })
    expect(inline('--primary')).toBe('#bc002c')
    // 正对照：别的键不触发
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'app-settings', newValue: JSON.stringify({ state: { config: { preset: 'default', customColors: { primary: '#000' } } } }) })) })
    expect(useThemeStore.getState().config.preset).toBe('custom')
  })
})
```

- [ ] **Step 9: 跑用例确认失败**

Run: `bun run test -- src/features/theme/__tests__/ThemeProvider.test.tsx`
Expected: FAIL（找不到 `../ThemeProvider`）。

- [ ] **Step 10: 写 `src/features/theme/ThemeProvider.tsx`**

```tsx
import { useEffect } from 'react'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { applyThemeVariables, clearThemeVariables } from './applyTheme'
import { THEME_STORAGE_KEY, isThemeConfig, useThemeStore } from './store'

/**
 * 把 themeStore 的快照写成 :root 的内联变量（spec §4.3）。
 * - default 预设：清掉本模块写过的键，页面回到 globals.css 的静态值（首屏零内联变量）；
 * - custom：按 settingsStore.theme（+ 系统偏好）挑 light / dark 那份逐键 setProperty；
 * - 明暗切换必须重写另一份快照，否则深色下留着浅色变量（spec §12）；
 * - 跨标签页：storage 事件 key === 'huanvae.theme' → setConfig（本地重算快照）。
 * 只做赋值不做计算；计算都在 store 里发生过了。
 */
export function ThemeProvider() {
  const preset = useThemeStore((s) => s.config.preset)
  const snapshot = useThemeStore((s) => s.snapshot)
  const themeMode = useSettingsStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const isDark = themeMode === 'dark' || (themeMode === 'auto' && media.matches)
      if (preset === 'custom' && snapshot) applyThemeVariables(root, isDark ? snapshot.dark : snapshot.light)
      else clearThemeVariables(root)
    }
    apply()
    if (themeMode !== 'auto') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preset, snapshot, themeMode])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) return
      try {
        const parsed = JSON.parse(event.newValue) as { state?: { config?: unknown } }
        if (isThemeConfig(parsed.state?.config)) useThemeStore.getState().setConfig(parsed.state.config)
      } catch {
        // 另一个标签页写了读不懂的东西：不动本页
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return null
}
```

- [ ] **Step 11: 跑 ThemeProvider 用例确认通过**

Run: `bun run test -- src/features/theme/__tests__/ThemeProvider.test.tsx`
Expected: PASS（5 条）。若 happy-dom 的 `style.length` 在 `setProperty` 自定义属性后不计数，把 `root().style.length` 的断言换成 `Array.from({ length: root().style.length }, (_, i) => root().style.item(i)).filter((n) => n.startsWith('--')).length`——先验证 happy-dom 行为，再决定，不要删断言。

- [ ] **Step 12: 防闪脚本搬到 `src/app/themeInitScript.ts` 并追加快照赋值**

```ts
/**
 * `<head>` 内联防闪脚本（root.tsx 注入；内容是静态字面量，不含任何用户输入）。
 * 先做上期的明暗 class 切换，再读 `huanvae.theme`：preset 为 custom 且有快照时，
 * 按 isDark 把对应那份逐条 setProperty。只赋值不计算——culori 不进内联脚本（spec §4.3）。
 */
export const themeInitScript = `
(() => {
  try {
    const raw = localStorage.getItem('app-settings')
    const parsed = raw ? JSON.parse(raw) : null
    const state = parsed?.state || {}
    const theme = state.theme || 'light'
    const root = document.documentElement
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    const themeRaw = localStorage.getItem('huanvae.theme')
    const themeState = themeRaw ? JSON.parse(themeRaw)?.state : null
    const snapshot = themeState && themeState.config && themeState.config.preset === 'custom' ? themeState.snapshot : null
    const vars = snapshot ? (isDark ? snapshot.dark : snapshot.light) : null
    if (vars && typeof vars === 'object') {
      for (const name of Object.keys(vars)) {
        if (name.startsWith('--') && typeof vars[name] === 'string') root.style.setProperty(name, vars[name])
      }
    }
  } catch {}
})();
`
```

`src/app/root.tsx`：删掉本文件里的 `const themeInitScript = \`…\``（第 34–47 行），改为 `import { themeInitScript } from './themeInitScript'`；`import { ThemeProvider } from '@/features/theme/ThemeProvider'`；在 `<SettingsSync />` 下一行加 `<ThemeProvider />`。

- [ ] **Step 13: 写脚本用例 `src/app/__tests__/themeInitScript.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { themeInitScript } from '../themeInitScript'

const run = () => new Function(themeInitScript)()
const root = () => document.documentElement

beforeEach(() => {
  localStorage.clear()
  root().removeAttribute('style')
  root().classList.remove('dark')
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

describe('themeInitScript', () => {
  it('custom + dark：写深色快照，且仍切 .dark', () => {
    localStorage.setItem('app-settings', JSON.stringify({ state: { theme: 'dark' } }))
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#e11d48' } }, snapshot: { light: { '--primary': '#bc002c' }, dark: { '--primary': '#ff5577', '--white-alpha-90': 'rgba(20, 23, 28, 0.9)' } } } }))
    run()
    expect(root().classList.contains('dark')).toBe(true)
    expect(root().style.getPropertyValue('--primary')).toBe('#ff5577')
    expect(root().style.getPropertyValue('--white-alpha-90')).toBe('rgba(20, 23, 28, 0.9)')
  })
  it('custom + light：写浅色那份', () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#e11d48' } }, snapshot: { light: { '--primary': '#bc002c' }, dark: { '--primary': '#ff5577' } } } }))
    run()
    expect(root().style.getPropertyValue('--primary')).toBe('#bc002c')
  })
  it('default 预设：即使落盘里残留快照也一个变量都不写（正对照上面两条）', () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'default', customColors: { primary: '#e11d48' } }, snapshot: { light: { '--primary': '#bc002c' }, dark: {} } } }))
    run()
    expect(root().style.getPropertyValue('--primary')).toBe('')
  })
  it('不是 -- 开头或不是字符串的键被跳过；坏 JSON 不抛', () => {
    localStorage.setItem('huanvae.theme', JSON.stringify({ state: { config: { preset: 'custom', customColors: { primary: '#000000' } }, snapshot: { light: { color: 'red', '--x': 1, '--primary': '#000000' }, dark: {} } } }))
    run()
    expect(root().style.getPropertyValue('--primary')).toBe('#000000')
    expect(root().style.getPropertyValue('color')).toBe('')
    expect(root().style.getPropertyValue('--x')).toBe('')
    localStorage.setItem('huanvae.theme', '{oops')
    expect(() => run()).not.toThrow()
  })
})
```

Run: `bun run test -- src/app/__tests__/themeInitScript.test.ts`
Expected: PASS（4 条）。

- [ ] **Step 14: i18n 文案（`src/i18n/messages.ts`，zh 在 `shell.settings` 对象里追加；en 同步）**

zh（追加到第 31 行那个 `settings: { … }` 对象末尾，`downloads: '下载客户端'` 之后）：
```ts
      themeEditor: {
        presetTitle: '主题配色', presetDefault: '默认', presetDefaultDesc: '应用默认配色方案', presetCustom: '自定义', presetCustomDesc: '自定义您的专属配色',
        colorsTitle: '自定义颜色', primary: '主色', accent: '强调色', done: '完成', hexInput: '十六进制颜色',
        glassTitle: '毛玻璃效果', glassBase: '底色', blur: '模糊度', saturation: '饱和度', borderOpacity: '边框透明度',
        advancedTitle: '高级透明度设置', advancedHint: '各 UI 层级的独立透明度（0–100）', expand: '展开', collapse: '收起',
        groupDialog: '弹窗层', groupBackground: '主背景层', groupCard: '卡片层', groupPanel: '面板层', groupAuxiliary: '辅助层', groupOverlay: '遮罩层',
        reset: '恢复默认主题',
      },
```
en（第 567 行同位置）：
```ts
      themeEditor: {
        presetTitle: 'Color scheme', presetDefault: 'Default', presetDefaultDesc: 'The app’s default palette', presetCustom: 'Custom', presetCustomDesc: 'Pick your own colors',
        colorsTitle: 'Custom colors', primary: 'Primary', accent: 'Accent', done: 'Done', hexInput: 'Hex color',
        glassTitle: 'Glass effect', glassBase: 'Base color', blur: 'Blur', saturation: 'Saturation', borderOpacity: 'Border opacity',
        advancedTitle: 'Advanced opacity', advancedHint: 'Per-layer opacity (0–100)', expand: 'Expand', collapse: 'Collapse',
        groupDialog: 'Dialogs', groupBackground: 'Backgrounds', groupCard: 'Cards', groupPanel: 'Panels', groupAuxiliary: 'Auxiliary', groupOverlay: 'Overlays',
        reset: 'Reset theme',
      },
```
`OPACITY_GROUPS` 的 `key`（dialog / background / card / panel / auxiliary / overlay）拼成 `shell.settings.themeEditor.group${Key}`：在 ThemeEditor 里写死一张 `GROUP_LABEL_KEYS: Record<string, string>` 映射，不做字符串大小写运算。

- [ ] **Step 15: 写编辑器失败用例 `src/components/shell/settings/__tests__/ThemeEditor.test.tsx`**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '@/features/theme/store'
import { ThemeEditor } from '../ThemeEditor'

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

beforeEach(() => {
  localStorage.clear()
  useThemeStore.getState().reset()
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers() })

describe('ThemeEditor', () => {
  it('默认预设：只显示预设卡片与毛玻璃，不显示自定义颜色；点「自定义」卡片切预设并展开取色器', () => {
    render(<ThemeEditor />)
    expect(screen.getByRole('radio', { name: /默认/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText('自定义颜色')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /自定义/ }))
    expect(useThemeStore.getState().config.preset).toBe('custom')
    expect(screen.getByText('自定义颜色')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /主色/ })).toHaveTextContent('#3B82F6')
  })
  it('滑块 50ms 防抖写 store：拖动后立刻不写，50ms 后写；预设自动变 custom', () => {
    render(<ThemeEditor />)
    fireEvent.change(screen.getByLabelText('模糊度'), { target: { value: '24' } })
    expect(useThemeStore.getState().config.customColors.glass?.blur).toBe(16)
    act(() => { vi.advanceTimersByTime(50) })
    expect(useThemeStore.getState().config.customColors.glass?.blur).toBe(24)
    expect(useThemeStore.getState().config.preset).toBe('custom')
  })
  it('高级透明度默认折叠；展开后 17 个滑块，改一个只动那一层', () => {
    render(<ThemeEditor />)
    expect(screen.queryByLabelText('level70')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /高级透明度设置/ }))
    expect(screen.getAllByRole('slider', { name: /^level\d+$/ })).toHaveLength(17)
    fireEvent.change(screen.getByLabelText('level70'), { target: { value: '40' } })
    act(() => { vi.advanceTimersByTime(50) })
    const levels = useThemeStore.getState().config.customColors.glass?.opacityLevels
    expect(levels?.level70).toBe(40)
    expect(levels?.level60).toBe(60)
  })
  it('主色文本框输入合法 hex 立即写 store；恢复默认按钮回到 default', () => {
    render(<ThemeEditor />)
    fireEvent.click(screen.getByRole('radio', { name: /自定义/ }))
    fireEvent.click(screen.getByRole('button', { name: /主色/ }))
    fireEvent.change(screen.getByLabelText('十六进制颜色'), { target: { value: '#e11d48' } })
    expect(useThemeStore.getState().config.customColors.primary).toBe('#e11d48')
    fireEvent.click(screen.getByRole('button', { name: '恢复默认主题' }))
    expect(useThemeStore.getState().config.preset).toBe('default')
    expect(useThemeStore.getState().config.customColors.primary).toBe('#3b82f6')
  })
})
```

- [ ] **Step 16: 跑用例确认失败**

Run: `bun run test -- src/components/shell/settings/__tests__/ThemeEditor.test.tsx`
Expected: FAIL（找不到 `../ThemeEditor`）。

- [ ] **Step 17: 写 `src/components/shell/settings/ThemeEditor.tsx`**

```tsx
import { Check, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Button } from '@/components/ui/button'
import { DEFAULT_GLASS_CONFIG, DEFAULT_OPACITY_LEVELS, GLASS_RANGES, OPACITY_GROUPS, THEME_PRESETS } from '@/features/theme/presets'
import { useThemeStore } from '@/features/theme/store'
import type { OpacityLevels, ThemePreset } from '@/features/theme/types'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

const NS = 'shell.settings.themeEditor'
const GROUP_LABEL_KEYS: Record<string, string> = {
  dialog: `${NS}.groupDialog`, background: `${NS}.groupBackground`, card: `${NS}.groupCard`,
  panel: `${NS}.groupPanel`, auxiliary: `${NS}.groupAuxiliary`, overlay: `${NS}.groupOverlay`,
}
const HEX6 = /^#[0-9a-fA-F]{6}$/

/** 50ms 防抖（APP 同款）：拖动期间只更新本地显示值，停手 50ms 后写 store */
function useDebouncedNumber(value: number, commit: (v: number) => void) {
  const [local, setLocal] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setLocal(value) }, [value])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const onChange = (next: number) => {
    setLocal(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(next), 50)
  }
  return [local, onChange] as const
}

function RangeRow({ id, label, value, min, max, step, onCommit, format }: { id: string; label: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void; format?: (v: number) => string }) {
  const [local, onChange] = useDebouncedNumber(value, onCommit)
  return (
    <SettingsRow title={label} htmlFor={id} right={
      <span className="flex items-center gap-2">
        <input id={id} type="range" min={min} max={max} step={step} value={local} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="w-[140px]" />
        <span className="w-12 text-right text-[12px] tabular-nums text-muted-foreground">{format ? format(local) : local}</span>
      </span>
    } />
  )
}

function ColorField({ label, color, onChange }: { label: string; color: string; onChange: (hex: string) => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(color)
  useEffect(() => { setText(color) }, [color])
  return (
    <SettingsRow title={label} right={
      <div className="relative">
        <button type="button" aria-label={label} onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-sm border border-[var(--border-default)] px-2 py-1 text-[12px]">
          <span className="h-5 w-5 rounded-sm border border-[var(--glass-border)]" style={{ backgroundColor: color }} />
          <span className="font-mono">{color.toUpperCase()}</span>
        </button>
        {open && (
          <div className="glass-card absolute right-0 z-20 mt-2 w-[220px] rounded-xl p-3">
            <HexColorPicker color={color} onChange={onChange} />
            <input aria-label={t(`${NS}.hexInput`)} value={text} onChange={(e) => { setText(e.target.value); if (HEX6.test(e.target.value)) onChange(e.target.value.toLowerCase()) }}
              onBlur={() => { if (!HEX6.test(text)) setText(color) }} className="mt-2 w-full rounded-sm border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[12px] text-foreground" />
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setOpen(false)}>{t(`${NS}.done`)}</Button>
          </div>
        )}
      </div>
    } />
  )
}

export function ThemeEditor() {
  const { t } = useI18n()
  const config = useThemeStore((s) => s.config)
  const { setPreset, setPrimaryColor, setAccentColor, setGlassConfig, setOpacityLevel, reset } = useThemeStore.getState()
  const glass = config.customColors.glass ?? DEFAULT_GLASS_CONFIG
  const levels = glass.opacityLevels ?? DEFAULT_OPACITY_LEVELS
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const presets = (Object.keys(THEME_PRESETS) as ThemePreset[]).map((key) => ({ key, ...THEME_PRESETS[key] }))

  return (
    <>
      <SettingsSection title={t(`${NS}.presetTitle`)}>
        <div role="radiogroup" aria-label={t(`${NS}.presetTitle`)} className="grid grid-cols-2 gap-2 p-2">
          {presets.map((p) => {
            const active = config.preset === p.key
            const name = t(`${NS}.${p.key === 'default' ? 'presetDefault' : 'presetCustom'}`)
            return (
              <button key={p.key} type="button" role="radio" aria-checked={active} onClick={() => setPreset(p.key)}
                className={cn('flex flex-col gap-2 rounded-lg border p-3 text-left', active ? 'border-primary bg-[var(--primary-subtle)]' : 'border-[var(--border-subtle)]')}>
                <span className="flex gap-1">{p.previewColors.map((c) => <span key={c} className="h-5 w-5 rounded-full" style={{ backgroundColor: c }} />)}</span>
                <span className="flex items-center justify-between text-[13px] text-foreground">{name}{active && <Check className="h-4 w-4 text-primary" />}</span>
                <span className="text-[11px] text-muted-foreground">{t(`${NS}.${p.key === 'default' ? 'presetDefaultDesc' : 'presetCustomDesc'}`)}</span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      {config.preset === 'custom' && (
        <SettingsSection title={t(`${NS}.colorsTitle`)}>
          <SettingsGroup>
            <ColorField label={t(`${NS}.primary`)} color={config.customColors.primary} onChange={setPrimaryColor} />
            <ColorField label={t(`${NS}.accent`)} color={config.customColors.accent ?? config.customColors.primary} onChange={setAccentColor} />
          </SettingsGroup>
        </SettingsSection>
      )}

      <SettingsSection title={t(`${NS}.glassTitle`)}>
        <SettingsGroup>
          <ColorField label={t(`${NS}.glassBase`)} color={glass.baseColor} onChange={(hex) => setGlassConfig({ baseColor: hex })} />
          <RangeRow id="theme-blur" label={t(`${NS}.blur`)} value={glass.blur} {...GLASS_RANGES.blur} onCommit={(v) => setGlassConfig({ blur: v })} format={(v) => `${v}px`} />
          <RangeRow id="theme-saturation" label={t(`${NS}.saturation`)} value={glass.saturation} {...GLASS_RANGES.saturation} onCommit={(v) => setGlassConfig({ saturation: v })} format={(v) => `${v}%`} />
          <RangeRow id="theme-border" label={t(`${NS}.borderOpacity`)} value={glass.borderOpacity} {...GLASS_RANGES.borderOpacity} onCommit={(v) => setGlassConfig({ borderOpacity: v })} format={(v) => v.toFixed(2)} />
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title={t(`${NS}.advancedTitle`)} description={t(`${NS}.advancedHint`)}>
        <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)} className="w-full px-3 py-2 text-left text-[13px] text-primary">
          {t(`${NS}.advancedTitle`)} · {advancedOpen ? t(`${NS}.collapse`) : t(`${NS}.expand`)}
        </button>
        {advancedOpen && OPACITY_GROUPS.map((group) => (
          <div key={group.key} className="border-t border-[var(--border-subtle)]">
            <div className="px-3 pt-2 text-[12px] font-semibold text-muted-foreground">{t(GROUP_LABEL_KEYS[group.key])}</div>
            <SettingsGroup>
              {group.levels.map((level) => (
                <RangeRow key={level} id={`theme-${level}`} label={level} value={levels[level as keyof OpacityLevels]} min={0} max={100} step={1} onCommit={(v) => setOpacityLevel(level as keyof OpacityLevels, v)} format={(v) => `${v}%`} />
              ))}
            </SettingsGroup>
          </div>
        ))}
      </SettingsSection>

      <div className="mb-6 flex justify-end">
        <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" />{t(`${NS}.reset`)}</Button>
      </div>
    </>
  )
}
```

`AppearanceSection.tsx`：`import { ThemeEditor } from './ThemeEditor'`，把返回值改成 `<><SettingsSection …>（原样）</SettingsSection><ThemeEditor /></>`。

`src/styles/globals.css`：在 `:root {` 上一行加注释 `/* 第 2 期：自定义主题由 src/features/theme 在运行时用同名内联变量覆盖这两组值；默认预设不写内联变量，静态值即首屏 */`。

- [ ] **Step 18: 跑编辑器用例确认通过；跑全量**

Run: `bun run test -- src/components/shell/settings/__tests__/ThemeEditor.test.tsx`
Expected: PASS（4 条）。滑块 label 用 `level70` 这种原始 key 作 `aria-label`（不翻译，它就是变量名 `--white-alpha-70` 的层级）。
Run: `bun run test`
Expected: 全绿。`src/lib/__tests__/sessionScope.test.ts` 不需要改（新键走 `keep:'whole'`，那边的用例按表遍历）。

- [ ] **Step 19: 变异校验**

| 变异 | 必红 |
|---|---|
| `ThemeProvider` 里 `clearThemeVariables` 分支改成什么都不做 | ThemeProvider 用例 2 |
| `apply()` 里 `isDark` 恒 false | 用例 3、4 |
| `withSnapshot` 在 default 也算快照 | store 用例 1、3；脚本用例 3 若同时把脚本的 `preset === 'custom'` 判断去掉 |
| 防抖 50ms 改成立即写 | 编辑器用例 2（第一句 `toBe(16)` 红） |
| `setOpacityLevel` 不夹值 | store 用例 4 |

- [ ] **Step 20: 门槛与提交**

```bash
bun run typecheck
bun run lint
bun --bun run build
git add package.json bun.lock src/features/theme src/app/themeInitScript.ts src/app/root.tsx src/app/__tests__/themeInitScript.test.ts src/lib/sessionScope.ts src/components/shell/settings src/i18n/messages.ts src/styles/globals.css
git commit -m "feat(theme): themeStore 快照 + ThemeProvider 内联变量 + 防闪脚本 + 外观分区主题编辑器

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: 黑名单——API / store / 设置内嵌面板 / `ProfileView` 拉黑按钮 / 列表标灰（spec §5 / §10.3 / §11）

**Files:**
- Modify: `src/lib/apiParse.ts`（新增导出 `arrayOf`）
- Modify: `src/features/chat/api/friends.ts`（`BlacklistedUser`、`parseBlacklistedUser`、`friendsApi.getBlacklist / addBlacklist / removeBlacklist`）
- Modify: `src/features/chat/store/friendsStore.ts`（`blacklist`、`blacklistLoaded`、`loadBlacklist / addBlacklist / removeBlacklist`）
- Modify: `src/features/chat/hooks/useUnifiedConversations.ts`（`UnifiedConversation.blacklisted`）
- Modify: `src/components/shell/ConversationCard.tsx`、`src/components/shell/ContactsList.tsx`（标灰）、`src/components/shell/ProfileView.tsx`（拉黑 / 取消拉黑）、`src/components/shell/settings/AccountSection.tsx`（内嵌面板）
- Create: `src/components/shell/settings/BlacklistPanel.tsx`
- Modify: `src/i18n/messages.ts`（`shell.settings.blacklist.*`、`shell.contacts.block / unblock / confirmBlock / blockFailed`）
- Test: `src/features/chat/api/__tests__/friends.test.ts`（追加）、`src/features/chat/store/__tests__/friendsStore.test.ts`（矩阵扩容 + 翻转用例）、`src/features/chat/hooks/__tests__/useUnifiedConversations.test.ts`（追加）、`src/components/shell/__tests__/ProfileView.test.tsx`（追加）、`src/components/shell/settings/__tests__/BlacklistPanel.test.tsx`（新建）、`src/components/shell/__tests__/UnifiedList.test.tsx`（追加一条）

**Interfaces:**
- Consumes: `readEnvelope / assertEnvelopeOk / ApiShapeError`、`asRecord / str / nullableStr / describe`、`fetchWithAuth`、`pinSession / registerPristineStoreReset`、`handleApiError`（friendsStore 内部）。
- Produces:
  - `arrayOf<T>(row: (input: unknown) => T): Parser<T[]>`（`src/lib/apiParse.ts`；Task 4 复用）。
  - `interface BlacklistedUser { user_id: string; user_nickname: string | null; user_avatar_url: string | null; created_at: string }`；`friendsApi.getBlacklist(): Promise<BlacklistedUser[]>`、`friendsApi.addBlacklist(targetUserId: string): Promise<void>`、`friendsApi.removeBlacklist(targetUserId: string): Promise<void>`。
  - `useFriendsStore` 新字段 `blacklist: BlacklistedUser[]`、`blacklistLoaded: boolean`；动作 `loadBlacklist(): Promise<void>`、`addBlacklist(userId: string): Promise<void>`、`removeBlacklist(userId: string): Promise<void>`（成功后翻转 `friends[].is_blacklisted`；失败 rethrow；**不碰** `isLoading`——那是好友列表的转圈位，动它会让联系人栏闪一下）。
  - `UnifiedConversation.blacklisted: boolean`（第 3 期群消息折叠也读 `friendsStore.blacklist`，spec §13）。

**后端契约（backend-docs `friends/好友添加删除.md` :150–200，逐字）：** `POST /api/friends/blacklist` body `{ target_user_id }` → `{ success, code, message }` 无 `data`；`DELETE /api/friends/blacklist/{target_user_id}` 无 body；`GET /api/friends/blacklist` → `data: BlacklistedUserDto[]`，四个字段恒出现（无 `skip_serializing_if`），`user_avatar_url` 是**相对路径**需 `toAbsoluteApiUrl`。

- [ ] **Step 1: 写 API 失败用例（追加到 `src/features/chat/api/__tests__/friends.test.ts` 末尾；复用该文件的 `ok` / `fetchMock` / `FRIENDS_BASE`）**

```ts
describe('friendsApi 黑名单三接口（backend-docs friends/好友添加删除.md :150-200）', () => {
  const BLACKLISTED = { user_id: 'u2', user_nickname: '李四', user_avatar_url: 'avatars/u2.png', created_at: '2026-09-01T00:00:00Z' }

  it('getBlacklist：GET /api/friends/blacklist，头像相对路径补成绝对地址，null 保持 null', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [BLACKLISTED, { ...BLACKLISTED, user_id: 'u3', user_nickname: null, user_avatar_url: null }] }))
    const rows = await friendsApi.getBlacklist()
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${FRIENDS_BASE}/blacklist`)
    expect(rows).toEqual([
      { user_id: 'u2', user_nickname: '李四', user_avatar_url: `${location.origin}/avatars/u2.png`, created_at: '2026-09-01T00:00:00Z' },
      { user_id: 'u3', user_nickname: null, user_avatar_url: null, created_at: '2026-09-01T00:00:00Z' },
    ])
  })
  it('getBlacklist：缺 user_id 抛 ApiShapeError；data 不是数组也抛', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: [{ ...BLACKLISTED, user_id: undefined }] }))
    await expect(friendsApi.getBlacklist()).rejects.toBeInstanceOf(ApiShapeError)
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, data: { items: [] } }))
    await expect(friendsApi.getBlacklist()).rejects.toThrow(/应为数组/)
  })
  it('addBlacklist：POST body 只有 { target_user_id }；无 data 的 ok 信封不抛', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, message: '已拉黑' }))
    await expect(friendsApi.addBlacklist('u2')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${FRIENDS_BASE}/blacklist`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ target_user_id: 'u2' })
  })
  it('removeBlacklist：DELETE /api/friends/blacklist/{id}，id 经 encodeURIComponent', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: true, code: 200, message: '已取消拉黑' }))
    await friendsApi.removeBlacklist('u 2/x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(`${FRIENDS_BASE}/blacklist/u%202%2Fx`)
    expect(init.method).toBe('DELETE')
  })
  it('拉黑 HTTP 200 但 success:false 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 400, error: '不能拉黑自己' }))
    await expect(friendsApi.addBlacklist('me')).rejects.toThrow(/不能拉黑自己/)
  })
})
```
（文件顶部要多 import `ApiShapeError`：`import { ApiShapeError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'`。）

- [ ] **Step 2: 跑用例确认失败**

Run: `bun run test -- src/features/chat/api/__tests__/friends.test.ts`
Expected: 新的 5 条 FAIL（`friendsApi.getBlacklist is not a function`）。

- [ ] **Step 3: `src/lib/apiParse.ts` 末尾加**

```ts
import type { Parser } from './apiEnvelope'

/**
 * `data` 本身就是数组：校验它是数组，再逐行喂给 `row`——挂在 `readEnvelope` 的 `parse`
 * 档上，行级校验抛出的错误会被 `validatePayload` 接住、转成可上报的 `ApiShapeError`。
 * （从 `features/miniapps/api/miniapps.ts` 的私有版本提升而来，供好友黑名单 / OAuth 复用。）
 */
export function arrayOf<T>(row: (input: unknown) => T): Parser<T[]> {
  return {
    parse(input: unknown) {
      if (!Array.isArray(input)) throw new Error(`data 应为数组，实际是 ${describe(input)}`)
      return input.map(row)
    },
  }
}
```
（`import type` 放到文件顶部与其它 import 一起；`apiEnvelope.ts` 已经 import 本文件的 `isRecord`，type-only 反向引用不构成运行时循环。）

- [ ] **Step 4: `src/features/chat/api/friends.ts` 追加类型、解析器与三个方法**

顶部 import 改为：
```ts
import { assertEnvelopeOk, readEnvelope, readEnvelopeList } from '@/lib/apiEnvelope'
import { arrayOf, asRecord, nullableStr, str } from '@/lib/apiParse'
```
`SentRequest` 之后加：
```ts
/**
 * `GET /api/friends/blacklist` 的一条（后端 `BlacklistedUserDto`，
 * `backend-docs/friends/好友添加删除.md:180-198`）：四个字段恒出现，可空字段是 `null`。
 */
export interface BlacklistedUser {
  user_id: string
  user_nickname: string | null
  /** 出口处已补成绝对地址（文档写明是相对路径） */
  user_avatar_url: string | null
  created_at: string
}

export function parseBlacklistedUser(input: unknown): BlacklistedUser {
  const r = asRecord(input, 'GET /api/friends/blacklist 的一项')
  return {
    user_id: str(r, 'user_id'),
    user_nickname: nullableStr(r, 'user_nickname'),
    user_avatar_url: absoluteAvatar(nullableStr(r, 'user_avatar_url')),
    created_at: str(r, 'created_at'),
  }
}
```
`friendsApi` 对象里 `removeFriend` 之后加：
```ts
  /** GET /api/friends/blacklist */
  getBlacklist: async (): Promise<BlacklistedUser[]> => {
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/blacklist`, { method: 'GET' })
    return readEnvelope<BlacklistedUser[]>(response, {
      endpoint: 'GET /api/friends/blacklist',
      fallbackMessage: '获取黑名单失败',
      parse: arrayOf(parseBlacklistedUser),
    })
  },

  /** POST /api/friends/blacklist，body `{ target_user_id }`；拉黑方取自会话，不在 body 里 */
  addBlacklist: async (targetUserId: string): Promise<void> => {
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/blacklist`, {
      method: 'POST',
      body: JSON.stringify({ target_user_id: targetUserId }),
    })
    await assertEnvelopeOk(response, { endpoint: 'POST /api/friends/blacklist', fallbackMessage: '拉黑失败' })
  },

  /** DELETE /api/friends/blacklist/{target_user_id} */
  removeBlacklist: async (targetUserId: string): Promise<void> => {
    const response = await fetchWithAuth(`${FRIENDS_BASE_URL}/blacklist/${encodeURIComponent(targetUserId)}`, { method: 'DELETE' })
    await assertEnvelopeOk(response, { endpoint: 'DELETE /api/friends/blacklist/{target_user_id}', fallbackMessage: '取消拉黑失败' })
  },
```
（`absoluteAvatar` 定义在解析器之前即可——它已经在文件里，位置在 `SentRequest` 之后；把新代码放在它之后。）

- [ ] **Step 5: 跑 API 用例确认通过**

Run: `bun run test -- src/features/chat/api/__tests__/friends.test.ts`
Expected: PASS。

- [ ] **Step 6: 写 store 失败用例（`src/features/chat/store/__tests__/friendsStore.test.ts`）**

(a) `ACTIONS` 数组追加三项（矩阵自动覆盖认证 / 非认证两条分支）：
```ts
  {
    action: 'loadBlacklist',
    endpoint: 'GET /api/friends/blacklist',
    stub: (error: Error) => vi.spyOn(friendsApi, 'getBlacklist').mockRejectedValue(error),
    run: () => useFriendsStore.getState().loadBlacklist(),
  },
  {
    action: 'addBlacklist',
    endpoint: 'POST /api/friends/blacklist',
    stub: (error: Error) => vi.spyOn(friendsApi, 'addBlacklist').mockRejectedValue(error),
    run: () => useFriendsStore.getState().addBlacklist('u2'),
  },
  {
    action: 'removeBlacklist',
    endpoint: 'DELETE /api/friends/blacklist/{target_user_id}',
    stub: (error: Error) => vi.spyOn(friendsApi, 'removeBlacklist').mockRejectedValue(error),
    run: () => useFriendsStore.getState().removeBlacklist('u2'),
  },
```
`beforeEach` 里的 `useFriendsStore.setState({...})` 加 `blacklist: [], blacklistLoaded: false`。

(b) 跨会话 describe：`PRISTINE` 与 `snapshot()` 各加 `blacklist: []` / `blacklist: state.blacklist` 与 `blacklistLoaded: false` / `blacklistLoaded: state.blacklistLoaded`；新增常量 `const ALICE_BLACKLISTED = { user_id: 'evil', user_nickname: 'A 拉黑的人', user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }`；`stubAliceLists` 加 `vi.spyOn(friendsApi, 'getBlacklist').mockResolvedValue([ALICE_BLACKLISTED])`；`CROSS_ACTIONS` 追加：
```ts
    { action: 'loadBlacklist', defer: 'getBlacklist', landed: [ALICE_BLACKLISTED] },
    { action: 'addBlacklist', defer: 'addBlacklist', landed: undefined },
    { action: 'removeBlacklist', defer: 'removeBlacklist', landed: undefined },
```
`runOf` 的 switch 加三个 case（`store.loadBlacklist()` / `store.addBlacklist('u2')` / `store.removeBlacklist('u2')`）。

(c) 新 describe（文件末尾）：
```ts
describe('friendsStore 黑名单：成功后翻转 friends[].is_blacklisted 并同步 blacklist 列表', () => {
  const FRIEND = { friend_id: 'u2', friend_nickname: '李四', friend_avatar_url: 'https://cdn.test/u2.png', add_time: '2026-01-01T00:00:00Z', approve_reason: null, friend_remark: '小四', is_blacklisted: false, is_special_care: false }

  it('loadBlacklist 写 blacklist 与 blacklistLoaded，不碰 isLoading', async () => {
    vi.spyOn(friendsApi, 'getBlacklist').mockResolvedValue([{ user_id: 'u9', user_nickname: null, user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }])
    await useFriendsStore.getState().loadBlacklist()
    expect(useFriendsStore.getState().blacklist.map((u) => u.user_id)).toEqual(['u9'])
    expect(useFriendsStore.getState().blacklistLoaded).toBe(true)
    expect(useFriendsStore.getState().isLoading).toBe(false)
  })
  it('addBlacklist 成功：is_blacklisted 翻成 true，用备注名与头像本地补一条，不重拉', async () => {
    useFriendsStore.setState({ friends: [FRIEND] })
    const add = vi.spyOn(friendsApi, 'addBlacklist').mockResolvedValue(undefined)
    const get = vi.spyOn(friendsApi, 'getBlacklist')
    await useFriendsStore.getState().addBlacklist('u2')
    expect(add).toHaveBeenCalledWith('u2')
    expect(get).not.toHaveBeenCalled()
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(true)
    const entry = useFriendsStore.getState().blacklist[0]
    expect(entry.user_id).toBe('u2')
    expect(entry.user_nickname).toBe('小四')
    expect(entry.user_avatar_url).toBe('https://cdn.test/u2.png')
    expect(Number.isNaN(new Date(entry.created_at).getTime())).toBe(false)
  })
  it('addBlacklist 失败：不翻转、列表不变、reject（正对照）', async () => {
    useFriendsStore.setState({ friends: [FRIEND] })
    vi.spyOn(friendsApi, 'addBlacklist').mockRejectedValue(permissionDenied('POST /api/friends/blacklist'))
    await expect(useFriendsStore.getState().addBlacklist('u2')).rejects.toThrow('权限不足')
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(false)
    expect(useFriendsStore.getState().blacklist).toEqual([])
  })
  it('removeBlacklist 成功：翻回 false 并从 blacklist 移除；不是好友的人只动列表', async () => {
    useFriendsStore.setState({ friends: [{ ...FRIEND, is_blacklisted: true }], blacklist: [{ user_id: 'u2', user_nickname: '李四', user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }, { user_id: 'u9', user_nickname: null, user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }] })
    vi.spyOn(friendsApi, 'removeBlacklist').mockResolvedValue(undefined)
    await useFriendsStore.getState().removeBlacklist('u2')
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(false)
    expect(useFriendsStore.getState().blacklist.map((u) => u.user_id)).toEqual(['u9'])
    await useFriendsStore.getState().removeBlacklist('u9')
    expect(useFriendsStore.getState().blacklist).toEqual([])
    expect(useFriendsStore.getState().friends[0].is_blacklisted).toBe(false)
  })
  it('登出归零：blacklist 与 blacklistLoaded 随 registerPristineStoreReset 回到初值', async () => {
    useFriendsStore.setState({ blacklist: [{ user_id: 'u2', user_nickname: null, user_avatar_url: null, created_at: '2026-01-01T00:00:00Z' }], blacklistLoaded: true })
    useAuthStore.getState().clearAuth()
    expect(useFriendsStore.getState().blacklist).toEqual([])
    expect(useFriendsStore.getState().blacklistLoaded).toBe(false)
  })
})
```

- [ ] **Step 7: 跑用例确认失败**

Run: `bun run test -- src/features/chat/store/__tests__/friendsStore.test.ts`
Expected: 新增用例 FAIL（`loadBlacklist is not a function` / 矩阵里三个新 action 红）。

- [ ] **Step 8: `src/features/chat/store/friendsStore.ts` 实现**

`interface FriendsState` 加：
```ts
  /** 已拉黑的人（账号级，登出归零）；`blacklistLoaded` 区分"没拉过"与"拉过是空" */
  blacklist: BlacklistedUser[]
  blacklistLoaded: boolean
  loadBlacklist: () => Promise<void>
  /** 成功后翻转 friends[].is_blacklisted 并本地补一条，不重拉（spec §5） */
  addBlacklist: (userId: string) => Promise<void>
  removeBlacklist: (userId: string) => Promise<void>
```
import 行加 `type BlacklistedUser`，并 `import { friendDisplayName } from '../lib/friendName'`。初始状态加 `blacklist: [], blacklistLoaded: false,`。动作（放在 `setOnlineStatus` 之前；守卫写法与其它七个 action 逐字同型，见文件顶部注释）：
```ts
  loadBlacklist: async () => {
    const stillMine = pinSession()
    try {
      const blacklist = await friendsApi.getBlacklist()
      if (!stillMine()) return
      set({ blacklist, blacklistLoaded: true })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '获取黑名单失败')
      if (errorMessage !== null) set({ error: errorMessage })
      throw error
    }
  },

  addBlacklist: async (userId: string) => {
    const stillMine = pinSession()
    try {
      await friendsApi.addBlacklist(userId)
      if (!stillMine()) return
      const { friends, blacklist } = get()
      const friend = friends.find((f) => f.friend_id === userId)
      const entry: BlacklistedUser = {
        user_id: userId,
        user_nickname: friend ? friendDisplayName(friend) : null,
        user_avatar_url: friend?.friend_avatar_url ?? null,
        created_at: new Date().toISOString(),
      }
      set({
        friends: friends.map((f) => (f.friend_id === userId ? { ...f, is_blacklisted: true } : f)),
        blacklist: blacklist.some((u) => u.user_id === userId) ? blacklist : [entry, ...blacklist],
      })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '拉黑失败')
      if (errorMessage !== null) set({ error: errorMessage })
      throw error
    }
  },

  removeBlacklist: async (userId: string) => {
    const stillMine = pinSession()
    try {
      await friendsApi.removeBlacklist(userId)
      if (!stillMine()) return
      const { friends, blacklist } = get()
      set({
        friends: friends.map((f) => (f.friend_id === userId ? { ...f, is_blacklisted: false } : f)),
        blacklist: blacklist.filter((u) => u.user_id !== userId),
      })
    } catch (error) {
      if (!stillMine()) throw error
      const errorMessage = handleApiError(error, '取消拉黑失败')
      if (errorMessage !== null) set({ error: errorMessage })
      throw error
    }
  },
```
`friendDisplayName(friend)` 返回备注优先的显示名（`src/features/chat/lib/friendName.ts`，已存在）。文件顶部注释里"七个 action"的表述改成"十个 action"（矩阵扩了）。

- [ ] **Step 9: 跑 store 用例确认通过**

Run: `bun run test -- src/features/chat/store/__tests__/friendsStore.test.ts`
Expected: PASS（矩阵 10×2 + 跨会话 10×2 + 复合 5 + 新增 5 + 原有零散用例）。

- [ ] **Step 10: 标灰——`useUnifiedConversations` / `ConversationCard` / `ContactsList`**

`src/features/chat/hooks/useUnifiedConversations.ts`：`UnifiedConversation` 加 `/** 好友被拉黑：列表只标灰不分组（契约 :117） */ blacklisted: boolean`；好友分支 `list.push({ …, blacklisted: f.is_blacklisted })`，群分支 `blacklisted: false`。

`src/components/shell/ConversationCard.tsx` 第 52 行的名字 span：`className={cn('block min-w-0 flex-1 truncate', c.blacklisted && 'text-muted-foreground line-through')}`。

`src/components/shell/ContactsList.tsx`：`ContactRow` 加 prop `muted?: boolean`，名字 span 改为 `className={cn('block truncate text-[14px] font-semibold', muted ? 'text-muted-foreground line-through' : 'text-foreground')}`；好友行传 `muted={f.is_blacklisted}`。

用例——`src/features/chat/hooks/__tests__/useUnifiedConversations.test.ts` 的 `conv()` 工厂加 `blacklisted: false`，并追加：
```ts
  it('好友 is_blacklisted 映射成 blacklisted（群恒 false）', () => {
    useFriendsStore.setState({ friends: [friend('u1', { is_blacklisted: true }), friend('u2')], hasLoaded: true })
    useGroupStore.setState({ myGroups: [group('g1')], hasLoaded: true })
    const { result } = renderHook(() => useUnifiedConversations())
    const byId = Object.fromEntries(result.current.conversations.map((c) => [c.id, c.blacklisted]))
    expect(byId).toEqual({ 'f-u1': true, 'f-u2': false, 'g-g1': false })
  })
```
（该文件已有 describe 里 `useFriendsStore.setState` 的既有写法照抄。）`src/components/shell/__tests__/UnifiedList.test.tsx` 的 `conv()` 工厂加 `blacklisted: false`，追加：
```ts
  it('被拉黑的好友：名字标灰划线；正常好友没有（正对照）', () => {
    render(<UnifiedList {...base} conversations={[conv('f-bad', { blacklisted: true }), conv('f-ok')]} />)
    expect(screen.getByTestId('conversation-f-bad').querySelector('span[title="f-bad"]')).toHaveClass('line-through')
    expect(screen.getByTestId('conversation-f-ok').querySelector('span[title="f-ok"]')).not.toHaveClass('line-through')
  })
```

- [ ] **Step 11: i18n（zh / en 都加）**

`shell.contacts` 追加：zh `block: '拉黑', unblock: '取消拉黑', confirmBlock: '拉黑后你们互相收不到对方的消息，好友关系保留。确定拉黑？', blockFailed: '操作失败'`；en `block: 'Block', unblock: 'Unblock', confirmBlock: 'Blocked users cannot message each other; friendship is kept. Block this user?', blockFailed: 'Action failed'`。

`shell.settings` 追加对象：zh
```ts
      blacklist: { title: '黑名单', hint: '被拉黑的用户与你互相收不到对方发送的消息；好友关系仍保留。可随时取消拉黑。', empty: '没有拉黑任何人', remove: '取消拉黑', confirm: '确认', cancel: '取消', blockedAt: '拉黑于 {date}', removeFailed: '取消拉黑失败' },
```
en
```ts
      blacklist: { title: 'Blocked users', hint: 'Blocked users and you cannot receive each other’s messages; the friendship is kept. You can unblock at any time.', empty: 'No blocked users', remove: 'Unblock', confirm: 'Confirm', cancel: 'Cancel', blockedAt: 'Blocked on {date}', removeFailed: 'Failed to unblock' },
```

- [ ] **Step 12: 写面板失败用例 `src/components/shell/settings/__tests__/BlacklistPanel.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { BlacklistPanel } from '../BlacklistPanel'

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const ROW = { user_id: 'u2', user_nickname: '李四', user_avatar_url: null, created_at: '2026-09-01T00:00:00Z' }

beforeEach(() => {
  useFriendsStore.setState({ blacklist: [], blacklistLoaded: false, loadBlacklist: vi.fn(async () => { useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true }) }), removeBlacklist: vi.fn(async () => { useFriendsStore.setState({ blacklist: [] }) }) })
})
afterEach(() => vi.restoreAllMocks())

describe('BlacklistPanel', () => {
  it('挂载时拉一次列表；渲染昵称 / @id / 拉黑时间与提示文案', async () => {
    render(<BlacklistPanel />)
    expect(await screen.findByText('李四')).toBeInTheDocument()
    expect(screen.getByText('@u2')).toBeInTheDocument()
    expect(screen.getByText(/拉黑于/)).toBeInTheDocument()
    expect(screen.getByText(/好友关系仍保留/)).toBeInTheDocument()
    expect(useFriendsStore.getState().loadBlacklist).toHaveBeenCalledTimes(1)
  })
  it('已加载过（blacklistLoaded）就不再拉', () => {
    useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true })
    render(<BlacklistPanel />)
    expect(useFriendsStore.getState().loadBlacklist).not.toHaveBeenCalled()
    expect(screen.getByText('李四')).toBeInTheDocument()
  })
  it('两步确认：第一次点「取消拉黑」不调 API；「确认」才调；「取消」收回', async () => {
    render(<BlacklistPanel />)
    await screen.findByText('李四')
    fireEvent.click(screen.getByRole('button', { name: '取消拉黑' }))
    expect(useFriendsStore.getState().removeBlacklist).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('button', { name: '确认' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消拉黑' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(useFriendsStore.getState().removeBlacklist).toHaveBeenCalledWith('u2'))
    expect(await screen.findByText('没有拉黑任何人')).toBeInTheDocument()
  })
  it('加载失败：错误行 + 重试再拉一次', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('网络断了')).mockImplementation(async () => { useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true }) })
    useFriendsStore.setState({ loadBlacklist: load })
    render(<BlacklistPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('网络断了')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('李四')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('取消拉黑失败：错误行可见，行还在', async () => {
    useFriendsStore.setState({ blacklist: [ROW], blacklistLoaded: true, removeBlacklist: vi.fn(async () => { throw new Error('boom') }) })
    render(<BlacklistPanel />)
    fireEvent.click(screen.getByRole('button', { name: '取消拉黑' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(await screen.findByText(/取消拉黑失败/)).toHaveTextContent('boom')
    expect(screen.getByText('李四')).toBeInTheDocument()
  })
})
```

- [ ] **Step 13: 跑用例确认失败**

Run: `bun run test -- src/components/shell/settings/__tests__/BlacklistPanel.test.tsx`
Expected: FAIL（找不到 `../BlacklistPanel`）。

- [ ] **Step 14: 写 `src/components/shell/settings/BlacklistPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { BlacklistedUser } from '@/features/chat/api/friends'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useI18n } from '@/i18n/I18nProvider'

const NS = 'shell.settings.blacklist'

function BlacklistRow({ user, onRemove, removing }: { user: BlacklistedUser; onRemove: () => Promise<void>; removing: boolean }) {
  const { t } = useI18n()
  const [confirm, setConfirm] = useState(false)
  const name = user.user_nickname?.trim() || user.user_id
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <Avatar className="h-9 w-9 rounded-[10px]">
        {user.user_avatar_url && <AvatarImage src={user.user_avatar_url} alt="" />}
        <AvatarFallback className="rounded-[10px] text-app-light">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-foreground">{name}</div>
        <div className="truncate text-[12px] text-muted-foreground">@{user.user_id} · {t(`${NS}.blockedAt`, { date: new Date(user.created_at).toLocaleDateString() })}</div>
      </div>
      {confirm ? (
        <span className="flex gap-1">
          <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={removing} onClick={() => { setConfirm(false); void onRemove() }}>{t(`${NS}.confirm`)}</button>
          <button type="button" className="subtle-btn" disabled={removing} onClick={() => setConfirm(false)}>{t(`${NS}.cancel`)}</button>
        </span>
      ) : (
        <button type="button" className="subtle-btn" disabled={removing} onClick={() => setConfirm(true)}>{t(`${NS}.remove`)}</button>
      )}
    </li>
  )
}

/** 设置 → 账户与安全 → 黑名单（内嵌，spec §5）。列表在 friendsStore，loading / error 是本面板自己的。 */
export function BlacklistPanel() {
  const { t } = useI18n()
  const blacklist = useFriendsStore((s) => s.blacklist)
  const loaded = useFriendsStore((s) => s.blacklistLoaded)
  const loadBlacklist = useFriendsStore((s) => s.loadBlacklist)
  const removeBlacklist = useFriendsStore((s) => s.removeBlacklist)
  const [loading, setLoading] = useState(!loaded)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    loadBlacklist().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false))
  }
  // biome 的 exhaustive-deps 在本仓是 warn 级：这里只想在挂载时按 loaded 决定拉不拉一次
  useEffect(() => { if (!loaded) load() }, [])

  const remove = async (userId: string) => {
    setRemoving(userId)
    setRemoveError(null)
    try { await removeBlacklist(userId) } catch (e: unknown) { setRemoveError(e instanceof Error ? e.message : String(e)) } finally { setRemoving(null) }
  }

  if (loading) return <ListLoading />
  if (error) return <ListError error={error} onRetry={load} />
  return (
    <div>
      <p className="px-3 pt-3 text-[12px] text-muted-foreground">{t(`${NS}.hint`)}</p>
      {blacklist.length === 0 ? <ListEmpty message={t(`${NS}.empty`)} /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {blacklist.map((u) => <BlacklistRow key={u.user_id} user={u} removing={removing === u.user_id} onRemove={() => remove(u.user_id)} />)}
        </ul>
      )}
      {removeError && <p className="px-3 pb-3 text-[13px] text-destructive" role="alert">{t(`${NS}.removeFailed`)}: {removeError}</p>}
    </div>
  )
}
```
⚠️ 上面 `useEffect(() => { if (!loaded) load() }, [])` 这一行若 `bun run lint` 把 `useExhaustiveDependencies` 报成新增 warning（基线 158 不能升），改成：`const loadedRef = useRef(loaded); useEffect(() => { if (!loadedRef.current) load() }, [])` 仍然会报——正确的做法是把 `load` 用 `useCallback([loadBlacklist])` 包起来并把 `[loaded, load]` 写全，同时用 `const startedRef = useRef(false)` 防止 `loaded` 变化后二次拉取。**不许**用 `biome-ignore`。

`AccountSection.tsx`：在 `devices` 分区之后加 `<SettingsSection title={t('shell.settings.blacklist.title')}><BlacklistPanel /></SettingsSection>`。

- [ ] **Step 15: 跑面板用例确认通过**

Run: `bun run test -- src/components/shell/settings/__tests__/BlacklistPanel.test.tsx`
Expected: PASS（5 条）。

- [ ] **Step 16: `ProfileView` 拉黑 / 取消拉黑（先补用例，再实现）**

`src/components/shell/__tests__/ProfileView.test.tsx` 的 `beforeEach` 里 `useFriendsStore.setState({...})` 加 `addBlacklist: vi.fn(async () => {}), removeBlacklist: vi.fn(async () => {})`；追加：
```tsx
  it('拉黑：确认后调 addBlacklist(userId)；取消不调', async () => {
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    screen.getByRole('button', { name: '拉黑' }).click()
    expect(useFriendsStore.getState().addBlacklist).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '拉黑' }).click()
    await waitFor(() => expect(useFriendsStore.getState().addBlacklist).toHaveBeenCalledWith('alice'))
  })
  it('已拉黑的好友显示「取消拉黑」，点击直接调 removeBlacklist（不弹确认）', async () => {
    useFriendsStore.setState({ friends: [{ ...useFriendsStore.getState().friends[0], is_blacklisted: true }] })
    renderView()
    await screen.findByText('早睡早起')
    expect(screen.queryByRole('button', { name: '拉黑' })).toBeNull()
    screen.getByRole('button', { name: '取消拉黑' }).click()
    await waitFor(() => expect(useFriendsStore.getState().removeBlacklist).toHaveBeenCalledWith('alice'))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('拉黑失败：显示错误行', async () => {
    useFriendsStore.setState({ addBlacklist: vi.fn(async () => { throw new Error('boom') }) })
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '拉黑' }).click()
    expect(await screen.findByText(/操作失败/)).toHaveTextContent('boom')
  })
```
实现（`ProfileView.tsx`）：`import { Ban, MessageCircle, UserMinus } from 'lucide-react'`；取 `addBlacklist / removeBlacklist`；状态 `blocking`、`blockError`；
```tsx
  const handleBlockToggle = async () => {
    if (!friend) return
    if (!friend.is_blacklisted && !window.confirm(t('shell.contacts.confirmBlock'))) return
    setBlockError(null)
    setBlocking(true)
    try {
      if (friend.is_blacklisted) await removeBlacklist(userId)
      else await addBlacklist(userId)
    } catch (e: unknown) {
      setBlockError(e instanceof Error ? e.message : String(e))
    } finally {
      setBlocking(false)
    }
  }
```
按钮放在「删除好友」之前：`<button type="button" onClick={handleBlockToggle} disabled={blocking} className="subtle-btn"><Ban className="h-4 w-4" />{friend.is_blacklisted ? t('shell.contacts.unblock') : t('shell.contacts.block')}</button>`；错误行 `{blockError && <p className="mt-3 text-[13px] text-destructive" role="alert">{t('shell.contacts.blockFailed')}: {blockError}</p>}`。`friend` 取自 store，翻转后按钮文案随之变化。

Run: `bun run test -- src/components/shell/__tests__/ProfileView.test.tsx`
Expected: PASS。

- [ ] **Step 17: 变异校验**

| 变异 | 必红 |
|---|---|
| `addBlacklist` 成功分支不翻 `is_blacklisted` | store「addBlacklist 成功」 |
| `addBlacklist` 的 catch 先 `handleApiError` 再 `stillMine` | 跨会话「落地失败」×addBlacklist |
| `BlacklistRow` 第一次点击就调 `onRemove` | 面板「两步确认」 |
| `ContactRow` 不传 `muted` | UnifiedList 那条不红（它测的是 ConversationCard）——所以 ContactsList 的标灰再补一条：在 `ContactsList.test.tsx` 现有好友列表用例里给一个 `is_blacklisted: true` 的好友并断言 `screen.getByTestId('contact-f-<id>')` 内 `.line-through` 存在 |

- [ ] **Step 18: 门槛与提交**

```bash
bun run test
bun run typecheck
bun run lint
git add src/lib/apiParse.ts src/features/chat src/components/shell src/i18n/messages.ts
git commit -m "feat(friends): 黑名单——API/store/设置面板/资料页拉黑/列表标灰

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 4: OAuth API + 「授权与应用」分区 + 分区注册（spec §6.1 / §6.2 / §3 / §10.4）

**Files:**
- Create: `src/features/oauth/api/oauth.ts`
- Test: `src/features/oauth/api/__tests__/oauth.test.ts`
- Create: `src/components/shell/settings/AppsSection.tsx`
- Test: `src/components/shell/settings/__tests__/AppsSection.test.tsx`
- Modify: `src/lib/routes.ts`（`SETTINGS_SECTIONS` 加 `'apps'`）、`src/components/shell/settings/sections.tsx`（注册）、`src/i18n/messages.ts`（`shell.settings.apps`、`shell.oauth.*`）

**Interfaces:**
- Consumes: `readEnvelope / assertEnvelopeOk / ApiShapeError`、`arrayOf / asRecord / str / bool / arr / describe`（Task 3 的 `arrayOf`）、`resolveSameOriginUrl`（`@/features/miniapps/api/miniapps`，同源校验规则与小程序相同）、`fetchWithAuth`、`SettingsSection / SettingsGroup`、`ListStates`。
- Produces（Task 5 / 6 直接依赖）:
  ```ts
  export interface OAuthClient { client_id: string; client_type: string; app_name: string; app_description: string; app_homepage_url: string | null; app_logo_url: string | null; redirect_uris: string[]; allowed_scopes: string[]; is_active: boolean; created_at: string }
  export interface CreateClientRequest { app_name: string; app_description?: string; app_homepage_url?: string; app_logo_url?: string; redirect_uris: string[]; scopes?: string[] }
  export interface CreateClientResponse { client_id: string; client_secret: string; app_name: string }
  export interface OAuthGrant { id: string; client_id: string; app_name: string; app_logo_url: string | null; scope: string; created_at: string }
  export interface AuthorizeRequest { client_id: string; redirect_uri: string; scope?: string; state?: string; code_challenge?: string; code_challenge_method?: 'S256'; consent?: boolean }
  export type AuthorizeResult = { kind: 'code'; code: string; state: string | null; redirect_uri: string } | { kind: 'consent'; app_name: string; app_logo_url: string | null; scopes: string[] }
  export const OAUTH_SCOPES = ['profile', 'email', 'friends', 'groups'] as const
  export function scopeLabelKey(scope: string): string   // 'shell.oauth.scopes.<scope>'，未知 scope 原样返回 scope 本身（调用方 t() 回显 key 即原文）
  export const oauthApi: { listClients(): Promise<OAuthClient[]>; createClient(req: CreateClientRequest): Promise<CreateClientResponse>; deleteClient(clientId: string): Promise<void>; resetClientSecret(clientId: string): Promise<{ client_secret: string }>; listGrants(): Promise<OAuthGrant[]>; revokeGrant(grantId: string): Promise<void>; authorize(req: AuthorizeRequest): Promise<AuthorizeResult> }
  ```
  - `SETTINGS_SECTIONS = ['appearance', 'notifications', 'account', 'apps', 'ai', 'about'] as const`。

**后端契约（backend-docs `oauth/OAuth授权服务器API.md`，逐字）：** `POST /api/oauth/authorize`（平台会话）body `{ client_id, redirect_uri, scope, state, code_challenge, code_challenge_method: 'S256', consent }` → `data: { code, state, redirect_uri }` 或 `data: { consent_required: true, app_name, app_logo_url, scopes }`；`GET /api/oauth/clients` → `[{ client_id, client_type, app_name, app_description, app_homepage_url, app_logo_url, redirect_uris, allowed_scopes, is_active, created_at }]`；`POST /api/oauth/clients` body `{ app_name, app_description?, app_homepage_url?, app_logo_url?, redirect_uris, scopes? }` → `{ client_id, client_secret, app_name }`（secret 只此一次）；`DELETE /api/oauth/clients/{client_id}`；`POST /api/oauth/clients/{client_id}/reset-secret` → `{ client_secret }`；`GET /api/oauth/grants` → `[{ id, client_id, app_name, app_logo_url, scope, created_at }]`；`DELETE /api/oauth/grants/{grant_id}`（同时撤销该应用所有 token）。scope：profile / email / friends / groups。**不调** token / userinfo / revoke（spec §1）。

- [ ] **Step 1: 写 API 失败用例 `src/features/oauth/api/__tests__/oauth.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiShapeError, setApiShapeErrorReporter } from '@/lib/apiEnvelope'
import { oauthApi, parseAuthorizeResult, parseOAuthClient, parseOAuthGrant, scopeLabelKey } from '../oauth'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const CLIENT = { client_id: 'c1', client_type: 'external', app_name: 'My App', app_description: '', app_homepage_url: null, app_logo_url: 'apps/c1/logo.png', redirect_uris: ['https://example.com/cb'], allowed_scopes: ['profile', 'email'], is_active: true, created_at: '2026-09-01T00:00:00Z' }
const GRANT = { id: 'g1', client_id: 'c1', app_name: 'My App', app_logo_url: null, scope: 'profile email', created_at: '2026-09-01T00:00:00Z' }

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); setApiShapeErrorReporter(() => {}) })
afterEach(() => vi.unstubAllGlobals())

describe('解析器', () => {
  it('parseOAuthClient：空描述允许，logo 相对路径落成同源绝对地址，站外 logo → null', () => {
    const c = parseOAuthClient(CLIENT)
    expect(c).toEqual({ ...CLIENT, app_logo_url: `${location.origin}/apps/c1/logo.png` })
    expect(parseOAuthClient({ ...CLIENT, app_logo_url: 'https://evil.example/x.png' }).app_logo_url).toBeNull()
    expect(parseOAuthClient({ ...CLIENT, app_homepage_url: 'https://example.com' }).app_homepage_url).toBe('https://example.com')
  })
  it('parseOAuthClient：缺 client_id / redirect_uris 不是数组 / is_active 不是布尔 → 抛', () => {
    expect(() => parseOAuthClient({ ...CLIENT, client_id: '' })).toThrow(/client_id/)
    expect(() => parseOAuthClient({ ...CLIENT, redirect_uris: 'x' })).toThrow(/redirect_uris/)
    expect(() => parseOAuthClient({ ...CLIENT, is_active: 'yes' })).toThrow(/is_active/)
  })
  it('parseOAuthGrant：六个字段；缺 id 抛', () => {
    expect(parseOAuthGrant(GRANT)).toEqual(GRANT)
    expect(() => parseOAuthGrant({ ...GRANT, id: undefined })).toThrow(/id/)
  })
  it('parseAuthorizeResult：consent_required → kind consent；否则 kind code（state 可为 null）', () => {
    expect(parseAuthorizeResult({ consent_required: true, app_name: 'X', app_logo_url: null, scopes: ['profile'] })).toEqual({ kind: 'consent', app_name: 'X', app_logo_url: null, scopes: ['profile'] })
    expect(parseAuthorizeResult({ code: 'abc', state: null, redirect_uri: 'https://example.com/cb' })).toEqual({ kind: 'code', code: 'abc', state: null, redirect_uri: 'https://example.com/cb' })
    expect(parseAuthorizeResult({ code: 'abc', state: 's1', redirect_uri: '/apps/x/cb' })).toEqual({ kind: 'code', code: 'abc', state: 's1', redirect_uri: '/apps/x/cb' })
    expect(() => parseAuthorizeResult({ code: 'abc', state: null })).toThrow(/redirect_uri/)
  })
  it('scopeLabelKey：四个已知 scope 映射到 shell.oauth.scopes.*，未知 scope 原样返回', () => {
    expect(scopeLabelKey('profile')).toBe('shell.oauth.scopes.profile')
    expect(scopeLabelKey('groups')).toBe('shell.oauth.scopes.groups')
    expect(scopeLabelKey('wallet')).toBe('wallet')
  })
})

describe('oauthApi 请求形状', () => {
  it('listGrants：GET /api/oauth/grants，data 数组', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [GRANT] }))
    expect(await oauthApi.listGrants()).toEqual([GRANT])
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/grants')
  })
  it('listGrants：行缺字段抛 ApiShapeError', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...GRANT, app_name: undefined }] }))
    await expect(oauthApi.listGrants()).rejects.toBeInstanceOf(ApiShapeError)
  })
  it('revokeGrant：DELETE /api/oauth/grants/{id}（id 编码）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, message: 'ok' }))
    await oauthApi.revokeGrant('g 1')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/grants/g%201')
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })
  it('createClient：POST body 原样（可选字段缺席时不发 undefined 键）', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { client_id: 'c2', client_secret: 'sec', app_name: 'New' } }))
    const res = await oauthApi.createClient({ app_name: 'New', redirect_uris: ['https://a.b/cb'], scopes: ['profile'] })
    expect(res).toEqual({ client_id: 'c2', client_secret: 'sec', app_name: 'New' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/clients')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ app_name: 'New', redirect_uris: ['https://a.b/cb'], scopes: ['profile'] })
  })
  it('resetClientSecret：POST /api/oauth/clients/{id}/reset-secret → { client_secret }', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { client_secret: 'new' } }))
    expect(await oauthApi.resetClientSecret('c1')).toEqual({ client_secret: 'new' })
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/clients/c1/reset-secret')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })
  it('deleteClient：DELETE /api/oauth/clients/{id}', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, message: 'ok' }))
    await oauthApi.deleteClient('c1')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/oauth/clients/c1')
  })
  it('authorize：POST /api/oauth/authorize；consent:true 只在传了时出现；HTTP 400 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { consent_required: true, app_name: 'X', app_logo_url: null, scopes: ['profile'] } }))
    const first = await oauthApi.authorize({ client_id: 'c1', redirect_uri: 'https://example.com/cb', scope: 'profile', state: 's' })
    expect(first.kind).toBe('consent')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ client_id: 'c1', redirect_uri: 'https://example.com/cb', scope: 'profile', state: 's' })
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: { code: 'abc', state: 's', redirect_uri: 'https://example.com/cb' } }))
    const second = await oauthApi.authorize({ client_id: 'c1', redirect_uri: 'https://example.com/cb', scope: 'profile', state: 's', consent: true })
    expect(second).toEqual({ kind: 'code', code: 'abc', state: 's', redirect_uri: 'https://example.com/cb' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).consent).toBe(true)
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 400, error: 'redirect_uri 未注册' }, 400))
    await expect(oauthApi.authorize({ client_id: 'c1', redirect_uri: 'https://x.y/cb' })).rejects.toThrow(/redirect_uri 未注册/)
  })
})
```

- [ ] **Step 2: 跑用例确认失败**

Run: `bun run test -- src/features/oauth/api/__tests__/oauth.test.ts`
Expected: FAIL（找不到 `../oauth`）。

- [ ] **Step 3: 写 `src/features/oauth/api/oauth.ts`**

```ts
import { fetchWithAuth } from '@/api/authedFetch'
import { resolveSameOriginUrl } from '@/features/miniapps/api/miniapps'
import { assertEnvelopeOk, readEnvelope } from '@/lib/apiEnvelope'
import { arr, arrayOf, asRecord, bool, str } from '@/lib/apiParse'

/** backend-docs oauth/OAuth授权服务器API.md（本期只调下面七个端点；token / userinfo / revoke 是第三方与后端之间的接口） */

export interface OAuthClient { client_id: string; client_type: string; app_name: string; app_description: string; app_homepage_url: string | null; app_logo_url: string | null; redirect_uris: string[]; allowed_scopes: string[]; is_active: boolean; created_at: string }
export interface CreateClientRequest { app_name: string; app_description?: string; app_homepage_url?: string; app_logo_url?: string; redirect_uris: string[]; scopes?: string[] }
export interface CreateClientResponse { client_id: string; client_secret: string; app_name: string }
export interface OAuthGrant { id: string; client_id: string; app_name: string; app_logo_url: string | null; scope: string; created_at: string }
export interface AuthorizeRequest { client_id: string; redirect_uri: string; scope?: string; state?: string; code_challenge?: string; code_challenge_method?: 'S256'; consent?: boolean }
export type AuthorizeResult =
  | { kind: 'code'; code: string; state: string | null; redirect_uri: string }
  | { kind: 'consent'; app_name: string; app_logo_url: string | null; scopes: string[] }

export const OAUTH_SCOPES = ['profile', 'email', 'friends', 'groups'] as const

/** 已知 scope → i18n key；未知的原样返回（t() 对不存在的 key 回显 key，屏幕上就是 scope 原文） */
export function scopeLabelKey(scope: string): string {
  return (OAUTH_SCOPES as readonly string[]).includes(scope) ? `shell.oauth.scopes.${scope}` : scope
}

/** 可为空串或 null 的字符串字段：不用 str()（它拒绝空串） */
const looseStr = (r: Record<string, unknown>, key: string): string => (typeof r[key] === 'string' ? (r[key] as string) : '')
const nullableUrl = (r: Record<string, unknown>, key: string): string | null => (typeof r[key] === 'string' && r[key] !== '' ? (r[key] as string) : null)
const stringArray = (r: Record<string, unknown>, key: string, prefix: string): string[] => arr(r, key, prefix).filter((x): x is string => typeof x === 'string')

export function parseOAuthClient(input: unknown): OAuthClient {
  const r = asRecord(input, 'GET /api/oauth/clients 的一项')
  const logo = nullableUrl(r, 'app_logo_url')
  return {
    client_id: str(r, 'client_id'),
    client_type: str(r, 'client_type'),
    app_name: str(r, 'app_name'),
    app_description: looseStr(r, 'app_description'),
    app_homepage_url: nullableUrl(r, 'app_homepage_url'),
    // 与小程序 icon_url 同规则：只认同源 http(s)，站外 → null 不渲染（spec §6.1）
    app_logo_url: logo ? resolveSameOriginUrl(logo) : null,
    redirect_uris: stringArray(r, 'redirect_uris', ''),
    allowed_scopes: stringArray(r, 'allowed_scopes', ''),
    is_active: bool(r, 'is_active'),
    created_at: str(r, 'created_at'),
  }
}

export function parseOAuthGrant(input: unknown): OAuthGrant {
  const r = asRecord(input, 'GET /api/oauth/grants 的一项')
  const logo = nullableUrl(r, 'app_logo_url')
  return {
    id: str(r, 'id'),
    client_id: str(r, 'client_id'),
    app_name: str(r, 'app_name'),
    app_logo_url: logo ? resolveSameOriginUrl(logo) : null,
    scope: looseStr(r, 'scope'),
    created_at: str(r, 'created_at'),
  }
}

function parseCreateClientResponse(input: unknown): CreateClientResponse {
  const r = asRecord(input, 'POST /api/oauth/clients 的 data')
  return { client_id: str(r, 'client_id'), client_secret: str(r, 'client_secret'), app_name: str(r, 'app_name') }
}

export function parseAuthorizeResult(input: unknown): AuthorizeResult {
  const r = asRecord(input, 'POST /api/oauth/authorize 的 data')
  if (r.consent_required === true) {
    const logo = nullableUrl(r, 'app_logo_url')
    return { kind: 'consent', app_name: str(r, 'app_name'), app_logo_url: logo ? resolveSameOriginUrl(logo) : null, scopes: stringArray(r, 'scopes', '') }
  }
  return { kind: 'code', code: str(r, 'code'), state: typeof r.state === 'string' ? r.state : null, redirect_uri: str(r, 'redirect_uri') }
}

const parser = <T>(parse: (input: unknown) => T) => ({ parse })

export const oauthApi = {
  listClients: async (): Promise<OAuthClient[]> => {
    const response = await fetchWithAuth('/api/oauth/clients')
    return readEnvelope<OAuthClient[]>(response, { endpoint: 'GET /api/oauth/clients', fallbackMessage: '加载 OAuth 客户端失败', parse: arrayOf(parseOAuthClient) })
  },
  createClient: async (req: CreateClientRequest): Promise<CreateClientResponse> => {
    const response = await fetchWithAuth('/api/oauth/clients', { method: 'POST', body: JSON.stringify(req) })
    return readEnvelope<CreateClientResponse>(response, { endpoint: 'POST /api/oauth/clients', fallbackMessage: '创建客户端失败', parse: parser(parseCreateClientResponse) })
  },
  deleteClient: async (clientId: string): Promise<void> => {
    const response = await fetchWithAuth(`/api/oauth/clients/${encodeURIComponent(clientId)}`, { method: 'DELETE' })
    await assertEnvelopeOk(response, { endpoint: 'DELETE /api/oauth/clients/{client_id}', fallbackMessage: '删除客户端失败' })
  },
  resetClientSecret: async (clientId: string): Promise<{ client_secret: string }> => {
    const response = await fetchWithAuth(`/api/oauth/clients/${encodeURIComponent(clientId)}/reset-secret`, { method: 'POST', body: '{}' })
    return readEnvelope<{ client_secret: string }>(response, {
      endpoint: 'POST /api/oauth/clients/{client_id}/reset-secret',
      fallbackMessage: '重置密钥失败',
      parse: parser((input) => ({ client_secret: str(asRecord(input, 'reset-secret 的 data'), 'client_secret') })),
    })
  },
  listGrants: async (): Promise<OAuthGrant[]> => {
    const response = await fetchWithAuth('/api/oauth/grants')
    return readEnvelope<OAuthGrant[]>(response, { endpoint: 'GET /api/oauth/grants', fallbackMessage: '加载已授权应用失败', parse: arrayOf(parseOAuthGrant) })
  },
  revokeGrant: async (grantId: string): Promise<void> => {
    const response = await fetchWithAuth(`/api/oauth/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' })
    await assertEnvelopeOk(response, { endpoint: 'DELETE /api/oauth/grants/{grant_id}', fallbackMessage: '取消授权失败' })
  },
  authorize: async (req: AuthorizeRequest): Promise<AuthorizeResult> => {
    const response = await fetchWithAuth('/api/oauth/authorize', { method: 'POST', body: JSON.stringify(req) })
    return readEnvelope<AuthorizeResult>(response, { endpoint: 'POST /api/oauth/authorize', fallbackMessage: '授权请求失败', parse: parser(parseAuthorizeResult) })
  },
}
```
`fetchWithAuth` 是否自动加 `Content-Type: application/json`：看 `src/api/authedFetch.ts`；`friends.ts` 的 POST 只传 `body: JSON.stringify(...)` 没传 headers，照抄即可。`JSON.stringify` 会丢掉值为 `undefined` 的键，所以 `createClient` / `authorize` 不必手工过滤。

- [ ] **Step 4: 跑 API 用例确认通过**

Run: `bun run test -- src/features/oauth/api/__tests__/oauth.test.ts`
Expected: PASS（12 条）。

- [ ] **Step 5: 分区注册 + i18n**

`src/lib/routes.ts`：`export const SETTINGS_SECTIONS = ['appearance', 'notifications', 'account', 'apps', 'ai', 'about'] as const`。`src/lib/__tests__/routes.test.ts` 第 18 行的字面量同步改成 `['appearance', 'notifications', 'account', 'apps', 'ai', 'about']`，并加一句 `expect(isSettingsSection('apps')).toBe(true)`。
`src/components/shell/settings/sections.tsx`：import `AppWindow` from lucide、`AppsSection`；`SETTINGS_SECTION_META` 在 `account` 之后插 `{ key: 'apps', labelKey: 'shell.settings.apps', icon: AppWindow }`；`SECTION_COMPONENTS` 加 `apps: AppsSection`。`src/components/shell/settings/__tests__/sections.test.tsx`：describe 文案「五个分区」改「六个分区」，`expect(screen.getAllByRole('link')).toHaveLength(5)` 改 `6`，并加 `expect(screen.getByRole('link', { name: '授权与应用' })).toHaveAttribute('href', '/app/settings/apps')`。
`src/i18n/messages.ts`：`shell.settings.apps`：zh `'授权与应用'` / en `'Apps & access'`。新增 `shell.oauth`（与 `shell.settings` 平级，zh）：
```ts
    oauth: {
      scopes: { profile: '基本资料', email: '邮箱', friends: '好友数', groups: '群数' },
      grantsTitle: '已授权应用', grantsHint: '以下应用已获得访问你账户数据的权限，可随时取消授权。', grantsEmpty: '还没有授权任何应用',
      revoke: '取消授权', confirm: '确认', cancel: '取消', revokeFailed: '取消授权失败',
      grantedJustNow: '刚刚授权', grantedHoursAgo: '{n} 小时前授权', grantedDaysAgo: '{n} 天前授权',
    },
```
en：
```ts
    oauth: {
      scopes: { profile: 'Profile', email: 'Email', friends: 'Friend count', groups: 'Group count' },
      grantsTitle: 'Authorized apps', grantsHint: 'These apps can access your account data. You can revoke access at any time.', grantsEmpty: 'No authorized apps yet',
      revoke: 'Revoke', confirm: 'Confirm', cancel: 'Cancel', revokeFailed: 'Failed to revoke',
      grantedJustNow: 'Authorized just now', grantedHoursAgo: 'Authorized {n} hours ago', grantedDaysAgo: 'Authorized {n} days ago',
    },
```
（Task 5 / 6 会往 `shell.oauth` 里继续追加 `clients.*` / `authorize.*`。）

- [ ] **Step 6: 写分区失败用例 `src/components/shell/settings/__tests__/AppsSection.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '@/features/oauth/api/oauth'
import { AppsSection } from '../AppsSection'

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
const GRANT = { id: 'g1', client_id: 'c1', app_name: 'My App', app_logo_url: null, scope: 'profile email wallet', created_at: twoDaysAgo }

beforeEach(() => { vi.spyOn(oauthApi, 'listGrants').mockResolvedValue([GRANT]); vi.spyOn(oauthApi, 'revokeGrant').mockResolvedValue(undefined) })
afterEach(() => vi.restoreAllMocks())

describe('AppsSection（已授权应用）', () => {
  it('挂载拉列表：应用名、首字 logo、scope 标签（未知 scope 原样）、相对时间', async () => {
    render(<AppsSection />)
    expect(await screen.findByText('My App')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
    expect(screen.getByText('基本资料、邮箱、wallet')).toBeInTheDocument()
    expect(screen.getByText('2 天前授权')).toBeInTheDocument()
  })
  it('两步取消授权：第一次点不调 API，确认才调，成功后本地移除并显示空态', async () => {
    render(<AppsSection />)
    await screen.findByText('My App')
    fireEvent.click(screen.getByRole('button', { name: '取消授权' }))
    expect(oauthApi.revokeGrant).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(oauthApi.revokeGrant).toHaveBeenCalledWith('g1'))
    expect(await screen.findByText('还没有授权任何应用')).toBeInTheDocument()
    expect(oauthApi.listGrants).toHaveBeenCalledTimes(1)
  })
  it('取消授权失败：错误行，卡片还在', async () => {
    vi.spyOn(oauthApi, 'revokeGrant').mockRejectedValue(new Error('boom'))
    render(<AppsSection />)
    await screen.findByText('My App')
    fireEvent.click(screen.getByRole('button', { name: '取消授权' }))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('取消授权失败')
    expect(screen.getByText('My App')).toBeInTheDocument()
  })
  it('加载失败可重试', async () => {
    vi.spyOn(oauthApi, 'listGrants').mockRejectedValueOnce(new Error('网络断了')).mockResolvedValueOnce([GRANT])
    render(<AppsSection />)
    expect(await screen.findByRole('alert')).toHaveTextContent('网络断了')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('My App')).toBeInTheDocument()
  })
  it('同源 logo 渲染 <img>，站外 logo 已在解析器变 null → 首字', async () => {
    vi.spyOn(oauthApi, 'listGrants').mockResolvedValue([{ ...GRANT, app_logo_url: `${location.origin}/apps/c1/logo.png` }])
    render(<AppsSection />)
    await screen.findByText('My App')
    expect(document.querySelector('img')?.getAttribute('src')).toBe(`${location.origin}/apps/c1/logo.png`)
  })
})
```

- [ ] **Step 7: 跑用例确认失败**

Run: `bun run test -- src/components/shell/settings/__tests__/AppsSection.test.tsx`
Expected: FAIL（找不到 `../AppsSection`）。

- [ ] **Step 8: 写 `src/components/shell/settings/AppsSection.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { type OAuthGrant, oauthApi, scopeLabelKey } from '@/features/oauth/api/oauth'
import { useI18n } from '@/i18n/I18nProvider'
import { SettingsSection } from './SettingsSection'

/** 「x 天前授权」：<1h 刚刚，<24h 小时，其余天 */
export function grantedAgoKey(createdAt: string, now = Date.now()): { key: string; n: number } {
  const diff = Math.max(0, now - new Date(createdAt).getTime())
  if (diff < 3_600_000) return { key: 'shell.oauth.grantedJustNow', n: 0 }
  if (diff < 86_400_000) return { key: 'shell.oauth.grantedHoursAgo', n: Math.floor(diff / 3_600_000) }
  return { key: 'shell.oauth.grantedDaysAgo', n: Math.floor(diff / 86_400_000) }
}

function GrantCard({ grant, onRevoke, revoking }: { grant: OAuthGrant; onRevoke: () => Promise<void>; revoking: boolean }) {
  const { t } = useI18n()
  const [confirm, setConfirm] = useState(false)
  const ago = grantedAgoKey(grant.created_at)
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[var(--bg-tertiary)] text-[14px] font-semibold text-muted-foreground">
        {grant.app_logo_url ? <img src={grant.app_logo_url} alt="" className="h-full w-full object-cover" /> : grant.app_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-foreground">{grant.app_name}</div>
        <div className="truncate text-[12px] text-muted-foreground">{grant.scope.split(/\s+/).filter(Boolean).map((s) => t(scopeLabelKey(s))).join('、')}</div>
        <div className="text-[11px] text-app-light">{t(ago.key, { n: ago.n })}</div>
      </div>
      {confirm ? (
        <span className="flex gap-1">
          <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={revoking} onClick={() => { setConfirm(false); void onRevoke() }}>{t('shell.oauth.confirm')}</button>
          <button type="button" className="subtle-btn" disabled={revoking} onClick={() => setConfirm(false)}>{t('shell.oauth.cancel')}</button>
        </span>
      ) : (
        <button type="button" className="subtle-btn" disabled={revoking} onClick={() => setConfirm(true)}>{t('shell.oauth.revoke')}</button>
      )}
    </li>
  )
}

/** /app/settings/apps：已授权的第三方应用（spec §6.2）。组件内存态，按需拉取（spec §9）。 */
export function AppsSection() {
  const { t } = useI18n()
  const [grants, setGrants] = useState<OAuthGrant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setGrants(null)
    oauthApi.listGrants().then(setGrants).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  const revoke = async (id: string) => {
    setRevoking(id)
    setRevokeError(null)
    try {
      await oauthApi.revokeGrant(id)
      setGrants((prev) => prev?.filter((g) => g.id !== id) ?? prev)
    } catch (e: unknown) {
      setRevokeError(e instanceof Error ? e.message : String(e))
    } finally {
      setRevoking(null)
    }
  }
  return (
    <SettingsSection title={t('shell.oauth.grantsTitle')} description={t('shell.oauth.grantsHint')}>
      {error ? <ListError error={error} onRetry={load} /> : grants === null ? <ListLoading /> : grants.length === 0 ? <ListEmpty message={t('shell.oauth.grantsEmpty')} /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {grants.map((g) => <GrantCard key={g.id} grant={g} revoking={revoking === g.id} onRevoke={() => revoke(g.id)} />)}
        </ul>
      )}
      {revokeError && <p className="px-3 pb-3 text-[13px] text-destructive" role="alert">{t('shell.oauth.revokeFailed')}: {revokeError}</p>}
    </SettingsSection>
  )
}
```

- [ ] **Step 9: 跑用例确认通过；全量**

Run: `bun run test -- src/components/shell/settings/__tests__/AppsSection.test.tsx`
Expected: PASS（5 条）。
Run: `bun run test`
Expected: 全绿。若某个既有用例把分区数量或顺序写成字面量（搜 `'about'` / `SETTINGS_SECTIONS` 在 `src/**/__tests__`），把 `apps` 补进去（位置在 `account` 之后、`ai` 之前）。

- [ ] **Step 10: 变异校验**

| 变异 | 必红 |
|---|---|
| `parseOAuthGrant` 的 `app_logo_url` 不过 `resolveSameOriginUrl` | 解析器用例 1（client 同款断言）——给 grant 也补一条站外 logo → null 的断言 |
| `GrantCard` 第一次点击直接 `onRevoke` | 分区用例 2 |
| `revoke` 成功后不过滤本地列表而是重拉 | 分区用例 2 的 `listGrants` 调用次数 |
| `scopeLabelKey` 未知 scope 返回 `''` | 解析器用例 5 + 分区用例 1 |

- [ ] **Step 11: 门槛与提交**

```bash
bun run typecheck
bun run lint
git add src/features/oauth src/components/shell/settings src/lib/routes.ts src/i18n/messages.ts
git commit -m "feat(oauth): OAuth API 严格解析 + 设置「授权与应用」分区（已授权应用列表/取消授权）

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: 「OAuth 客户端」面板——小程序模态框第二个 tab（spec §6.3 / §10.5 / §11）

**Files:**
- Create: `src/features/oauth/components/SecretDisplay.tsx`
- Create: `src/features/oauth/components/OAuthClientsPanel.tsx`
- Create: `src/features/oauth/lib/redirectUri.ts`（`isValidRedirectUri`，Task 6 的授权页也用同一条规则）
- Test: `src/features/oauth/components/__tests__/OAuthClientsPanel.test.tsx`、`src/features/oauth/lib/__tests__/redirectUri.test.ts`、`src/app/routes/shell/__tests__/miniapps.test.tsx`
- Modify: `src/app/routes/shell/miniapps.tsx`（顶部分段「我的小程序 / OAuth 客户端」）、`src/i18n/messages.ts`（`shell.modals.miniappsTab / oauthClientsTab`、`shell.oauth.clients.*`）

**Interfaces:**
- Consumes（Task 4）: `oauthApi.listClients / createClient / deleteClient / resetClientSecret`、`OAuthClient / CreateClientRequest / CreateClientResponse`、`OAUTH_SCOPES / scopeLabelKey`；`useToast`（`@/hooks/use-toast`，`toast({ title, description?, variant? })`）；`Dialog / DialogContent / DialogHeader / DialogTitle / DialogFooter`（`@/components/ui/dialog`）、`Button`、`Input`、`Checkbox`（`@/components/ui/checkbox`）。
- Produces:
  - `isValidRedirectUri(raw: string): boolean`——绝对 `http(s)://` 或以 `/` 开头（不含 `//` 开头），其它一律 false。
  - `SecretDisplay({ open, title, fields: Array<{ label: string; value: string }>, onClose })`：**只有**「我已保存」按钮关闭；`Dialog` 的遮罩点击 / Esc 不关（`onOpenChange` 忽略 false）。
  - `OAuthClientsPanel()`（无 props）。

- [ ] **Step 1: `redirectUri` 规则的失败用例 `src/features/oauth/lib/__tests__/redirectUri.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { isValidRedirectUri } from '../redirectUri'

describe('isValidRedirectUri（spec §6.3 / §6.4 同一条规则）', () => {
  it.each(['https://example.com/cb', 'http://localhost:3000/cb', '/apps/my-app/oauth/callback', '/cb?x=1'])('放行：%s', (uri) => {
    expect(isValidRedirectUri(uri)).toBe(true)
  })
  it.each(['', '   ', 'javascript:alert(1)', 'example.com/cb', '//evil.example/cb', 'ftp://x/y', 'data:text/html,x'])('拒绝：%s', (uri) => {
    expect(isValidRedirectUri(uri)).toBe(false)
  })
})
```
实现 `src/features/oauth/lib/redirectUri.ts`：
```ts
/** 回调地址白名单形状：绝对 http(s)，或站内绝对路径（`/` 开头且不是 `//` 协议相对地址）。 */
export function isValidRedirectUri(raw: string): boolean {
  const value = raw.trim()
  if (value === '') return false
  if (value.startsWith('/')) return !value.startsWith('//')
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
```
Run: `bun run test -- src/features/oauth/lib/__tests__/redirectUri.test.ts` → 先 FAIL 再 PASS（11 条）。

- [ ] **Step 2: i18n（zh / en）**

`shell.modals` 追加：zh `miniappsTab: '我的小程序', oauthClientsTab: 'OAuth 客户端'`；en `miniappsTab: 'My mini apps', oauthClientsTab: 'OAuth clients'`。
`shell.oauth` 追加 `clients` 对象，zh：
```ts
      clients: {
        empty: '还没有 OAuth 客户端', emptyHint: '点击「新建客户端」注册一个外部应用', create: '新建客户端', refresh: '刷新',
        typeInternal: '内部', typeExternal: '外部', inactive: '已停用', clientId: 'Client ID', copy: '复制', copied: '已复制', copyFailed: '复制失败',
        scopes: '权限', redirectUris: '回调地址', resetSecret: '重置密钥', del: '删除', confirmDelete: '确认删除', cancel: '取消',
        formTitle: '创建 OAuth 客户端', appName: '应用名称', appNamePlaceholder: 'My App', appDescription: '应用描述', appHomepage: '主页 URL',
        redirectUri: '回调地址', addRedirectUri: '添加回调地址', removeRedirectUri: '删除这条', redirectUriInvalid: '回调地址必须是 http(s) 绝对地址或以 / 开头的站内路径',
        scopesLabel: '权限范围', submit: '创建', submitting: '创建中…', createFailed: '创建客户端失败', opFailed: '操作失败',
        secretTitle: '{name} · 客户端凭据', secretWarning: '客户端密钥只显示这一次，请立即保存', clientSecret: 'Client Secret', saved: '我已保存',
      },
```
en：
```ts
      clients: {
        empty: 'No OAuth clients yet', emptyHint: 'Click “New client” to register an external app', create: 'New client', refresh: 'Refresh',
        typeInternal: 'Internal', typeExternal: 'External', inactive: 'Inactive', clientId: 'Client ID', copy: 'Copy', copied: 'Copied', copyFailed: 'Copy failed',
        scopes: 'Scopes', redirectUris: 'Redirect URIs', resetSecret: 'Reset secret', del: 'Delete', confirmDelete: 'Confirm delete', cancel: 'Cancel',
        formTitle: 'Create OAuth client', appName: 'App name', appNamePlaceholder: 'My App', appDescription: 'Description', appHomepage: 'Homepage URL',
        redirectUri: 'Redirect URI', addRedirectUri: 'Add redirect URI', removeRedirectUri: 'Remove', redirectUriInvalid: 'Redirect URIs must be absolute http(s) URLs or site paths starting with /',
        scopesLabel: 'Scopes', submit: 'Create', submitting: 'Creating…', createFailed: 'Failed to create client', opFailed: 'Action failed',
        secretTitle: '{name} · client credentials', secretWarning: 'The client secret is shown only once. Save it now.', clientSecret: 'Client Secret', saved: 'I have saved it',
      },
```

- [ ] **Step 3: 写面板失败用例 `src/features/oauth/components/__tests__/OAuthClientsPanel.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '../../api/oauth'
import { OAuthClientsPanel } from '../OAuthClientsPanel'

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }), toast: toastMock }))
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const EXTERNAL = { client_id: 'c-ext', client_type: 'external', app_name: 'Ext App', app_description: '第三方', app_homepage_url: null, app_logo_url: null, redirect_uris: ['https://example.com/cb'], allowed_scopes: ['profile', 'email'], is_active: true, created_at: '2026-09-01T00:00:00Z' }
const INTERNAL = { ...EXTERNAL, client_id: 'c-int', client_type: 'internal', app_name: 'Mini App', is_active: false }

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  toastMock.mockClear()
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.spyOn(oauthApi, 'listClients').mockResolvedValue([EXTERNAL, INTERNAL])
  vi.spyOn(oauthApi, 'deleteClient').mockResolvedValue(undefined)
  vi.spyOn(oauthApi, 'resetClientSecret').mockResolvedValue({ client_secret: 'new-secret' })
  vi.spyOn(oauthApi, 'createClient').mockResolvedValue({ client_id: 'c-new', client_secret: 'first-secret', app_name: 'New App' })
})
afterEach(() => vi.restoreAllMocks())

describe('OAuthClientsPanel', () => {
  it('列表：应用名、类型标签、已停用、client_id、权限与回调；只有 external 有「重置密钥」「删除」', async () => {
    render(<OAuthClientsPanel />)
    expect(await screen.findByText('Ext App')).toBeInTheDocument()
    expect(screen.getByText('外部')).toBeInTheDocument()
    expect(screen.getByText('内部')).toBeInTheDocument()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getByText('c-ext')).toBeInTheDocument()
    expect(screen.getByText(/基本资料、邮箱/)).toBeInTheDocument()
    expect(screen.getByText(/https:\/\/example\.com\/cb/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '重置密钥' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(1)
  })
  it('复制 client_id：写剪贴板并 toast「已复制」；失败 toast 失败', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0])
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('c-ext'))
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '已复制' }))
    writeText.mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[0])
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '复制失败', variant: 'destructive' })))
  })
  it('删除两步确认：第一次不调；确认后调 deleteClient 并本地移除', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(oauthApi.deleteClient).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(oauthApi.deleteClient).toHaveBeenCalledWith('c-ext'))
    await waitFor(() => expect(screen.queryByText('Ext App')).toBeNull())
    expect(screen.getByText('Mini App')).toBeInTheDocument()
  })
  it('重置密钥两步确认 → SecretDisplay 显示新密钥；遮罩/Esc 不关，只有「我已保存」关', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '重置密钥' }))
    expect(oauthApi.resetClientSecret).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(oauthApi.resetClientSecret).toHaveBeenCalledWith('c-ext'))
    const dialog = await screen.findByRole('dialog', { name: /客户端凭据/ })
    expect(dialog).toHaveTextContent('new-secret')
    expect(dialog).toHaveTextContent('只显示这一次')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: /客户端凭据/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '我已保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /客户端凭据/ })).toBeNull())
  })
  it('新建：名称必填、至少一条合法回调；坏回调显示校验文案且不提交；成功后进 SecretDisplay 并刷新列表', async () => {
    render(<OAuthClientsPanel />)
    await screen.findByText('Ext App')
    fireEvent.click(screen.getByRole('button', { name: '新建客户端' }))
    const form = screen.getByRole('dialog', { name: '创建 OAuth 客户端' })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('应用名称'), { target: { value: 'New App' } })
    fireEvent.change(screen.getAllByLabelText('回调地址')[0], { target: { value: 'example.com/cb' } })
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
    expect(form).toHaveTextContent('回调地址必须是 http(s) 绝对地址或以 / 开头的站内路径')
    fireEvent.change(screen.getAllByLabelText('回调地址')[0], { target: { value: 'https://new.example/cb' } })
    fireEvent.click(screen.getByRole('button', { name: '添加回调地址' }))
    fireEvent.change(screen.getAllByLabelText('回调地址')[1], { target: { value: '/apps/x/cb' } })
    fireEvent.click(screen.getByLabelText('邮箱'))
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(oauthApi.createClient).toHaveBeenCalledWith({ app_name: 'New App', redirect_uris: ['https://new.example/cb', '/apps/x/cb'], scopes: ['profile', 'email'] }))
    const secret = await screen.findByRole('dialog', { name: /New App/ })
    expect(secret).toHaveTextContent('first-secret')
    expect(secret).toHaveTextContent('c-new')
    expect(oauthApi.listClients).toHaveBeenCalledTimes(2)
  })
  it('空列表：空态 + 提示；加载失败可重试', async () => {
    vi.spyOn(oauthApi, 'listClients').mockResolvedValueOnce([])
    render(<OAuthClientsPanel />)
    expect(await screen.findByText('还没有 OAuth 客户端')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: 跑用例确认失败**

Run: `bun run test -- src/features/oauth/components/__tests__/OAuthClientsPanel.test.tsx`
Expected: FAIL（找不到 `../OAuthClientsPanel`）。

- [ ] **Step 5: 写 `src/features/oauth/components/SecretDisplay.tsx`**

```tsx
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'

export async function copyText(text: string, toast: ReturnType<typeof useToast>['toast'], t: (key: string) => string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast({ title: t('shell.oauth.clients.copied') })
  } catch {
    toast({ title: t('shell.oauth.clients.copyFailed'), variant: 'destructive' })
  }
}

/**
 * 只显示一次的凭据（spec §6.3）：遮罩点击与 Esc 都不关，只有「我已保存」关——
 * client_secret 关掉就再也拿不到了，误触不能成为丢失它的理由。
 */
export function SecretDisplay({ open, title, fields, onClose }: { open: boolean; title: string; fields: Array<{ label: string; value: string }>; onClose: () => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  return (
    <Dialog open={open} onOpenChange={() => { /* 只认「我已保存」 */ }}>
      <DialogContent className="glass-card rounded-3xl border-[var(--glass-border)]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-app-warning">{t('shell.oauth.clients.secretWarning')}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-3">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
              <dd className="flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-sm bg-[var(--bg-tertiary)] px-2 py-1 font-mono text-[12px] text-foreground">{f.value}</code>
                <button type="button" className="subtle-btn" aria-label={`${t('shell.oauth.clients.copy')} ${f.label}`} onClick={() => void copyText(f.value, toast, t)}><Copy className="h-4 w-4" />{t('shell.oauth.clients.copy')}</button>
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter><Button onClick={onClose}>{t('shell.oauth.clients.saved')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
`DialogContent` 是否有 `showCloseButton` prop：看 `src/components/ui/dialog.tsx:48` 的 props；没有的话去掉该属性，改为在 `DialogContent` 里用 `onEscapeKeyDown={(e) => e.preventDefault()}` `onPointerDownOutside={(e) => e.preventDefault()}`（Radix 支持），并且右上角关闭按钮若存在则给 `Dialog` 的 `onOpenChange` 忽略即可（上面已经忽略）。

- [ ] **Step 6: 写 `src/features/oauth/components/OAuthClientsPanel.tsx`**

```tsx
import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'
import { type CreateClientRequest, type CreateClientResponse, OAUTH_SCOPES, type OAuthClient, oauthApi, scopeLabelKey } from '../api/oauth'
import { isValidRedirectUri } from '../lib/redirectUri'
import { SecretDisplay, copyText } from './SecretDisplay'

const NS = 'shell.oauth.clients'

function CreateClientDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (res: CreateClientResponse) => void }) {
  const { t } = useI18n()
  const [appName, setAppName] = useState('')
  const [description, setDescription] = useState('')
  const [homepage, setHomepage] = useState('')
  const [uris, setUris] = useState([''])
  const [scopes, setScopes] = useState<string[]>(['profile'])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const filled = uris.map((u) => u.trim()).filter((u) => u !== '')
  const invalid = filled.some((u) => !isValidRedirectUri(u))
  const canSubmit = appName.trim() !== '' && filled.length > 0 && !invalid && !submitting
  const submit = async () => {
    const req: CreateClientRequest = { app_name: appName.trim(), redirect_uris: filled }
    if (description.trim()) req.app_description = description.trim()
    if (homepage.trim()) req.app_homepage_url = homepage.trim()
    if (scopes.length > 0) req.scopes = OAUTH_SCOPES.filter((s) => scopes.includes(s))
    setSubmitting(true)
    setError(null)
    try {
      onCreated(await oauthApi.createClient(req))
      setAppName(''); setDescription(''); setHomepage(''); setUris(['']); setScopes(['profile'])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose() }}>
      <DialogContent className="glass-card max-h-[85vh] overflow-y-auto rounded-3xl border-[var(--glass-border)]">
        <DialogHeader><DialogTitle>{t(`${NS}.formTitle`)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-[13px]"><span className="mb-1 block text-muted-foreground">{t(`${NS}.appName`)}</span><Input aria-label={t(`${NS}.appName`)} value={appName} maxLength={100} placeholder={t(`${NS}.appNamePlaceholder`)} onChange={(e) => setAppName(e.target.value)} /></label>
          <label className="block text-[13px]"><span className="mb-1 block text-muted-foreground">{t(`${NS}.appDescription`)}</span><Input aria-label={t(`${NS}.appDescription`)} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label className="block text-[13px]"><span className="mb-1 block text-muted-foreground">{t(`${NS}.appHomepage`)}</span><Input aria-label={t(`${NS}.appHomepage`)} value={homepage} placeholder="https://example.com" onChange={(e) => setHomepage(e.target.value)} /></label>
          <div className="text-[13px]">
            <span className="mb-1 block text-muted-foreground">{t(`${NS}.redirectUris`)}</span>
            {uris.map((uri, i) => (
              <div key={`uri-${i}`} className="mb-1 flex gap-1">
                <Input aria-label={t(`${NS}.redirectUri`)} value={uri} placeholder="https://example.com/callback" onChange={(e) => setUris(uris.map((u, j) => (j === i ? e.target.value : u)))} />
                {uris.length > 1 && <Button variant="outline" size="sm" aria-label={t(`${NS}.removeRedirectUri`)} onClick={() => setUris(uris.filter((_, j) => j !== i))}>×</Button>}
              </div>
            ))}
            {invalid && <p className="text-[12px] text-destructive">{t(`${NS}.redirectUriInvalid`)}</p>}
            <Button variant="outline" size="sm" onClick={() => setUris([...uris, ''])}>{t(`${NS}.addRedirectUri`)}</Button>
          </div>
          <div className="text-[13px]">
            <span className="mb-1 block text-muted-foreground">{t(`${NS}.scopesLabel`)}</span>
            <div className="flex flex-wrap gap-3">
              {OAUTH_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1"><Checkbox aria-label={t(scopeLabelKey(s))} checked={scopes.includes(s)} onCheckedChange={(v) => setScopes(v ? [...scopes, s] : scopes.filter((x) => x !== s))} />{t(scopeLabelKey(s))}</label>
              ))}
            </div>
          </div>
          {error && <p className="text-[13px] text-destructive" role="alert">{t(`${NS}.createFailed`)}: {error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t(`${NS}.cancel`)}</Button>
          <Button onClick={submit} disabled={!canSubmit}>{submitting ? t(`${NS}.submitting`) : t(`${NS}.submit`)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```
⚠️ `key={\`uri-${i}\`}` 用下标做 key 会被 biome 的 `noArrayIndexKey` 报 warning（基线不能升）：实现时把 `uris` 改成 `Array<{ id: string; value: string }>`，`addUri` 用 `crypto.randomUUID()` 生 id，`key={row.id}`；`filled` / `invalid` 相应取 `.value`。禁止用任何 lint 抑制注释。

```tsx
function ClientCard({ client, onDelete, onResetSecret, busy }: { client: OAuthClient; onDelete: () => Promise<void>; onResetSecret: () => Promise<void>; busy: boolean }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const external = client.client_type === 'external'
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <span className="truncate text-[14px] font-semibold text-foreground">{client.app_name}</span>
        <span className="rounded-sm bg-[var(--primary-subtle)] px-1.5 text-[11px] text-[var(--primary-text)]">{external ? t(`${NS}.typeExternal`) : t(`${NS}.typeInternal`)}</span>
        {!client.is_active && <span className="rounded-sm bg-[var(--status-error-subtle)] px-1.5 text-[11px] text-destructive">{t(`${NS}.inactive`)}</span>}
      </div>
      {client.app_description && <p className="text-[12px] text-muted-foreground">{client.app_description}</p>}
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">{t(`${NS}.clientId`)}</span>
        <code className="rounded-sm bg-[var(--bg-tertiary)] px-1.5 font-mono text-foreground">{client.client_id}</code>
        <button type="button" className="subtle-btn" onClick={() => void copyText(client.client_id, toast, t)}>{t(`${NS}.copy`)}</button>
      </div>
      <div className="text-[12px] text-muted-foreground">{t(`${NS}.scopes`)}: {client.allowed_scopes.map((s) => t(scopeLabelKey(s))).join('、')}</div>
      <div className="break-all text-[12px] text-muted-foreground">{t(`${NS}.redirectUris`)}: {client.redirect_uris.join('，')}</div>
      {external && (
        <div className="flex flex-wrap gap-1">
          {confirmReset ? (
            <><button type="button" className="subtle-btn" disabled={busy} onClick={() => { setConfirmReset(false); void onResetSecret() }}>{t('shell.oauth.confirm')}</button><button type="button" className="subtle-btn" disabled={busy} onClick={() => setConfirmReset(false)}>{t(`${NS}.cancel`)}</button></>
          ) : (
            <button type="button" className="subtle-btn" disabled={busy} onClick={() => setConfirmReset(true)}>{t(`${NS}.resetSecret`)}</button>
          )}
          {confirmDelete ? (
            <><button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={busy} onClick={() => { setConfirmDelete(false); void onDelete() }}>{t(`${NS}.confirmDelete`)}</button><button type="button" className="subtle-btn" disabled={busy} onClick={() => setConfirmDelete(false)}>{t(`${NS}.cancel`)}</button></>
          ) : (
            <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>{t(`${NS}.del`)}</button>
          )}
        </div>
      )}
    </li>
  )
}

/** 小程序模态框第二个 tab（spec §6.3）。列表是组件内存态；create / reset 的密钥进 SecretDisplay，只显示一次。 */
export function OAuthClientsPanel() {
  const { t } = useI18n()
  const [clients, setClients] = useState<OAuthClient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opError, setOpError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ title: string; fields: Array<{ label: string; value: string }> } | null>(null)
  const load = useCallback(() => {
    setError(null)
    setClients(null)
    oauthApi.listClients().then(setClients).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id)
    setOpError(null)
    try { await fn() } catch (e: unknown) { setOpError(e instanceof Error ? e.message : String(e)) } finally { setBusyId(null) }
  }
  const showSecret = (name: string, clientId: string, clientSecret: string) =>
    setSecret({ title: t(`${NS}.secretTitle`, { name }), fields: [{ label: t(`${NS}.clientId`), value: clientId }, { label: t(`${NS}.clientSecret`), value: clientSecret }] })
  return (
    <div>
      <div className="flex justify-end gap-2 py-2">
        <Button variant="outline" size="sm" onClick={load} disabled={clients === null && !error}><RefreshCw className="mr-1 h-4 w-4" />{t(`${NS}.refresh`)}</Button>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />{t(`${NS}.create`)}</Button>
      </div>
      {error ? <ListError error={error} onRetry={load} /> : clients === null ? <ListLoading /> : clients.length === 0 ? (
        <div><ListEmpty message={t(`${NS}.empty`)} /><p className="text-center text-[12px] text-app-light">{t(`${NS}.emptyHint`)}</p></div>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {clients.map((c) => (
            <ClientCard key={c.client_id} client={c} busy={busyId === c.client_id}
              onDelete={() => withBusy(c.client_id, async () => { await oauthApi.deleteClient(c.client_id); setClients((prev) => prev?.filter((x) => x.client_id !== c.client_id) ?? prev) })}
              onResetSecret={() => withBusy(c.client_id, async () => { const { client_secret } = await oauthApi.resetClientSecret(c.client_id); showSecret(c.app_name, c.client_id, client_secret) })} />
          ))}
        </ul>
      )}
      {opError && <p className="py-2 text-[13px] text-destructive" role="alert">{t(`${NS}.opFailed`)}: {opError}</p>}
      <CreateClientDialog open={creating} onClose={() => setCreating(false)} onCreated={(res) => { setCreating(false); showSecret(res.app_name, res.client_id, res.client_secret); load() }} />
      <SecretDisplay open={secret !== null} title={secret?.title ?? ''} fields={secret?.fields ?? []} onClose={() => setSecret(null)} />
    </div>
  )
}
```

- [ ] **Step 7: 跑面板用例确认通过**

Run: `bun run test -- src/features/oauth/components/__tests__/OAuthClientsPanel.test.tsx`
Expected: PASS（6 条）。Radix `Dialog` 在 happy-dom 下 `role="dialog"` 的可访问名来自 `DialogTitle`（aria-labelledby）；若 `getByRole('dialog', { name })` 取不到，先确认 `DialogContent` 没有把 `aria-labelledby` 覆盖掉，再考虑改查询——不要把断言降级成 `getByText`。

- [ ] **Step 8: 小程序模态框加分段 + 路由用例**

`src/app/routes/shell/miniapps.tsx`：把现有列表 JSX 抽成本文件内的 `function MiniAppList()`（逻辑不变），`MiniappsRoute` 变成：
```tsx
const TABS = ['miniapps', 'oauth'] as const
type Tab = (typeof TABS)[number]

export default function MiniappsRoute() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('miniapps')
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.miniapps')}>
        <div role="tablist" aria-label={t('shell.modals.miniapps')} className="mb-3 flex gap-1 rounded-md bg-[var(--bg-tertiary)] p-1">
          {TABS.map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={cn('flex-1 rounded-sm px-3 py-1.5 text-[13px]', tab === key ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground')}>
              {key === 'miniapps' ? t('shell.modals.miniappsTab') : t('shell.modals.oauthClientsTab')}
            </button>
          ))}
        </div>
        {tab === 'miniapps' ? <MiniAppList /> : <OAuthClientsPanel />}
      </RouteDialog>
    </>
  )
}
```
（`OAuthClientsPanel` 用 `dynamic(() => import(...).then((m) => ({ default: m.OAuthClientsPanel })))` 懒加载不是必须——它没有 SSR 不安全的依赖，直接 import。）

用例 `src/app/routes/shell/__tests__/miniapps.test.tsx`（照 `bots.test.tsx` 的 mock 头：`EmptyContent` 探针 + 真字典 `t`）：
```tsx
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/app/miniapps', element: <MiniappsRoute /> }], { initialEntries: ['/app/miniapps'] })} />)

describe('/app/miniapps 模态框的两个 tab', () => {
  afterEach(() => vi.restoreAllMocks())
  it('默认显示我的小程序；切到「OAuth 客户端」才拉客户端列表', async () => {
    vi.spyOn(miniappsApi, 'listMy').mockResolvedValue([])
    const clients = vi.spyOn(oauthApi, 'listClients').mockResolvedValue([])
    mount()
    expect(await screen.findByText('还没有小程序')).toBeInTheDocument()
    expect(clients).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'OAuth 客户端' }))
    expect(await screen.findByText('还没有 OAuth 客户端')).toBeInTheDocument()
    expect(clients).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('tab', { name: 'OAuth 客户端' })).toHaveAttribute('aria-selected', 'true')
  })
})
```
Run: `bun run test -- src/app/routes/shell/__tests__/miniapps.test.tsx` → PASS。

- [ ] **Step 9: 变异校验**

| 变异 | 必红 |
|---|---|
| `SecretDisplay` 的 `onOpenChange` 改成 `(o) => { if (!o) onClose() }` | 面板用例 4（Esc 后 dialog 消失） |
| `ClientCard` 对 internal 也渲染删除 | 用例 1（按钮数量） |
| 创建表单不校验回调地址 | 用例 5（按钮应 disabled + 文案） |
| `withBusy` 吞错不 `setOpError` | 补一条：`deleteClient` reject → `role=alert` 含「操作失败」 |

- [ ] **Step 10: 门槛与提交**

```bash
bun run test
bun run typecheck
bun run lint
git add src/features/oauth src/app/routes/shell/miniapps.tsx src/app/routes/shell/__tests__/miniapps.test.tsx src/i18n/messages.ts
git commit -m "feat(oauth): 小程序模态框加「OAuth 客户端」tab——创建/删除/重置密钥与只显示一次的凭据

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 6: 托管授权页 `/app/oauth/authorize` + `ProtectedRoute` 的 `next` 回跳（spec §3 / §6.4 / §10.6 / §11 / §12）

**Files:**
- Create: `src/features/oauth/lib/redirect.ts`（`appendQuery`、`browserNav`）
- Create: `src/features/oauth/components/AuthorizePage.tsx`
- Create: `src/app/routes/oauth-authorize.tsx`
- Test: `src/features/oauth/lib/__tests__/redirect.test.ts`、`src/features/oauth/components/__tests__/AuthorizePage.test.tsx`
- Modify: `src/features/auth/components/ProtectedRoute.tsx`（未登录跳转带 `next`）+ `src/features/auth/components/__tests__/ProtectedRoute.test.tsx`（追加两条）
- Modify: `src/app/routes.ts`（注册路由）+ `src/app/routes/__tests__/appShellRoutes.test.tsx`（追加断言）、`src/lib/routes.ts`（`ROUTES.app.oauthAuthorize`）、`src/i18n/messages.ts`（`shell.oauth.authorize.*`、`shell.oauth.scopeDesc.*`）

**Interfaces:**
- Consumes（Task 4 / 5）: `oauthApi.authorize`、`AuthorizeRequest / AuthorizeResult`、`scopeLabelKey`、`isValidRedirectUri`；`useSearchParams`（`@/lib/navigation`）；`ROUTES`、`DEFAULT_UNAUTHENTICATED_ROUTE / DEFAULT_AUTHENTICATED_ROUTE`。
- Produces:
  - `appendQuery(target: string, params: Record<string, string | null | undefined>): string`——用 `new URL(target, location.origin)` 解析（相对路径落成同源绝对地址），`null / undefined` 的参数不写，保留原有 query，返回 `url.toString()`。
  - `browserNav = { assign(href: string): void }`（唯一的整页跳转出口；测试对它 `vi.spyOn`）。
  - `AuthorizePage`（默认导出 + 命名导出）；路由 `ROUTES.app.oauthAuthorize = '/app/oauth/authorize'`。
  - `ProtectedRoute`：未登录时 `router.replace(\`${DEFAULT_UNAUTHENTICATED_ROUTE}?next=${encodeURIComponent(pathname + search)}\`)`；当 `pathname + search === DEFAULT_AUTHENTICATED_ROUTE`（`/app/chat`）时不带 `next`（登录后本来就去那里）。

**Ruling 已定（spec §12 的开放问题）：** 直接把 `next` 支持加进 `ProtectedRoute`，对所有受保护页都生效；授权页自己**不**再做未登录判断（它挂在 `protected-layout` 之下，`ProtectedRoute` 在它渲染之前就已经接管）。`LoginForm` 已经按 `next.startsWith('/')` 回跳（`LoginForm.tsx:56` / `:76`）。

- [ ] **Step 1: `redirect.ts` 失败用例 `src/features/oauth/lib/__tests__/redirect.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { appendQuery } from '../redirect'

describe('appendQuery', () => {
  it('绝对地址：追加 code/state，保留原有 query', () => {
    expect(appendQuery('https://example.com/cb?x=1', { code: 'abc', state: 's 1' })).toBe('https://example.com/cb?x=1&code=abc&state=s+1')
  })
  it('null / undefined 的参数不写', () => {
    expect(appendQuery('https://example.com/cb', { code: 'abc', state: null })).toBe('https://example.com/cb?code=abc')
  })
  it('站内相对路径落成同源绝对地址', () => {
    expect(appendQuery('/apps/x/cb', { error: 'access_denied' })).toBe(`${location.origin}/apps/x/cb?error=access_denied`)
  })
})
```
实现 `src/features/oauth/lib/redirect.ts`：
```ts
/** 把 code / state / error 拼到回调地址上；相对路径按当前 origin 解析（spec §6.4 第 4 条）。 */
export function appendQuery(target: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(target, location.origin)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, value)
  }
  return url.toString()
}

/** 整页跳转的唯一出口；对象形式是为了测试能 vi.spyOn(browserNav, 'assign') */
export const browserNav = {
  assign(href: string): void {
    window.location.assign(href)
  },
}
```
Run: `bun run test -- src/features/oauth/lib/__tests__/redirect.test.ts` → FAIL 再 PASS。

- [ ] **Step 2: i18n（zh / en，`shell.oauth` 里追加）**

zh：
```ts
      scopeDesc: { profile: '昵称和头像', email: '注册邮箱', friends: '好友数量', groups: '群数量' },
      authorize: {
        title: '授权请求', invalid: '无效的授权请求', invalidHint: '缺少 client_id 或 redirect_uri，或 PKCE 参数不完整', loading: '正在核对应用信息…',
        consentTitle: '{name} 请求访问你的账户', scopesTitle: '将获得以下权限', allow: '允许', deny: '拒绝',
        denied: '已拒绝授权', deniedNoRedirect: '回调地址不合法，未跳转', redirecting: '授权成功，正在跳转…', failed: '授权失败', backToChat: '返回聊天',
      },
```
en：
```ts
      scopeDesc: { profile: 'Nickname and avatar', email: 'Registered email', friends: 'Number of friends', groups: 'Number of groups' },
      authorize: {
        title: 'Authorization request', invalid: 'Invalid authorization request', invalidHint: 'client_id or redirect_uri is missing, or the PKCE parameters are incomplete', loading: 'Checking the app…',
        consentTitle: '{name} wants to access your account', scopesTitle: 'It will be able to read', allow: 'Allow', deny: 'Deny',
        denied: 'Authorization denied', deniedNoRedirect: 'The redirect URI is invalid; not redirecting', redirecting: 'Authorized, redirecting…', failed: 'Authorization failed', backToChat: 'Back to chat',
      },
```

- [ ] **Step 3: 写授权页失败用例 `src/features/oauth/components/__tests__/AuthorizePage.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { oauthApi } from '../../api/oauth'
import { browserNav } from '../../lib/redirect'
import AuthorizePage from '../AuthorizePage'

vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string, params?: Record<string, string | number>) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    if (typeof value !== 'string') return key
    return params ? value.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : value
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const mount = (query: string) => render(<RouterProvider router={createMemoryRouter([{ path: '/app/oauth/authorize', element: <AuthorizePage /> }, { path: '/app/chat', element: <div>聊天</div> }], { initialEntries: [`/app/oauth/authorize${query}`] })} />)
const BASE = '?client_id=c1&redirect_uri=https%3A%2F%2Fquery.example%2Fcb&scope=profile%20email&state=s1'

let assign: ReturnType<typeof vi.fn>
beforeEach(() => { assign = vi.fn(); vi.spyOn(browserNav, 'assign').mockImplementation(assign) })
afterEach(() => vi.restoreAllMocks())

describe('/app/oauth/authorize', () => {
  it('缺 client_id：错误页，不调后端也不跳转', () => {
    const authorize = vi.spyOn(oauthApi, 'authorize')
    mount('?redirect_uri=https%3A%2F%2Fx.y%2Fcb')
    expect(screen.getByText('无效的授权请求')).toBeInTheDocument()
    expect(authorize).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })
  it('只给 code_challenge 不给 method：错误页（正对照：两个都给时进请求体）', async () => {
    const authorize = vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'code', code: 'abc', state: 's1', redirect_uri: 'https://backend.example/cb' })
    mount(`${BASE}&code_challenge=xyz`)
    expect(screen.getByText('无效的授权请求')).toBeInTheDocument()
    expect(authorize).not.toHaveBeenCalled()
    mount(`${BASE}&code_challenge=xyz&code_challenge_method=S256`)
    await waitFor(() => expect(authorize).toHaveBeenCalledWith({ client_id: 'c1', redirect_uri: 'https://query.example/cb', scope: 'profile email', state: 's1', code_challenge: 'xyz', code_challenge_method: 'S256' }))
  })
  it('内部客户端：首次请求就拿到 code，跳到**后端回传**的 redirect_uri（不是 query 里的）', async () => {
    vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'code', code: 'abc', state: 's1', redirect_uri: 'https://backend.example/cb' })
    mount(BASE)
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://backend.example/cb?code=abc&state=s1'))
    expect(screen.getByText('授权成功，正在跳转…')).toBeInTheDocument()
  })
  it('scope 缺省为 profile；state 为 null 时不拼；相对 redirect_uri 落成同源绝对地址', async () => {
    const authorize = vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'code', code: 'abc', state: null, redirect_uri: '/apps/x/cb' })
    mount('?client_id=c1&redirect_uri=%2Fapps%2Fx%2Fcb')
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`${location.origin}/apps/x/cb?code=abc`))
    expect(authorize).toHaveBeenCalledWith({ client_id: 'c1', redirect_uri: '/apps/x/cb', scope: 'profile' })
  })
  it('外部客户端首次：显示应用名与权限说明；「允许」带 consent:true 再请求并跳转', async () => {
    const authorize = vi.spyOn(oauthApi, 'authorize')
      .mockResolvedValueOnce({ kind: 'consent', app_name: 'Ext App', app_logo_url: null, scopes: ['profile', 'email'] })
      .mockResolvedValueOnce({ kind: 'code', code: 'zzz', state: 's1', redirect_uri: 'https://backend.example/cb' })
    mount(BASE)
    expect(await screen.findByText('Ext App 请求访问你的账户')).toBeInTheDocument()
    expect(screen.getByText('基本资料')).toBeInTheDocument()
    expect(screen.getByText('昵称和头像')).toBeInTheDocument()
    expect(screen.getByText('邮箱')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '允许' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://backend.example/cb?code=zzz&state=s1'))
    expect(authorize.mock.calls[1][0]).toEqual({ client_id: 'c1', redirect_uri: 'https://query.example/cb', scope: 'profile email', state: 's1', consent: true })
  })
  it('「拒绝」：query 的 redirect_uri 合法 → 跳 error=access_denied（带 state）；不合法 → 只显示已拒绝', async () => {
    vi.spyOn(oauthApi, 'authorize').mockResolvedValue({ kind: 'consent', app_name: 'Ext App', app_logo_url: null, scopes: ['profile'] })
    mount(BASE)
    fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
    expect(assign).toHaveBeenCalledWith('https://query.example/cb?error=access_denied&state=s1')
    assign.mockClear()
    mount('?client_id=c1&redirect_uri=query.example%2Fcb')
    fireEvent.click(await screen.findByRole('button', { name: '拒绝' }))
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByText('已拒绝授权')).toBeInTheDocument()
    expect(screen.getByText('回调地址不合法，未跳转')).toBeInTheDocument()
  })
  it('后端 400：显示后端文案 + 返回聊天链接；不跳转', async () => {
    vi.spyOn(oauthApi, 'authorize').mockRejectedValue(new Error('redirect_uri 未注册'))
    mount(BASE)
    expect(await screen.findByRole('alert')).toHaveTextContent('redirect_uri 未注册')
    expect(screen.getByRole('link', { name: '返回聊天' })).toHaveAttribute('href', '/app/chat')
    expect(assign).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: 跑用例确认失败**

Run: `bun run test -- src/features/oauth/components/__tests__/AuthorizePage.test.tsx`
Expected: FAIL（找不到 `../AuthorizePage`）。

- [ ] **Step 5: 写 `src/features/oauth/components/AuthorizePage.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/I18nProvider'
import { useSearchParams } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { type AuthorizeRequest, oauthApi, scopeLabelKey } from '../api/oauth'
import { appendQuery, browserNav } from '../lib/redirect'
import { isValidRedirectUri } from '../lib/redirectUri'

const NS = 'shell.oauth.authorize'

/** query → 请求体；缺必填或 PKCE 只给一半 → null（错误页，不跳转） */
export function parseAuthorizeQuery(params: URLSearchParams): AuthorizeRequest | null {
  const client_id = params.get('client_id')
  const redirect_uri = params.get('redirect_uri')
  if (!client_id || !redirect_uri) return null
  const challenge = params.get('code_challenge')
  const method = params.get('code_challenge_method')
  if ((challenge === null) !== (method === null)) return null
  if (method !== null && method !== 'S256') return null
  const req: AuthorizeRequest = { client_id, redirect_uri, scope: params.get('scope') || 'profile' }
  const state = params.get('state')
  if (state !== null) req.state = state
  if (challenge !== null) {
    req.code_challenge = challenge
    req.code_challenge_method = 'S256'
  }
  return req
}

type Phase =
  | { kind: 'invalid' }
  | { kind: 'loading' }
  | { kind: 'consent'; appName: string; logo: string | null; scopes: string[]; submitting: boolean }
  | { kind: 'redirecting' }
  | { kind: 'denied'; redirected: boolean }
  | { kind: 'error'; message: string }

/**
 * 托管授权页（spec §6.4）。全屏、不进壳；未登录由 protected-layout 的 ProtectedRoute
 * 带 `next` 跳登录页。跳转目标只用后端回传的 redirect_uri（后端已按注册白名单校验）；
 * 拒绝分支没有后端回传，才用 query 的 redirect_uri，且必须过 isValidRedirectUri。
 */
export function AuthorizePage() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const req = useMemo(() => parseAuthorizeQuery(new URLSearchParams(searchParams.toString())), [searchParams])
  const [phase, setPhase] = useState<Phase>(req ? { kind: 'loading' } : { kind: 'invalid' })

  const finish = (code: string, state: string | null, redirectUri: string) => {
    setPhase({ kind: 'redirecting' })
    browserNav.assign(appendQuery(redirectUri, { code, state }))
  }
  const fail = (e: unknown) => setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })

  useEffect(() => {
    if (!req) return
    let alive = true
    oauthApi.authorize(req).then((res) => {
      if (!alive) return
      if (res.kind === 'code') finish(res.code, res.state, res.redirect_uri)
      else setPhase({ kind: 'consent', appName: res.app_name, logo: res.app_logo_url, scopes: res.scopes, submitting: false })
    }).catch((e: unknown) => { if (alive) fail(e) })
    return () => { alive = false }
    // req 由 query 派生，query 变了整页都会重新走一遍
  }, [req])

  const allow = async () => {
    if (!req || phase.kind !== 'consent') return
    setPhase({ ...phase, submitting: true })
    try {
      const res = await oauthApi.authorize({ ...req, consent: true })
      if (res.kind === 'code') finish(res.code, res.state, res.redirect_uri)
      else setPhase({ kind: 'consent', appName: res.app_name, logo: res.app_logo_url, scopes: res.scopes, submitting: false })
    } catch (e: unknown) {
      fail(e)
    }
  }
  const deny = () => {
    if (!req) return
    if (isValidRedirectUri(req.redirect_uri)) {
      setPhase({ kind: 'denied', redirected: true })
      browserNav.assign(appendQuery(req.redirect_uri, { error: 'access_denied', state: req.state ?? null }))
    } else {
      setPhase({ kind: 'denied', redirected: false })
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="glass-card w-full max-w-[420px] p-8 text-center">
        <h1 className="mb-4 text-[15px] font-semibold text-muted-foreground">{t(`${NS}.title`)}</h1>
        {phase.kind === 'invalid' && (<><p className="text-[16px] text-foreground">{t(`${NS}.invalid`)}</p><p className="mt-2 text-[13px] text-muted-foreground">{t(`${NS}.invalidHint`)}</p></>)}
        {phase.kind === 'loading' && <p className="text-[14px] text-muted-foreground">{t(`${NS}.loading`)}</p>}
        {phase.kind === 'redirecting' && <p className="text-[14px] text-foreground">{t(`${NS}.redirecting`)}</p>}
        {phase.kind === 'denied' && (<><p className="text-[16px] text-foreground">{t(`${NS}.denied`)}</p>{!phase.redirected && <p className="mt-2 text-[13px] text-muted-foreground">{t(`${NS}.deniedNoRedirect`)}</p>}</>)}
        {phase.kind === 'error' && (<><p className="text-[14px] text-destructive" role="alert">{t(`${NS}.failed`)}: {phase.message}</p><NavLink to={ROUTES.app.chat} className="subtle-btn mt-4">{t(`${NS}.backToChat`)}</NavLink></>)}
        {phase.kind === 'consent' && (
          <>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-tertiary)] text-xl font-semibold text-muted-foreground">
              {phase.logo ? <img src={phase.logo} alt="" className="h-full w-full object-cover" /> : phase.appName.charAt(0).toUpperCase()}
            </div>
            <p className="text-[16px] text-foreground">{t(`${NS}.consentTitle`, { name: phase.appName })}</p>
            <p className="mt-4 text-[12px] text-muted-foreground">{t(`${NS}.scopesTitle`)}</p>
            <ul className="mt-2 space-y-1 text-left">
              {phase.scopes.map((s) => (
                <li key={s} className="rounded-md bg-[var(--white-alpha-40)] px-3 py-2 text-[13px]">
                  <span className="text-foreground">{t(scopeLabelKey(s))}</span>
                  <span className="ml-2 text-muted-foreground">{t(`shell.oauth.scopeDesc.${s}`) === `shell.oauth.scopeDesc.${s}` ? '' : t(`shell.oauth.scopeDesc.${s}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" disabled={phase.submitting} onClick={deny}>{t(`${NS}.deny`)}</Button>
              <Button className="flex-1" disabled={phase.submitting} onClick={allow}>{t(`${NS}.allow`)}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AuthorizePage
```
未知 scope 的说明那行：`t()` 对不存在的 key 回显 key 本身，所以用「回显了 key 就不显示」这个判断避免屏幕上出现 `shell.oauth.scopeDesc.wallet`。若 lint 对 `finish` / `fail` 在 effect 里的引用报 exhaustive-deps warning，把两者用 `useCallback([])` 包起来并列入依赖。

- [ ] **Step 6: 跑用例确认通过**

Run: `bun run test -- src/features/oauth/components/__tests__/AuthorizePage.test.tsx`
Expected: PASS（7 条）。

- [ ] **Step 7: `ProtectedRoute` 带 `next`（先加用例）**

`src/features/auth/components/__tests__/ProtectedRoute.test.tsx` 追加（在现有 describe 里，复用 `ok` / `fetchMock`）：
```tsx
  it('401 落在 /app/oauth/authorize?client_id=c1：跳登录页并带 next（完整路径含 query，已编码）', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '会话已失效' }, 401))
    const router = createMemoryRouter(
      [
        { path: '/app/oauth/authorize', element: <ProtectedRoute><div>授权页</div></ProtectedRoute> },
        { path: '/app/login', element: <div>登录页</div> },
      ],
      { initialEntries: ['/app/oauth/authorize?client_id=c1&redirect_uri=%2Fapps%2Fx%2Fcb'] },
    )
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/login'))
    expect(router.state.location.search).toBe('?next=%2Fapp%2Foauth%2Fauthorize%3Fclient_id%3Dc1%26redirect_uri%3D%252Fapps%252Fx%252Fcb')
  })
  it('正对照：401 落在默认页 /app/chat 时不带 next', async () => {
    fetchMock.mockResolvedValueOnce(ok({ success: false, code: 401, error: '会话已失效' }, 401))
    const router = createMemoryRouter(
      [
        { path: '/app/chat', element: <ProtectedRoute><div>聊天</div></ProtectedRoute> },
        { path: '/app/login', element: <div>登录页</div> },
      ],
      { initialEntries: ['/app/chat'] },
    )
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/login'))
    expect(router.state.location.search).toBe('')
  })
```
实现（`ProtectedRoute.tsx`）：`import { useLocation } from 'react-router'`；`import { DEFAULT_AUTHENTICATED_ROUTE, DEFAULT_UNAUTHENTICATED_ROUTE } from '@/lib/routes'`；组件里 `const location = useLocation()`；跳转 effect 改为：
```ts
  useEffect(() => {
    if (hasBeenRestoringRef.current && !isRestoring && !isAuthenticated && !error) {
      // 登录后回到原来要去的页面（spec §3 / §6.4：授权页链接会被未登录用户点开）。
      // 默认页本身不带 next——LoginForm 没有 next 时本来就去 DEFAULT_AUTHENTICATED_ROUTE。
      const current = `${location.pathname}${location.search}`
      const target = current === DEFAULT_AUTHENTICATED_ROUTE
        ? DEFAULT_UNAUTHENTICATED_ROUTE
        : `${DEFAULT_UNAUTHENTICATED_ROUTE}?next=${encodeURIComponent(current)}`
      router.replace(target)
    }
  }, [isAuthenticated, isRestoring, error, router, location.pathname, location.search])
```
Run: `bun run test -- src/features/auth/components/__tests__/ProtectedRoute.test.tsx` → PASS（原有 4 条 + 新 2 条；原有 401 用例断的是 pathname，不受影响）。

- [ ] **Step 8: 路由注册**

`src/lib/routes.ts` 的 `ROUTES.app` 加 `oauthAuthorize: '/app/oauth/authorize'`。
`src/app/routes.ts`：在 `route('app/video-meeting', 'routes/video-meeting.tsx'),` 下一行加 `route('app/oauth/authorize', 'routes/oauth-authorize.tsx'),`（同层：`protected-layout` 之下、`app-shell` 之外）。
`src/app/routes/oauth-authorize.tsx`：
```tsx
import AuthorizePage from '@/features/oauth/components/AuthorizePage'

/** 全屏授权页：与 /app/video-meeting 同层，不进壳（spec §3） */
export default function OAuthAuthorize() {
  return <AuthorizePage />
}
```
`src/app/routes/__tests__/appShellRoutes.test.tsx` 第 33 行附近追加 `expect(flat).toContain('routes/oauth-authorize.tsx@/app/oauth/authorize')`，并断言它**不在** app-shell 之下：`expect(flat).not.toContain('routes/app-shell.tsx@/app/oauth/authorize')`（正对照：`flatten` 对壳内路由给的是 `routes/shell/*.tsx@…`，所以再加一句 `expect(flat.filter((x) => x.endsWith('@/app/oauth/authorize'))).toEqual(['routes/oauth-authorize.tsx@/app/oauth/authorize'])`）。

Run: `bun run test -- src/app/routes/__tests__/appShellRoutes.test.tsx` → PASS。

- [ ] **Step 9: 变异校验**

| 变异 | 必红 |
|---|---|
| `finish` 用 `req.redirect_uri` 而不是后端回传 | 授权页用例 3（`query.example` ≠ `backend.example`） |
| 拒绝分支不过 `isValidRedirectUri` | 用例 6 第二段 |
| `parseAuthorizeQuery` 不检查 PKCE 成对 | 用例 2 |
| `ProtectedRoute` 恒不带 `next` | 新用例 1；恒带 → 新用例 2 |

- [ ] **Step 10: 门槛与提交**

```bash
bun run test
bun run typecheck
bun run lint
bun --bun run build
git add src/features/oauth src/features/auth src/app/routes.ts src/app/routes/oauth-authorize.tsx src/app/routes/__tests__/appShellRoutes.test.tsx src/lib/routes.ts src/i18n/messages.ts
git commit -m "feat(oauth): 托管授权页 /app/oauth/authorize（同意/拒绝/直通三条路径）+ ProtectedRoute 未登录带 next 回跳

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: 通知提示音——内置 `water.mp3` + IndexedDB 自定义库 + `SoundManager.playFile` + 选择器（spec §7 / §10.7 / §11）

**Files:**
- Create: `public/sounds/water.mp3`（二进制复制自 `app-ref/sounds/water.mp3`，19 KB）
- Create: `src/features/settings/sounds/soundLibrary.ts`
- Test: `src/features/settings/sounds/__tests__/soundLibrary.test.ts`（`fake-indexeddb`）
- Modify: `src/features/settings/store/settingsStore.ts`（`notificationSound`）、`src/lib/sessionScope.ts`（`DEVICE_SCOPED_SETTING_FIELDS` 加 `'notificationSound'`）
- Modify: `src/hooks/useSound.ts`（`playFile`、`setNotificationSound`、`playMessage / playNotification` 改走选中音）+ Test: `src/hooks/__tests__/useSound.test.ts`
- Modify: `src/app/root.tsx`（`SettingsSync` 同步 `notificationSound` 进 manager）
- Create: `src/components/shell/settings/SoundSelector.tsx` + Test: `src/components/shell/settings/__tests__/SoundSelector.test.tsx`
- Modify: `src/components/shell/settings/NotificationsSection.tsx`（三行之下加选择器）、`src/i18n/messages.ts`（`shell.settings.sounds.*`）、`package.json`（`bun add -d fake-indexeddb`）

**Interfaces:**
- Produces:
  ```ts
  export interface SoundOption { id: string; name: string; kind: 'builtin' | 'custom'; src: string | null }
  export const BUILTIN_SOUNDS: readonly SoundOption[]   // [{ id: 'water', name: 'water', kind: 'builtin', src: '/sounds/water.mp3' }, { id: 'classic', name: 'classic', kind: 'builtin', src: null }]
  export const DEFAULT_SOUND_ID = 'water'
  export const MAX_CUSTOM_SOUND_BYTES = 2 * 1024 * 1024
  export class SoundLibraryError extends Error { code: 'type' | 'size' | 'unavailable' }
  export function isIndexedDbAvailable(): boolean
  export function listCustom(): Promise<SoundOption[]>            // kind 'custom'，src 为 null（播放时再解析）
  export function saveCustom(file: File): Promise<SoundOption>     // 只收 audio/mpeg 且 ≤ 2 MB；name = 文件名去扩展名，重名加「 (2)」「 (3)」
  export function deleteCustom(id: string): Promise<void>
  export function resolveSoundSrc(id: string): Promise<{ src: string; revoke: () => void } | null>  // builtin → 静态路径 + 空 revoke；custom → blob: URL + revokeObjectURL；未知 id / 库不可用 → null
  ```
  - `useSound.ts` 新导出：`setNotificationSound(id: string)`、`playFile(src: string): Promise<boolean>`；`playMessage() / playNotification()` 签名不变（仍是同步 `() => void`）。
  - `settingsStore.notificationSound: string`（默认 `'water'`，设备级）。
  - `SoundSelector()`（无 props）。

**存储形状（IndexedDB 库 `huanvae-sounds`，store `sounds`，keyPath `id`，version 1）：** `{ id: string; name: string; type: string; bytes: ArrayBuffer; createdAt: string }`——存 `ArrayBuffer` 而不是 `Blob`：happy-dom 的 `Blob` 不是 Node 的平台对象，`structuredClone` 会抛 DataCloneError（fake-indexeddb 靠它复制值），生产浏览器两者都行，选测试也能跑的那种。设备级：`sessionScope` 只清 localStorage / sessionStorage，IndexedDB 天然不在清盘范围（与 APP 的用户目录同义），在 `soundLibrary.ts` 文件头注释写明。

- [ ] **Step 1: 装依赖、复制内置音**

```bash
bun add -d fake-indexeddb
mkdir -p public/sounds
cp .superpowers/sdd/2026-09-11-settings-completion/app-ref/sounds/water.mp3 public/sounds/water.mp3
ls -l public/sounds/water.mp3
```
Expected: 大小约 19 KB（`19xxx` 字节）。若 `app-ref/sounds/water.mp3` 不存在，从 `/Users/i/Code/huanvae/Huanvae-Chat-App/Notification-Sounds/water.mp3` 复制。

- [ ] **Step 2: 写库的失败用例 `src/features/settings/sounds/__tests__/soundLibrary.test.ts`**

```ts
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_SOUNDS, DEFAULT_SOUND_ID, MAX_CUSTOM_SOUND_BYTES, SoundLibraryError, deleteCustom, isIndexedDbAvailable, listCustom, resolveSoundSrc, saveCustom } from '../soundLibrary'

const mp3 = (name: string, bytes = 1024, type = 'audio/mpeg') => new File([new Uint8Array(bytes)], name, { type })

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock-1'), revokeObjectURL: vi.fn() }))
})
afterEach(() => vi.unstubAllGlobals())

describe('soundLibrary', () => {
  it('内置两项：water 指向 /sounds/water.mp3，classic 无文件（合成音）；默认 water', () => {
    expect(BUILTIN_SOUNDS).toEqual([
      { id: 'water', name: 'water', kind: 'builtin', src: '/sounds/water.mp3' },
      { id: 'classic', name: 'classic', kind: 'builtin', src: null },
    ])
    expect(DEFAULT_SOUND_ID).toBe('water')
    expect(MAX_CUSTOM_SOUND_BYTES).toBe(2_097_152)
  })
  it('saveCustom：存进库、name 去扩展名、id 以 custom- 开头；listCustom 按 createdAt 升序列出', async () => {
    const a = await saveCustom(mp3('Ding.mp3'))
    expect(a.kind).toBe('custom')
    expect(a.name).toBe('Ding')
    expect(a.id).toMatch(/^custom-/)
    expect(a.src).toBeNull()
    await saveCustom(mp3('dong.MP3'))
    expect((await listCustom()).map((s) => s.name)).toEqual(['Ding', 'dong'])
  })
  it('重名加序号：Ding、Ding (2)、Ding (3)', async () => {
    await saveCustom(mp3('Ding.mp3'))
    await saveCustom(mp3('Ding.mp3'))
    const third = await saveCustom(mp3('Ding.mp3'))
    expect(third.name).toBe('Ding (3)')
    expect((await listCustom()).map((s) => s.name)).toEqual(['Ding', 'Ding (2)', 'Ding (3)'])
  })
  it('只收 audio/mpeg：其它类型抛 code=type；超过 2 MB 抛 code=size；都不入库', async () => {
    await expect(saveCustom(mp3('a.wav', 10, 'audio/wav'))).rejects.toMatchObject({ code: 'type' })
    await expect(saveCustom(mp3('big.mp3', MAX_CUSTOM_SOUND_BYTES + 1))).rejects.toMatchObject({ code: 'size' })
    await expect(saveCustom(mp3('edge.mp3', MAX_CUSTOM_SOUND_BYTES))).resolves.toMatchObject({ name: 'edge' })
    expect(await listCustom()).toHaveLength(1)
    await expect(saveCustom(mp3('a.wav', 10, 'audio/wav'))).rejects.toBeInstanceOf(SoundLibraryError)
  })
  it('deleteCustom 删掉一条；删不存在的 id 不抛', async () => {
    const a = await saveCustom(mp3('a.mp3'))
    await saveCustom(mp3('b.mp3'))
    await deleteCustom(a.id)
    expect((await listCustom()).map((s) => s.name)).toEqual(['b'])
    await expect(deleteCustom('custom-nope')).resolves.toBeUndefined()
  })
  it('resolveSoundSrc：builtin 给静态路径；custom 给 blob URL 且 revoke 调 revokeObjectURL；classic / 未知 → null', async () => {
    expect(await resolveSoundSrc('water')).toMatchObject({ src: '/sounds/water.mp3' })
    expect(await resolveSoundSrc('classic')).toBeNull()
    expect(await resolveSoundSrc('custom-nope')).toBeNull()
    const a = await saveCustom(mp3('a.mp3'))
    const resolved = await resolveSoundSrc(a.id)
    expect(resolved?.src).toBe('blob:mock-1')
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBe(1024)
    resolved?.revoke()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1')
  })
  it('indexedDB 不可用：isIndexedDbAvailable=false，listCustom 给空数组，saveCustom 抛 code=unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    expect(isIndexedDbAvailable()).toBe(false)
    expect(await listCustom()).toEqual([])
    await expect(saveCustom(mp3('a.mp3'))).rejects.toMatchObject({ code: 'unavailable' })
  })
})
```

- [ ] **Step 3: 跑用例确认失败**

Run: `bun run test -- src/features/settings/sounds/__tests__/soundLibrary.test.ts`
Expected: FAIL（找不到 `../soundLibrary`）。

- [ ] **Step 4: 写 `src/features/settings/sounds/soundLibrary.ts`**

```ts
/**
 * 通知提示音库（spec §7）。
 *
 * 内置两项（`water` 文件、`classic` 合成音）+ 用户上传的 MP3（IndexedDB）。
 * 设备级：`sessionScope` 的清盘只覆盖 localStorage / sessionStorage，IndexedDB 天然
 * 不在范围内——与 APP 把提示音放在本机用户目录同义，换账号不清。
 * 存 ArrayBuffer 不存 Blob：fake-indexeddb 用 structuredClone 复制值，happy-dom 的
 * Blob 不是 Node 平台对象会 DataCloneError；浏览器两者都行。
 */
export interface SoundOption { id: string; name: string; kind: 'builtin' | 'custom'; src: string | null }

export const BUILTIN_SOUNDS: readonly SoundOption[] = [
  { id: 'water', name: 'water', kind: 'builtin', src: '/sounds/water.mp3' },
  { id: 'classic', name: 'classic', kind: 'builtin', src: null },
]
export const DEFAULT_SOUND_ID = 'water'
export const MAX_CUSTOM_SOUND_BYTES = 2 * 1024 * 1024

const DB_NAME = 'huanvae-sounds'
const STORE = 'sounds'
const DB_VERSION = 1

interface CustomSoundRecord { id: string; name: string; type: string; bytes: ArrayBuffer; createdAt: string }

export class SoundLibraryError extends Error {
  constructor(public readonly code: 'type' | 'size' | 'unavailable', message: string) {
    super(message)
    this.name = 'SoundLibraryError'
  }
}

export function isIndexedDbAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 请求失败'))
  })
}

function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new SoundLibraryError('unavailable', '当前浏览器无法保存自定义提示音'))
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new SoundLibraryError('unavailable', '打开提示音库失败'))
  })
}

async function readAll(): Promise<CustomSoundRecord[]> {
  const db = await openDb()
  try {
    const rows = await request(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())
    return (rows as CustomSoundRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } finally {
    db.close()
  }
}

const toOption = (r: CustomSoundRecord): SoundOption => ({ id: r.id, name: r.name, kind: 'custom', src: null })

export async function listCustom(): Promise<SoundOption[]> {
  if (!isIndexedDbAvailable()) return []
  return (await readAll()).map(toOption)
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} (${n})`)) n += 1
  return `${base} (${n})`
}

export async function saveCustom(file: File): Promise<SoundOption> {
  if (!isIndexedDbAvailable()) throw new SoundLibraryError('unavailable', '当前浏览器无法保存自定义提示音')
  if (file.type !== 'audio/mpeg') throw new SoundLibraryError('type', '只支持 MP3（audio/mpeg）')
  if (file.size > MAX_CUSTOM_SOUND_BYTES) throw new SoundLibraryError('size', '文件不能超过 2 MB')
  const existing = await readAll()
  const name = uniqueName(file.name.replace(/\.mp3$/i, '') || 'sound', new Set(existing.map((r) => r.name)))
  const record: CustomSoundRecord = { id: `custom-${crypto.randomUUID()}`, name, type: file.type, bytes: await file.arrayBuffer(), createdAt: new Date().toISOString() }
  const db = await openDb()
  try {
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(record))
  } finally {
    db.close()
  }
  return toOption(record)
}

export async function deleteCustom(id: string): Promise<void> {
  const db = await openDb()
  try {
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id))
  } finally {
    db.close()
  }
}

/** 播放地址：builtin 静态路径；custom → blob URL（用完调 revoke）；classic / 未知 / 库不可用 → null */
export async function resolveSoundSrc(id: string): Promise<{ src: string; revoke: () => void } | null> {
  const builtin = BUILTIN_SOUNDS.find((s) => s.id === id)
  if (builtin) return builtin.src ? { src: builtin.src, revoke: () => {} } : null
  if (!isIndexedDbAvailable()) return null
  const db = await openDb()
  try {
    const row = (await request(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) as CustomSoundRecord | undefined
    if (!row) return null
    const url = URL.createObjectURL(new Blob([row.bytes], { type: row.type }))
    return { src: url, revoke: () => URL.revokeObjectURL(url) }
  } finally {
    db.close()
  }
}
```
若 happy-dom 的 `File` 没有 `arrayBuffer()`，用 `await new Response(file).arrayBuffer()` 替代那一处。`createdAt` 用 ISO 串按字典序排序，同一毫秒内连续 `saveCustom` 的顺序由 `localeCompare` 稳定性决定——重名用例连存三次，若顺序抖动，在 record 上再加自增 `seq`（`existing.length + 1`）作次级排序键。

- [ ] **Step 5: 跑库用例确认通过**

Run: `bun run test -- src/features/settings/sounds/__tests__/soundLibrary.test.ts`
Expected: PASS（7 条）。

- [ ] **Step 6: `settingsStore` + `sessionScope`**

`settingsStore.ts`：`SettingsState` 在 `soundVolume: number` 之后加 `/** 收到消息 / 通知时播放的提示音 id（soundLibrary 的 SoundOption.id）；设备级 */ notificationSound: string`，`defaultSettings` 加 `notificationSound: 'water'`。
`sessionScope.ts` 的 `DEVICE_SCOPED_SETTING_FIELDS` 在 `'soundVolume',` 之后加 `'notificationSound',`，并在上方注释的「主题、语言、12/24 小时制、动效、通知、音量、粒子背景」里补上「提示音」。
`src/lib/__tests__/sessionScope.test.ts` 的字段同源用例按表遍历，不用改。

- [ ] **Step 7: 写 `SoundManager` 失败用例 `src/hooks/__tests__/useSound.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveSoundSrc } = vi.hoisted(() => ({ resolveSoundSrc: vi.fn() }))
vi.mock('@/features/settings/sounds/soundLibrary', () => ({ resolveSoundSrc }))

/** 可观测的 Audio / AudioContext 桩：Audio 记录 src 与 play；AudioContext 记录振荡器数量（= 合成音走了） */
const audios: Array<{ src: string; volume: number; play: ReturnType<typeof vi.fn> }> = []
let oscillators = 0
let playRejects = false
class FakeAudio {
  volume = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn(() => (playRejects ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()))
  constructor(public src: string) { audios.push(this) }
  addEventListener(type: string, cb: () => void) { if (type === 'ended') this.onended = cb; if (type === 'error') this.onerror = cb }
}
class FakeAudioContext {
  currentTime = 0
  state = 'running'
  destination = {}
  resume() {}
  createOscillator() { oscillators += 1; return { type: 'sine', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} } }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} } }
}

beforeEach(() => {
  audios.length = 0
  oscillators = 0
  playRejects = false
  resolveSoundSrc.mockReset()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  localStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('SoundManager 的提示音选择', () => {
  it('notificationSound=water：playMessage 走文件（Audio(/sounds/water.mp3) + 音量 = 主音量），不走合成音', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled, setSoundVolume } = await import('../useSound')
    setSoundEnabled(true)
    setSoundVolume(0.3)
    setNotificationSound('water')
    resolveSoundSrc.mockResolvedValue({ src: '/sounds/water.mp3', revoke: vi.fn() })
    playMessage()
    await flush()
    expect(resolveSoundSrc).toHaveBeenCalledWith('water')
    expect(audios.map((a) => a.src)).toEqual(['/sounds/water.mp3'])
    expect(audios[0].volume).toBeCloseTo(0.3)
    expect(audios[0].play).toHaveBeenCalledTimes(1)
    expect(oscillators).toBe(0)
  })
  it('notificationSound=classic：走合成音（message 配置两段音 → 两个振荡器），不建 Audio（正对照）', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    setNotificationSound('classic')
    playMessage()
    await flush()
    expect(resolveSoundSrc).not.toHaveBeenCalled()
    expect(audios).toHaveLength(0)
    expect(oscillators).toBe(2)
  })
  it('文件播放失败（play reject）回退合成音；resolve 给 null（自定义音被删）也回退', async () => {
    const { playNotification, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    setNotificationSound('custom-x')
    resolveSoundSrc.mockResolvedValue({ src: 'blob:x', revoke: vi.fn() })
    playRejects = true
    playNotification()
    await flush()
    expect(audios).toHaveLength(1)
    expect(oscillators).toBe(2)
    resolveSoundSrc.mockResolvedValue(null)
    playNotification()
    await flush()
    expect(oscillators).toBe(4)
  })
  it('播放结束调 revoke（blob URL 不泄漏）', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    setNotificationSound('custom-x')
    const revoke = vi.fn()
    resolveSoundSrc.mockResolvedValue({ src: 'blob:x', revoke })
    playMessage()
    await flush()
    expect(revoke).not.toHaveBeenCalled()
    audios[0].onended?.()
    expect(revoke).toHaveBeenCalledTimes(1)
  })
  it('静音时既不建 Audio 也不合成', async () => {
    const { playMessage, setNotificationSound, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(false)
    setNotificationSound('water')
    playMessage()
    await flush()
    expect(resolveSoundSrc).not.toHaveBeenCalled()
    expect(audios).toHaveLength(0)
    expect(oscillators).toBe(0)
  })
  it('playFile 直接调用：成功 true，失败 false', async () => {
    const { playFile, setSoundEnabled } = await import('../useSound')
    setSoundEnabled(true)
    expect(await playFile('/sounds/water.mp3')).toBe(true)
    playRejects = true
    expect(await playFile('/sounds/water.mp3')).toBe(false)
  })
})
```
`useSound.ts` 的单例跨用例共享（模块只求值一次），所以每条用例都显式 `setSoundEnabled / setNotificationSound`，不依赖上一条的状态。

- [ ] **Step 8: 跑用例确认失败**

Run: `bun run test -- src/hooks/__tests__/useSound.test.ts`
Expected: FAIL（`setNotificationSound` 不存在）。

- [ ] **Step 9: 改 `src/hooks/useSound.ts`**

顶部加 `import { resolveSoundSrc } from '@/features/settings/sounds/soundLibrary'`（放在 `'use client'` 之后；文件末尾原有的 `import { useState, … } from 'react'` 顺便挪到顶部，biome 的 import 顺序 lint 才不会新增 warning）。`SoundManager` 里加：
```ts
  /** 收到消息 / 通知时用哪个提示音（soundLibrary 的 id）；'classic' = 合成音 */
  private notificationSound: string = 'water'

  setNotificationSound(id: string): void {
    this.notificationSound = id
  }

  /** 用 HTMLAudioElement 播文件；音量 = 主音量；成功 resolve true，任何失败 false（调用方回退合成音） */
  playFile(src: string, onDone?: () => void): Promise<boolean> {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return Promise.resolve(false)
    return new Promise((resolve) => {
      try {
        const audio = new Audio(src)
        audio.volume = this.volume
        let finished = false
        const done = () => { if (!finished) { finished = true; onDone?.() } }
        audio.addEventListener('ended', done)
        audio.addEventListener('error', () => { done(); resolve(false) })
        audio.play().then(() => resolve(true)).catch(() => { done(); resolve(false) })
      } catch {
        onDone?.()
        resolve(false)
      }
    })
  }

  /** 消息 / 通知：选中音是文件就播文件，失败或选 classic 回退到对应的合成音 */
  async playSelected(fallback: 'message' | 'notification'): Promise<void> {
    if (!this.enabled) return
    if (this.notificationSound === 'classic') { this.play(fallback); return }
    let resolved: { src: string; revoke: () => void } | null = null
    try { resolved = await resolveSoundSrc(this.notificationSound) } catch { resolved = null }
    if (!resolved) { this.play(fallback); return }
    const ok = await this.playFile(resolved.src, resolved.revoke)
    if (!ok) this.play(fallback)
  }
```
导出改为：
```ts
export const playNotification = () => { void getSoundManager().playSelected('notification') }
export const playMessage = () => { void getSoundManager().playSelected('message') }
export const setNotificationSound = (id: string) => getSoundManager().setNotificationSound(id)
export const playFile = (src: string) => getSoundManager().playFile(src)
```
（`useSound()` hook 返回对象里的 `playNotification / playMessage` 引用的就是这两个常量，不用改。）

- [ ] **Step 10: 跑 manager 用例确认通过**

Run: `bun run test -- src/hooks/__tests__/useSound.test.ts`
Expected: PASS（6 条）。

- [ ] **Step 11: `SettingsSync` 接线（`src/app/root.tsx`）**

`import { setNotificationSound, setSoundEnabled, setSoundVolume } from '@/hooks/useSound'`（原来只导入前两个）；`SettingsSync` 里加 `const notificationSound = useSettingsStore((s) => s.notificationSound)` 与
```ts
  useEffect(() => {
    setNotificationSound(notificationSound)
  }, [notificationSound])
```

- [ ] **Step 12: i18n（zh / en，`shell.settings` 里追加 `sounds` 对象）**

zh：
```ts
      sounds: {
        title: '提示音', hint: '收到消息或通知时播放；选中即试听', water: '水滴（内置）', classic: '经典（合成音）', custom: '自定义',
        preview: '试听', stop: '停止', del: '删除', confirm: '确认', cancel: '取消', upload: '上传自定义提示音', uploading: '上传中…',
        errType: '只支持 MP3（audio/mpeg）', errSize: '文件不能超过 2 MB', errUnavailable: '当前浏览器无法保存自定义提示音（隐私模式？）',
        loadFailed: '提示音列表加载失败', deleteFailed: '删除失败',
      },
```
en：
```ts
      sounds: {
        title: 'Notification sound', hint: 'Played on new messages and notifications; selecting previews it', water: 'Water drop (built-in)', classic: 'Classic (synthesized)', custom: 'Custom',
        preview: 'Preview', stop: 'Stop', del: 'Delete', confirm: 'Confirm', cancel: 'Cancel', upload: 'Upload custom sound', uploading: 'Uploading…',
        errType: 'Only MP3 (audio/mpeg) is supported', errSize: 'File must be 2 MB or smaller', errUnavailable: 'This browser cannot store custom sounds (private mode?)',
        loadFailed: 'Failed to load sounds', deleteFailed: 'Failed to delete',
      },
```

- [ ] **Step 13: 写选择器失败用例 `src/components/shell/settings/__tests__/SoundSelector.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { SoundSelector } from '../SoundSelector'

const lib = vi.hoisted(() => ({
  listCustom: vi.fn(), saveCustom: vi.fn(), deleteCustom: vi.fn(), resolveSoundSrc: vi.fn(), isIndexedDbAvailable: vi.fn(() => true),
}))
vi.mock('@/features/settings/sounds/soundLibrary', async () => {
  const actual = await vi.importActual<typeof import('@/features/settings/sounds/soundLibrary')>('@/features/settings/sounds/soundLibrary')
  return { ...actual, ...lib }
})
const sound = vi.hoisted(() => ({ playSound: vi.fn() }))
vi.mock('@/hooks/useSound', () => ({ playSound: sound.playSound }))
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

const audios: Array<{ src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }> = []
class FakeAudio {
  volume = 1
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  addEventListener() {}
  constructor(public src: string) { audios.push(this) }
}
const CUSTOM = { id: 'custom-1', name: 'Ding', kind: 'custom' as const, src: null }

beforeEach(() => {
  audios.length = 0
  sound.playSound.mockClear()
  lib.isIndexedDbAvailable.mockReturnValue(true)
  lib.listCustom.mockResolvedValue([CUSTOM])
  lib.resolveSoundSrc.mockImplementation(async (id: string) => (id === 'water' ? { src: '/sounds/water.mp3', revoke: () => {} } : id === 'custom-1' ? { src: 'blob:ding', revoke: () => {} } : null))
  lib.saveCustom.mockResolvedValue({ id: 'custom-2', name: 'Dong', kind: 'custom', src: null })
  lib.deleteCustom.mockResolvedValue(undefined)
  vi.stubGlobal('Audio', FakeAudio)
  useSettingsStore.setState({ notificationSound: 'water', soundVolume: 0.5 })
})
afterEach(() => vi.unstubAllGlobals())

describe('SoundSelector', () => {
  it('列出内置两项 + 自定义；当前选中 water', async () => {
    render(<SoundSelector />)
    expect(await screen.findByRole('radio', { name: 'Ding' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '水滴（内置）' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '经典（合成音）' })).not.toBeChecked()
  })
  it('选中即写 store 并试听（文件用 Audio；classic 用合成音）', async () => {
    render(<SoundSelector />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Ding' }))
    expect(useSettingsStore.getState().notificationSound).toBe('custom-1')
    await waitFor(() => expect(audios.map((a) => a.src)).toEqual(['blob:ding']))
    fireEvent.click(screen.getByRole('radio', { name: '经典（合成音）' }))
    expect(useSettingsStore.getState().notificationSound).toBe('classic')
    expect(sound.playSound).toHaveBeenCalledWith('message')
  })
  it('试听按钮播放 ⇄ 停止', async () => {
    render(<SoundSelector />)
    await screen.findByRole('radio', { name: 'Ding' })
    fireEvent.click(screen.getAllByRole('button', { name: '试听' })[0])
    await waitFor(() => expect(audios).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: '停止' }))
    expect(audios[0].pause).toHaveBeenCalled()
  })
  it('上传：saveCustom 收到文件，新项出现并被选中；类型错误显示文案', async () => {
    render(<SoundSelector />)
    await screen.findByRole('radio', { name: 'Ding' })
    const input = screen.getByLabelText('上传自定义提示音') as HTMLInputElement
    expect(input.accept).toBe('audio/mpeg')
    const file = new File([new Uint8Array(10)], 'Dong.mp3', { type: 'audio/mpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(lib.saveCustom).toHaveBeenCalledWith(file))
    expect(await screen.findByRole('radio', { name: 'Dong' })).toBeChecked()
    expect(useSettingsStore.getState().notificationSound).toBe('custom-2')
    const { SoundLibraryError } = await vi.importActual<typeof import('@/features/settings/sounds/soundLibrary')>('@/features/settings/sounds/soundLibrary')
    lib.saveCustom.mockRejectedValueOnce(new SoundLibraryError('type', 'x'))
    fireEvent.change(input, { target: { files: [new File([''], 'a.wav', { type: 'audio/wav' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('只支持 MP3（audio/mpeg）')
  })
  it('删除自定义两步确认；删掉的是选中项时回到 water', async () => {
    useSettingsStore.setState({ notificationSound: 'custom-1' })
    render(<SoundSelector />)
    await screen.findByRole('radio', { name: 'Ding' })
    expect(screen.getAllByRole('button', { name: '删除' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(lib.deleteCustom).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(lib.deleteCustom).toHaveBeenCalledWith('custom-1'))
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Ding' })).toBeNull())
    expect(useSettingsStore.getState().notificationSound).toBe('water')
  })
  it('IndexedDB 不可用：隐藏上传按钮、显示提示，内置项照常', async () => {
    lib.isIndexedDbAvailable.mockReturnValue(false)
    lib.listCustom.mockResolvedValue([])
    render(<SoundSelector />)
    expect(await screen.findByRole('radio', { name: '水滴（内置）' })).toBeInTheDocument()
    expect(screen.queryByLabelText('上传自定义提示音')).toBeNull()
    expect(screen.getByText(/当前浏览器无法保存自定义提示音/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 14: 跑用例确认失败**

Run: `bun run test -- src/components/shell/settings/__tests__/SoundSelector.test.tsx`
Expected: FAIL（找不到 `../SoundSelector`）。

- [ ] **Step 15: 写 `src/components/shell/settings/SoundSelector.tsx`**

```tsx
import { Play, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ListLoading } from '@/components/shell/ListStates'
import { BUILTIN_SOUNDS, DEFAULT_SOUND_ID, SoundLibraryError, type SoundOption, deleteCustom, isIndexedDbAvailable, listCustom, resolveSoundSrc, saveCustom } from '@/features/settings/sounds/soundLibrary'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { playSound } from '@/hooks/useSound'
import { useI18n } from '@/i18n/I18nProvider'

const NS = 'shell.settings.sounds'

/** 通知分区里的提示音列表（spec §7）。试听走本组件自己的 Audio（与 SoundManager 无关），音量取主音量。 */
export function SoundSelector() {
  const { t } = useI18n()
  const selected = useSettingsStore((s) => s.notificationSound)
  const volume = useSettingsStore((s) => s.soundVolume)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const [custom, setCustom] = useState<SoundOption[] | null>(null)
  const [available] = useState(() => isIndexedDbAvailable())
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const audioRef = useRef<{ el: HTMLAudioElement; revoke: () => void } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listCustom().then((list) => { if (alive) setCustom(list) }).catch((e: unknown) => { if (alive) { setCustom([]); setError(e instanceof Error ? e.message : String(e)) } })
    return () => { alive = false; stop() }
    // 挂载拉一次；stop 引用稳定（不依赖 state）
  }, [])

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.el.pause()
      audioRef.current.revoke()
      audioRef.current = null
    }
    setPlayingId(null)
  }

  const preview = async (id: string) => {
    stop()
    if (id === 'classic') { playSound('message'); return }
    const resolved = await resolveSoundSrc(id).catch(() => null)
    if (!resolved) return
    const el = new Audio(resolved.src)
    el.volume = volume
    el.addEventListener('ended', () => stop())
    el.addEventListener('error', () => stop())
    audioRef.current = { el, revoke: resolved.revoke }
    setPlayingId(id)
    el.play().catch(() => stop())
  }

  const select = (id: string) => {
    setSetting('notificationSound', id)
    void preview(id)
  }

  const libraryMessage = (e: unknown): string => {
    if (e instanceof SoundLibraryError) return t(`${NS}.${e.code === 'type' ? 'errType' : e.code === 'size' ? 'errSize' : 'errUnavailable'}`)
    return e instanceof Error ? e.message : String(e)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const saved = await saveCustom(file)
      setCustom((prev) => [...(prev ?? []), saved])
      select(saved.id)
    } catch (e: unknown) {
      setError(libraryMessage(e))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (id: string) => {
    setConfirmId(null)
    setError(null)
    try {
      await deleteCustom(id)
      setCustom((prev) => (prev ?? []).filter((s) => s.id !== id))
      if (selected === id) setSetting('notificationSound', DEFAULT_SOUND_ID)
      if (playingId === id) stop()
    } catch (e: unknown) {
      setError(`${t(`${NS}.deleteFailed`)}: ${libraryMessage(e)}`)
    }
  }

  const label = (s: SoundOption) => (s.kind === 'builtin' ? t(`${NS}.${s.id}`) : s.name)
  const options = [...BUILTIN_SOUNDS, ...(custom ?? [])]

  return (
    <div className="px-3 pb-3">
      <p className="py-2 text-[12px] text-muted-foreground">{t(`${NS}.hint`)}</p>
      {custom === null ? <ListLoading /> : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {options.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[14px] text-foreground">
                <input type="radio" name="notification-sound" value={s.id} checked={selected === s.id} onChange={() => select(s.id)} aria-label={label(s)} />
                <span className="truncate">{label(s)}</span>
                {s.kind === 'custom' && <span className="rounded-sm bg-[var(--bg-tertiary)] px-1.5 text-[11px] text-muted-foreground">{t(`${NS}.custom`)}</span>}
              </label>
              {playingId === s.id ? (
                <button type="button" className="subtle-btn" aria-label={t(`${NS}.stop`)} onClick={stop}><Square className="h-4 w-4" />{t(`${NS}.stop`)}</button>
              ) : (
                <button type="button" className="subtle-btn" aria-label={t(`${NS}.preview`)} onClick={() => void preview(s.id)}><Play className="h-4 w-4" />{t(`${NS}.preview`)}</button>
              )}
              {s.kind === 'custom' && (confirmId === s.id ? (
                <span className="flex gap-1">
                  <button type="button" className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive" onClick={() => void remove(s.id)}>{t(`${NS}.confirm`)}</button>
                  <button type="button" className="subtle-btn" onClick={() => setConfirmId(null)}>{t(`${NS}.cancel`)}</button>
                </span>
              ) : (
                <button type="button" className="subtle-btn" aria-label={t(`${NS}.del`)} onClick={() => setConfirmId(s.id)}><Trash2 className="h-4 w-4" />{t(`${NS}.del`)}</button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {available ? (
        <label className="subtle-btn mt-2 cursor-pointer">
          <Upload className="h-4 w-4" />{uploading ? t(`${NS}.uploading`) : t(`${NS}.upload`)}
          <input ref={fileRef} type="file" accept="audio/mpeg" className="sr-only" aria-label={t(`${NS}.upload`)} disabled={uploading} onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
      ) : (
        <p className="mt-2 text-[12px] text-app-light">{t(`${NS}.errUnavailable`)}</p>
      )}
      {error && <p className="mt-2 text-[13px] text-destructive" role="alert">{error}</p>}
    </div>
  )
}
```
`stop` 在 `useEffect` 清理里引用但定义在其后：把 `stop` 改成 `useCallback` 并挪到 effect 之前，或把清理逻辑内联（直接操作 `audioRef.current`）。`aria-label` 同时给了 radio 与可见文字：`getByRole('radio', { name })` 取的是 aria-label，两者内容相同。

`NotificationsSection.tsx`：`import { SoundSelector } from './SoundSelector'`，在 `</SettingsGroup>` 之后、`</SettingsSection>` 之前加 `<SoundSelector />`；分区标题下加 `description={t('shell.settings.sounds.title')}` 不必——保持一个分区，列表自带 hint。

- [ ] **Step 16: 跑用例确认通过；全量**

Run: `bun run test -- src/components/shell/settings/__tests__/SoundSelector.test.tsx`
Expected: PASS（6 条）。
Run: `bun run test`
Expected: 全绿（`sessionScope.test.ts` 的字段同源用例会自动覆盖 `notificationSound`）。

- [ ] **Step 17: 变异校验**

| 变异 | 必红 |
|---|---|
| `playSelected` 不判 `classic` 直接 resolve | manager 用例 2 |
| `playFile` 失败不回退 | manager 用例 3 |
| `saveCustom` 不校验大小 | 库用例 4 |
| `resolveSoundSrc` 的 custom 分支不 revoke | 库用例 6 |
| `SoundSelector.remove` 删选中项后不回 water | 选择器用例 5 |
| `SettingsSync` 不同步 `notificationSound` | 无单测钉——在 Task 8 的 e2e 里不覆盖；审阅者对照 root.tsx diff 人工确认 |

- [ ] **Step 18: 门槛与提交**

```bash
bun run typecheck
bun run lint
bun --bun run build
git add package.json bun.lock public/sounds/water.mp3 src/features/settings src/hooks src/app/root.tsx src/lib/sessionScope.ts src/components/shell/settings src/i18n/messages.ts
git commit -m "feat(settings): 通知提示音——内置 water.mp3 + IndexedDB 自定义库 + SoundManager.playFile + 选择器

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 8: 收尾——`CreateGroupDialog` 抽出、修改密码入口、删孤儿、两条延后 Minor、e2e 收口与全部门槛（spec §8 / §10.8 / §11）

**Files:**
- Create: `src/features/chat/components/sidebar/CreateGroupDialog.tsx` + Test: `src/features/chat/components/sidebar/__tests__/CreateGroupDialog.test.tsx`
- Modify: `src/features/chat/components/sidebar/GroupList.tsx`（删内嵌对话框与 `initialCreateOpen` / `dialogOnly`）、`src/features/chat/components/sidebar/__tests__/GroupList.test.tsx`（建群 describe 迁走，留一条开关 smoke）、`src/components/shell/ContactsList.tsx`（`?add=create-group` 只渲染对话框）、`src/components/shell/__tests__/ContactsList.test.tsx`（探针改造）
- Modify: `src/components/shell/settings/AccountSection.tsx`（修改密码行）+ Test: `src/components/shell/settings/__tests__/AccountSection.test.tsx`（新建）
- Delete: `src/features/settings/components/SettingsModal.tsx`；Modify: `src/types/models.ts`（删 `Friend`）
- Modify: `src/lib/routes.ts`（`chatPath` 编码）+ `src/lib/__tests__/routes.test.ts`；`src/features/chat/lib/__tests__/formatMessageTime.test.ts`（边界用例）
- Modify: `tests/chat.spec.ts`（新增一条 e2e）、`src/i18n/messages.ts`（`shell.settings.changePassword / changePasswordHint / open`）

**Interfaces:**
- Produces: `CreateGroupDialog({ open, onClose, onCreated? }: { open: boolean; onClose: () => void; onCreated?: () => void })`（命名导出）。`GroupList` 的 props 变回 `{ subTab, searchQuery }`。

- [ ] **Step 1: 抽出对话框——先写它的用例 `src/features/chat/components/sidebar/__tests__/CreateGroupDialog.test.tsx`**

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateGroupDialog } from '../CreateGroupDialog'

const { createGroup, toastMock } = vi.hoisted(() => ({ createGroup: vi.fn(), toastMock: vi.fn() }))
vi.mock('@/features/chat/store/groupStore', () => ({ useGroupStore: () => ({ createGroup }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }), toast: toastMock }))
// framer-motion 直通（与 GroupList.test.tsx 同一个理由：happy-dom 的 Animation.cancel 会在卸载时抛 AbortError）
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const passthrough = (tag: string) => ({ children, initial: _i, animate: _a, exit: _e, variants: _v, transition: _t, layout: _l, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement(tag, rest, children)
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: new Proxy({}, { get: (_t, tag: string) => passthrough(tag) }) }
})
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

beforeEach(() => { createGroup.mockReset().mockResolvedValue({ group_id: 'g1', group_name: 'x', created_at: '' }); toastMock.mockClear() })
afterEach(() => vi.restoreAllMocks())

describe('CreateGroupDialog', () => {
  it('open=false 什么都不渲染；open=true 显示表单，群名为空时「创建」禁用', () => {
    const { rerender } = render(<CreateGroupDialog open={false} onClose={() => {}} />)
    expect(screen.queryByRole('heading', { name: '创建群聊' })).toBeNull()
    rerender(<CreateGroupDialog open onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: '创建群聊' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建' })).toBeDisabled()
  })
  it('默认需要审核：createGroup(name, undefined, true)；成功后 toast、onCreated、onClose', async () => {
    const onClose = vi.fn()
    const onCreated = vi.fn()
    render(<CreateGroupDialog open onClose={onClose} onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('群名称 *'), { target: { value: ' 我的群聊 ' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith('我的群聊', undefined, true))
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: '成功' }))
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('选「无需审核」→ 第三个实参 false；描述非空时原样传', async () => {
    render(<CreateGroupDialog open onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('群名称 *'), { target: { value: '读书会' } })
    fireEvent.change(screen.getByLabelText('群描述（可选）'), { target: { value: '每周一本' } })
    fireEvent.change(screen.getByLabelText('入群审核'), { target: { value: 'open' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith('读书会', '每周一本', false))
  })
  it('失败：destructive toast，不关闭', async () => {
    createGroup.mockRejectedValueOnce(new Error('群名重复'))
    const onClose = vi.fn()
    render(<CreateGroupDialog open onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('群名称 *'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: '群名重复' })))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '创建群聊' })).toBeInTheDocument()
  })
  it('「取消」与遮罩点击都 onClose', () => {
    const onClose = vi.fn()
    render(<CreateGroupDialog open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```
`getByLabelText('群名称 *')` 这些 label 文案取自 `chat.groupList.groupNameRequired / groupDescOptional / joinApprovalLabel` 的真实中文（打开 `src/i18n/messages.ts` 的 `chat.groupList` 核对，不同就改测试里的字面量——期望必须是字典里的原文）；`label` 要与 `Input` 关联：给 `Input` 加 `id` 并让 `<label htmlFor>` 指向它（原 GroupList 里的 label 没有 htmlFor，抽出时补上）。

- [ ] **Step 2: 跑用例确认失败；写 `CreateGroupDialog.tsx`**

Run: `bun run test -- src/features/chat/components/sidebar/__tests__/CreateGroupDialog.test.tsx` → FAIL（找不到模块）。

`src/features/chat/components/sidebar/CreateGroupDialog.tsx`：把 `GroupList.tsx` 里 `dialogVariants`（第 55 行起）、建群四个 state（第 123–130 行）、`handleCreateGroup`（第 284–314 行）、对话框 JSX（第 603–703 行的 `createPortal(...)`）**逐行搬过来**，只做这些改动：
- 组件签名 `export function CreateGroupDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void })`；`showCreateDialog` 换成 prop `open`；所有 `setShowCreateDialog(false)` 换成 `onClose()`；成功分支在 `onClose()` 之前调 `onCreated?.()`。
- 三个 `<label>` 加 `htmlFor`，对应 `Input` / `select` 加 `id`：`create-group-name`、`create-group-desc`、`create-group-join-approval`（第三个已有）。
- 依赖：`useState` / `createPortal` / `motion, AnimatePresence, Variants` / `Loader2` / `Button` / `Input` / `useToast` / `useGroupStore`（只取 `createGroup`）/ `useI18n`。
- 遮罩 `onClick={onClose}`，对话框内 `stopPropagation` 保留。

`GroupList.tsx`：删 `dialogVariants`、四个建群 state 里除 `showCreateDialog` 外的三个、`handleCreateGroup`、整段 `createPortal(...)`、`interface GroupListProps` 的 `initialCreateOpen` / `dialogOnly` 及其注释、`{!dialogOnly && (` 那层包装；在主列表 JSX 末尾（原 `createPortal` 位置）放 `<CreateGroupDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />`。删掉因此不再使用的 import（`createPortal`、`Input`、`Variants`——用 `bun run lint` 与 `bun run typecheck` 的 unused 报告核对，`AnimatePresence` / `motion` / `Loader2` 在列表部分仍在用）。

`GroupList.test.tsx`：删除「GroupList 建群对话框：join_mode 五档 → join_approval_required 布尔」整个 describe（三条已由新文件覆盖），换成一条：
```tsx
describe('GroupList 建群入口', () => {
  it('点「创建群聊」打开对话框（表单标题出现），再点取消关闭', async () => {
    render(<GroupList subTab="main" searchQuery="" />)
    fireEvent.click(await screen.findByText('chat.groupList.createGroup'))
    expect(await screen.findByRole('heading', { name: 'chat.groupList.createGroup' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('chat.groupList.cancel'))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'chat.groupList.createGroup' })).toBeNull())
  })
})
```
（该文件的 `t` 是回显 key 的旧 mock，这条只测开关，不测文案。）

`ContactsList.tsx`：`import { CreateGroupDialog } from '@/features/chat/components/sidebar/CreateGroupDialog'`；`addPanel` 改为：
```tsx
  const addPanel = add === 'create-group' ? (
    // 建群只是一个对话框（终审 finding #4）：不渲染 GroupList 主列表，关闭即清 add 参数
    <CreateGroupDialog open onClose={closeAdd} />
  ) : add && (
    <div className="mb-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
      <div className="mb-1 flex justify-end">…（原样）…</div>
      {add === 'friend' && <FriendList subTab="new" searchQuery="" />}
      {add === 'join-group' && <GroupList subTab="join" searchQuery="" />}
    </div>
  )
```
`ContactsList.test.tsx`：GroupList 探针改回 `(p: { subTab: string }) => <div data-testid="group-list" data-subtab={p.subTab} />`；新增 `vi.mock('@/features/chat/components/sidebar/CreateGroupDialog', () => ({ CreateGroupDialog: (p: { open: boolean; onClose: () => void }) => <div data-testid="create-group-dialog" data-open={String(p.open)}><button type="button" onClick={p.onClose}>close-dialog</button></div> }))`；「?add=…」那条用例的 create-group 段改为：
```tsx
    renderAt('/app/contacts?tab=groups&add=create-group')
    expect(screen.getByTestId('create-group-dialog')).toHaveAttribute('data-open', 'true')
    // 只渲染对话框：主列表探针不出现（正对照：上面 join-group 那次 group-list 是出现的）
    expect(screen.queryByTestId('group-list')).toBeNull()
    fireEvent.click(screen.getByText('close-dialog'))
    expect(testRouter?.state.location.search).toBe('?tab=groups')
```
（`renderAt` 若没有暴露 router，照 `ProfileView.test.tsx` 的 `testRouter` 写法改一下。）

Run: `bun run test -- src/features/chat/components/sidebar src/components/shell/__tests__/ContactsList.test.tsx` → PASS。

- [ ] **Step 3: 修改密码入口 + `AccountSection` 用例**

i18n `shell.settings` 追加：zh `changePassword: '修改密码', changePasswordHint: '在资料对话框中修改', open: '前往'`；en `changePassword: 'Change password', changePasswordHint: 'Change it in the profile dialog', open: 'Open'`。

`AccountSection.tsx`：`import { KeyRound, LogOut } from 'lucide-react'`、`import { NavLink } from 'react-router'`、`import { ROUTES } from '@/lib/routes'`；「账户」分区的 `SettingsGroup` 里在退出登录行**之前**加：
```tsx
          <SettingsRow icon={<KeyRound className="h-4 w-4" />} title={t('shell.settings.changePassword')} subtitle={t('shell.settings.changePasswordHint')}
            right={<NavLink to={ROUTES.app.profile} className="subtle-btn">{t('shell.settings.open')}</NavLink>} />
```
用例 `src/components/shell/settings/__tests__/AccountSection.test.tsx`（隐私区 / 设备区 / 黑名单面板换探针，只测本分区自己的行）：
```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AccountSection } from '../AccountSection'

vi.mock('@/features/settings/components/PrivacySettings', () => ({ default: () => <div data-testid="privacy" /> }))
vi.mock('@/features/settings/components/DevicesPage', () => ({ default: () => <div data-testid="devices" /> }))
vi.mock('../BlacklistPanel', () => ({ BlacklistPanel: () => <div data-testid="blacklist" /> }))
vi.mock('@/i18n/I18nProvider', async () => {
  const { messages } = await import('@/i18n/messages')
  const t = (key: string) => {
    const value = key.split('.').reduce<unknown>((acc, segment) => {
      if (!acc || typeof acc !== 'object') return undefined
      return (acc as Record<string, unknown>)[segment]
    }, messages['zh-CN'] as unknown)
    return typeof value === 'string' ? value : key
  }
  return { useI18n: () => ({ locale: 'zh-CN', t }) }
})

describe('AccountSection', () => {
  it('四个分区都在：隐私 / 设备 / 黑名单 / 账户；修改密码行链接到 /app/profile', () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <AccountSection /> }], { initialEntries: ['/app/settings/account'] })} />)
    expect(screen.getByTestId('privacy')).toBeInTheDocument()
    expect(screen.getByTestId('devices')).toBeInTheDocument()
    expect(screen.getByTestId('blacklist')).toBeInTheDocument()
    expect(screen.getByText('黑名单')).toBeInTheDocument()
    expect(screen.getByText('修改密码')).toBeInTheDocument()
    expect(screen.getByText('在资料对话框中修改')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '前往' })).toHaveAttribute('href', '/app/profile')
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument()
  })
})
```
Run: `bun run test -- src/components/shell/settings/__tests__/AccountSection.test.tsx` → PASS。

- [ ] **Step 4: 删孤儿（先证明零引用）**

```bash
grep -rn "SettingsModal" src server tests
grep -rn "types/models" src server tests
```
Expected：第一条只命中 `src/features/settings/components/SettingsModal.tsx` 自身；第二条只命中两处**注释**（`src/features/chat/api/groupMessages.ts:75`、`src/lib/apiParse.ts:8`），没有 `import`。然后：
```bash
git rm src/features/settings/components/SettingsModal.tsx
```
`src/types/models.ts`：删掉 `Friend` 接口及其 JSDoc（第 19–37 行附近「Friend Information…」那段）。文件里其余接口本期不动（`GroupMessage` 的收敛是 `groupMessages.ts:75` 记着的独立待办）。若删掉后 `bun run typecheck` 报别处引用 `Friend`（不该有），说明 grep 漏了——停下来看，不要把它加回去。

- [ ] **Step 5: 两条延后 Minor**

`src/lib/routes.ts`：`export const chatPath = (conversationId: string): string => \`${ROUTES.app.chat}/${encodeURIComponent(conversationId)}\``。`src/lib/__tests__/routes.test.ts` 第 9 行之后加 `expect(chatPath('f-a b/c')).toBe('/app/chat/f-a%20b%2Fc')`。（会话 id 现在是 `f-<uid>` / `g-<gid>`，与 `contactFriendPath` 同规则；`useRouteConversation` 读 `useParams()` 得到的是已解码值，不需要改读侧。）

`src/features/chat/lib/__tests__/formatMessageTime.test.ts` 追加：
```ts
  it('零点边界：现在 00:01，昨天 23:59 是「昨天」，今天 00:00 是「00:00」', () => {
    const now = new Date(2026, 8, 10, 0, 1)
    expect(formatMessageTime(at(2026, 9, 9, 23, 59), now)).toBe('昨天 23:59')
    expect(formatMessageTime(at(2026, 9, 10, 0, 0), now)).toBe('00:00')
  })
  it('七天边界：6 天前是「周X」，整 7 天前是「M/D」', () => {
    expect(formatMessageTime(at(2026, 9, 4, 8, 0), NOW)).toBe('周五 08:00')
    expect(formatMessageTime(at(2026, 9, 3, 8, 0), NOW)).toBe('9/3 08:00')
  })
  it('未来时间（客户端时钟落后）按今天显示 HH:mm，不显示负天数', () => {
    expect(formatMessageTime(at(2026, 9, 11, 9, 0), NOW)).toBe('09:00')
  })
```
（2026-09-04 是周五、09-03 是周四：`NOW` 是 09-10 周四，6 天前 = 周五 ✓。）

Run: `bun run test -- src/lib/__tests__/routes.test.ts src/features/chat/lib/__tests__/formatMessageTime.test.ts` → PASS。

- [ ] **Step 6: e2e 用例（`tests/chat.spec.ts` 的 describe 末尾追加）**

```ts
  test('设置六个分区可达；授权页缺参数显示错误页而不跳转', async ({ page }, testInfo) => {
    await mockListEndpoints(page, [], [])
    await page.route('**/api/oauth/grants', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, data: [] }) }))
    await page.route('**/api/friends/blacklist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, data: [] }) }))
    await page.goto(`${BASE_URL}/app/settings/appearance`)
    await expect(page).toHaveURL(/\/app\/settings\/appearance$/)
    const isMobile = testInfo.project.name === 'mobile'
    // 折叠视口下分区列表在 /app/settings 索引页；桌面在列表栏。逐个分区点过去，内容区出现分区标题。
    const sections: Array<[string, RegExp, RegExp]> = [
      ['appearance', /^外观$|^Appearance$/, /主题配色|Color scheme/],
      ['notifications', /通知与提醒|Notifications/, /提示音|Notification sound/],
      ['account', /账户与安全|Account & security/, /黑名单|Blocked users/],
      ['apps', /授权与应用|Apps & access/, /已授权应用|Authorized apps/],
      ['ai', /^AI 配置$|^AI$/, /AI/],
      ['about', /^关于$|^About$/, /版本|Version/],
    ]
    for (const [key, linkName, contentText] of sections) {
      if (isMobile) await page.goto(`${BASE_URL}/app/settings`)
      await page.getByRole('link', { name: linkName }).first().click()
      await expect(page).toHaveURL(new RegExp(`/app/settings/${key}$`))
      await expect(page.getByTestId('content-column').getByText(contentText).first()).toBeVisible()
    }
    await page.goto(`${BASE_URL}/app/oauth/authorize?redirect_uri=%2Fapps%2Fx%2Fcb`)
    await expect(page.getByText(/无效的授权请求|Invalid authorization request/)).toBeVisible()
    await expect(page).toHaveURL(/\/app\/oauth\/authorize\?redirect_uri=/)
  })
```
`content-column` 这个 testid 在 `AppShell.tsx` 里（上面的 e2e 已用）；折叠视口下 `/app/settings/<key>` 的内容区是否也叫 `content-column`——看 `AppShell.tsx:59` 一带，若折叠时是另一个 testid，改成对应的。`ai` 分区的内容文案取 `AiSection` 里第一行标题（打开文件核对后把 `/AI/` 换成确切文案的双语正则）。

- [ ] **Step 7: 全部门槛（按顺序，全部通过才提交）**

```bash
bun run test
bun run typecheck
bun run lint
bun --bun run build
bun run test:e2e
```
Expected：vitest 全绿；typecheck 0 错误；lint **≤ 158 warnings / ≤ 22 infos / 0 errors**（把实际数字写进 commit message）；build 成功；e2e 三个 project（chromium / mobile / production）全绿。e2e 失败时先看是不是 `en-US` 文案没写双语正则或 Vite dev 并发 flake（`playwright.config.ts` 文档化过），修正后**只重跑失败的 spec**，最后再整体跑一次。

- [ ] **Step 8: 提交**

```bash
git add -A src tests
git status --short
```
确认 `git status` 里没有 `.superpowers/`、`build/`、`playwright-report/`、`test-results/`、`.claude/`（它们应是 untracked 且被忽略；若出现在待提交列表，`git restore --staged <path>`）。
```bash
git commit -m "refactor(chat): CreateGroupDialog 抽出；设置加修改密码入口；删 SettingsModal 与死 Friend 副本；chatPath 编码；formatMessageTime 边界用例；e2e 收口

lint: <N> warnings / <M> infos / 0 errors（基线 158 / 22）；e2e chromium+mobile+production 全绿

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 自查记录（写计划时已做）

1. **spec 覆盖**：§3 URL 表 → Task 4（`apps`）、Task 5（miniapps tab）、Task 6（authorize 路由 + `next`）、Task 3（ProfileView 按钮）；§4.1–4.3 → Task 1 / 2；§5 → Task 3；§6.1–6.4 → Task 4 / 5 / 6；§7 → Task 7；§8 → Task 8（四件事 + 两条 Minor）；§9 持久化表 → Task 2（`huanvae.theme` 设备级）、Task 7（`notificationSound` 设备级、IndexedDB 注释）、Task 3（`registerPristineStoreReset` 覆盖 blacklist）；§11 每条测试要求都能指到具体用例；§12 的开放问题（`next`）在 Task 6 以 Ruling 关闭。
2. **与 spec 的三处偏差（已回写进 spec，同一个 commit）**：`borderOpacity` 默认 0.6 / 范围 0.1–0.8 与 `--blur-*` 的 Web 比例（§4.1 / §4.2，理由：默认输出必须逐键等于上期静态 CSS，这是 §1 的完成判定）；i18n 命名空间 `shell.settings.themeEditor.*`（§4.3，`shell.settings.theme` 已是字符串）；§11「改主色后 `--neutral-*` 不变」改为「`--accent-*` 不变」（APP 生成器的中性色阶取主色色相，改主色时它本来就会变）。
3. **类型一致性**：`BlacklistedUser`（Task 3）被 BlacklistPanel / friendsStore 同名使用；`OAuthGrant / OAuthClient / AuthorizeResult / scopeLabelKey`（Task 4）被 Task 5 / 6 按同名同签名消费；`isValidRedirectUri`（Task 5）被 Task 6 复用；`buildSnapshot / ThemeSnapshot / CssVariables`（Task 1）被 Task 2 消费；`setNotificationSound / playFile`（Task 7）被 `SettingsSync` 消费；`arrayOf`（Task 3）被 Task 4 复用。
4. **占位符扫描**：无 TBD / TODO / "similar to"；每个代码步骤都给了完整代码或逐行搬迁指令（Task 8 的 `CreateGroupDialog` 是从 `GroupList.tsx` 指定行号逐行搬，改动点已列全）。

## 执行提示（给控制器）

- 任务间依赖是线性的（1→2，3 独立，4→5→6，7 独立，8 收口）；Task 3 与 Task 7 可以在 Task 2 之后任意顺序执行，但**不要并行派发**实现者（同一分支）。
- 实现者模型：Task 1 / 5 / 8 转写为主可用较低档；Task 2 / 3 / 6 / 7 涉及多文件接线与 happy-dom 行为验证，用标准档；终审用最高档。
- 上期延后的 28 条 Minor 与 12 条 Ruling 在 `.superpowers/sdd/2026-09-10-app-shell-alignment/progress.md`；本期新 ledger 建在 `.superpowers/sdd/2026-09-11-settings-completion/progress.md`。
