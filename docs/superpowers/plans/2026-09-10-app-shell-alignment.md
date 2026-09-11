# Web 对齐 APP · 第 1 期：壳与视觉（App Shell）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Web 的 `/app/*` 改成 APP 的单页三栏壳（侧栏 / 统一会话列表 / 内容区）与 APP 的视觉 token，旧路由全部重定向、旧页面删除，桌面端打开 `/app/chat` 看到的就是 APP。

**Architecture:** 新增布局路由 `app-shell.tsx` 承载全部受保护页面；URL 是「选中了什么」的唯一真值（`/app/chat/:conversationId`、`/app/contacts/friends/:userId`、`/app/settings/:section`、带 URL 的模态框）；统一会话列表由 `friendsStore × groupStore × chatStore.unreadSummary × pinned` 派生；APP 的 `variables.css` 语义 token 进 Tailwind `@theme` 并把 shadcn 变量别名到它，59 个基础组件不改代码换皮。按「token → 列表组件 → 壳与聊天主路径 → 联系人 → 设置 → 模态框 → 拖拽钉住 → 折叠 → 重定向与删除」的顺序，每步独立可上线。

**Tech Stack:** React 19 + React Router 8.3 框架模式（`src/app/routes.ts` 配置式路由）、Tailwind v4 + shadcn（`src/components/ui`）、zustand 5、framer-motion 12、lucide-react、`@dnd-kit/core ^6.3.1` + `@dnd-kit/sortable ^10.0.0` + `@dnd-kit/utilities ^3.2.2`（APP 同款，第 9 步引入）、vitest 5 + @testing-library/react（happy-dom）、Playwright（只在第 11 步跑一次）。

**Spec:** `docs/superpowers/specs/2026-09-10-app-shell-alignment-design.md`（spec 是权威；本计划与 spec 冲突时以 spec 为准并在账本记裁决）。

## Global Constraints

- 运行环境：`bun 1.3.14`；`react-router dev/build` 在本机由 Node 24 执行，**Docker 镜像里由 Bun 执行**——`vite.config.ts` 顶层不得静态 import 任何 Bun 1.3 没有的 Node 内建模块（历史教训：`node:sqlite`）。每个任务的门禁都跑 `bun --bun run build`，它在本机复现 Docker 的构建路径。
- 门禁（每个任务提交前）：`bunx tsc --noEmit` 0 错误；`bun run lint` 0 错误、warning/info **不高于基线 163 / 22**（删代码可以降低，不能升高）；`bun run test` 全绿；`bun --bun run build` 成功。
- **e2e 只在第 11 步跑一次**（`bun run test:e2e`），其它任务禁止运行。已知 vitest 抖动：`ProfilePage.test.tsx` / `PrivacySettings.test.tsx` 偶发超时，只在这两个文件红时重跑一次并如实记录两次结果。
- 提交：中文 Conventional Commits（`feat(shell): …` / `refactor(routes): …`），每条以 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` 结尾；只 `git add` 明确列出的文件，永远不 `git add -A`；`.superpowers/`、`build/`、`.react-router/`、`*.sqlite*` 不进仓。
- 测试纪律（spec §11）：每条「钉住 X」的注释都要有变异表证明（改掉 X 该用例必红）；每条负断言配前置状态或同测试内的正对照；**期望值不得用被测函数拼**（写字面量）；组件测试用 `createMemoryRouter + RouterProvider`（见 `src/components/layout/app-shell/__tests__/Navigation.test.tsx`），不 mock `@/lib/navigation`。
- 文案：用户可见字符串走 `useI18n().t('shell.…')`，新增 key 同时写进 `src/i18n/messages.ts` 的 `zhCN` 与 `enUS`（中文为准，英文可直译）；APP 原文照抄进 zhCN。
- 视觉：颜色/圆角/阴影只用 token（`var(--primary)` 等或 Tailwind 的 `bg-primary`/`text-muted-foreground`），**不写十六进制**；毛玻璃用 `glass-card` / `glass-surface` 工具类。
- URL 与状态：选中态（会话 / 联系人 / 设置分区 / 模态框）只从路由读；`chatStore.selectedConversation` 只由第 5 步的 `useRouteConversation` 写入；任何组件不得再调用 `setActiveTab`。
- 后端契约以 `HuanvaeNeko/backend-docs` 为准，形状不确定时以 APP 的 `src/api/*.ts` 为第二来源，解析器一律严格（缺字段抛 `ApiShapeError`，见 `src/lib/apiEnvelope.ts`）。
- 每个任务只改自己「Files」列出的文件；发现计划缺口先记账本再动手。

---

## 文件结构（本期新增 / 修改 / 删除）

```
src/styles/globals.css                          修改：APP token 进 @theme + :root/.dark，shadcn 别名，glass 工具类
src/lib/routes.ts                               修改：新 ROUTES/路径助手/SETTINGS_SECTIONS/LEGACY_REDIRECTS（旧键第 11 步删）
src/features/chat/lib/conversationId.ts         新建：f-<uid>/g-<gid> 编解码
src/features/chat/lib/formatMessageTime.ts      新建：APP formatMessageTime 移植
src/features/chat/lib/friendName.ts             新建：APP friendDisplayName 移植
src/features/chat/lib/formatUnreadCount.ts      新建：99+ 截断
src/features/chat/store/pinnedStore.ts          新建：置顶会话（账号级 localStorage）
src/features/chat/hooks/useUnifiedConversations.ts  新建：统一会话列表派生
src/components/shell/ListStates.tsx             新建：ListLoading / ListError / ListEmpty
src/components/shell/ConversationCard.tsx       新建
src/components/shell/UnifiedList.tsx            新建（搜索框 + 添加菜单 + 卡片列表 + 右键菜单）
src/components/shell/Sidebar.tsx                新建（头像 / tab / 工具 / 底部）
src/components/shell/sidebarTools.tsx           新建：工具注册表
src/components/shell/SidebarMorePanel.tsx       新建（第 9 步）
src/components/shell/sidebarLayout.ts           新建（第 9 步）：{ pinned, more } 模型 + 持久化
src/components/shell/AppShell.tsx               新建：三栏网格 + 折叠（第 10 步）
src/components/shell/EmptyContent.tsx           新建：APP EmptyChat 移植
src/components/shell/ContactsList.tsx           新建（第 6 步）
src/components/shell/ProfileView.tsx            新建（第 6 步）：对方资料
src/components/shell/settings/{SettingsSection,sections,SettingsSectionList,AppearanceSection,NotificationsSection,AccountSection,AiSection,AboutSection}.tsx  新建（第 7 步）
src/components/shell/RouteDialog.tsx               新建（第 8 步）：带 URL 的模态框壳
src/components/shell/shellTab.ts                   新建（第 8 步）：列表栏 tab 由路径决定，模态框下记住最近 tab
src/components/shell/useShellFold.ts            新建（第 10 步）：matchMedia 三档断点
src/components/shell/shellFold.ts               新建（第 10 步）：isDetailPath / backTargetOf（纯函数）
src/components/shell/MobileTabBar.tsx           新建（第 10 步）：<768 的底部条
src/lib/sessionScope.ts                         修改（第 9 步）：huanvae.sidebar-layout 进设备级名单
src/app/routes/app-shell.tsx                    新建：壳布局路由（数据加载 + AppShell）
src/app/routes/legacy-layout.tsx                新建（第 5 步）→ 第 11 步删除：过渡期包住旧页面的 MainLayout
src/app/routes/shell/chat.tsx                   新建：/app/chat 索引（空态或 Outlet）
src/app/routes/shell/chat.$conversationId.tsx   新建
src/app/routes/shell/contacts.tsx / contacts.friends.$userId.tsx / contacts.groups.$groupId.tsx  新建（第 6 步）
src/app/routes/shell/settings.tsx / settings.$section.tsx   新建（第 7 步）
src/app/routes/shell/profile.tsx / files.tsx / meeting.tsx / bots.tsx / miniapps.tsx / ai-chat.tsx  新建（第 8 步）
src/app/routes/shell/legacy-redirect.tsx        新建（第 11 步）：旧 URL → 新 URL
src/features/bots/api/bots.ts / src/features/miniapps/api/miniapps.ts   新建（第 8 步）
src/app/routes.ts                               修改：分步注册
src/app/routes/protected-layout.tsx             修改：不再包 MainLayout
src/i18n/messages.ts                            修改：shell.* 文案
删除（第 11 步）：src/components/layout/MainLayout.tsx、src/components/layout/app-shell/Navigation.tsx（+测试）、
  src/features/chat/components/ChatPage.tsx、src/features/settings/components/SettingsPage.tsx、
  src/features/profile/components/ProfilePage.tsx（+测试；DevicesPage 以 embedded 模式保留在 account 分区里，不删）、
  src/app/routes/{chat,friends,groups,files,webrtc,devices,settings,profile,ai-chat}.tsx 旧模块、legacy-layout.tsx
```

---

### Task 1: 设计 token 与主题——APP 的 variables.css 进 Tailwind，shadcn 变量别名到它

**Files:**
- Modify: `src/styles/globals.css`
- Modify（把 `hsl(var(--x))` 写法换成 token）: `src/features/chat/components/window/MarkdownEditor.tsx`、`src/features/webrtc/components/VideoMeeting.tsx`、`src/components/ui/sidebar.tsx`、`src/features/auth/components/RegisterForm.tsx`、`src/features/auth/components/LoginForm.tsx`、`src/components/common/LoadingAnimation.tsx`
- Test: `src/styles/__tests__/tokens.test.ts`

**Interfaces:**
- Produces: CSS 变量（`:root` 与 `.dark` 各一套）`--primary --primary-hover --primary-active --primary-subtle --primary-text --accent(-hover/-active/-subtle/-text) --bg-primary --bg-secondary --bg-tertiary --bg-surface --bg-surface-hover --bg-muted --bg-inverse --text-primary --text-secondary --text-muted --text-light --text-inverse --text-link --text-on-color --border-default --border-subtle --border-strong --border-focus --status-{success,warning,error,info}(-subtle) --unread-badge-bg --unread-badge-text --presence-online --presence-dot-ring --glass-border --glass-border-light --glass-border-subtle --glass-white-{90..10} --white-alpha-{97..10} --card-bg-start --card-bg-end --card-bg-hover-start --card-bg-hover-end --card-border --gradient-glass --gradient-glass-hover --blur-{xs,sm,md,lg,xl} --saturate-normal --saturate-high --glass-backdrop --radius-{sm,md,lg,xl,2xl,3xl,full} --shadow-{sm,md,lg,glow,focus} --color-primary-{1..12} --color-accent-{1..12} --color-neutral-{1..12}`；Tailwind 颜色 `bg-background text-foreground bg-card bg-primary text-primary-foreground bg-secondary bg-muted text-muted-foreground bg-accent bg-destructive border-border ring-ring` 全部指向这些 token；工具类 `glass-card`、`glass-surface`、`glass-input`、`subtle-btn`、`app-scrollbar`。
- 后续所有任务只用这些名字。

- [ ] **Step 1: 写失败的测试（读真实 CSS 文本，钉住"别名到 APP token"这件事）**

创建 `src/styles/__tests__/tokens.test.ts`：

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf-8')

/** 取 `selector {` 到下一个顶层 `}` 之间的文本（只用于断言，不解析 CSS） */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`globals.css 里没有 ${selector} 块`)
  const end = css.indexOf('\n}', start)
  return css.slice(start, end)
}

describe('设计 token：APP 的 variables.css 是唯一颜色来源', () => {
  it('shadcn 的语义变量别名到 APP token，而不是自带一套 HSL', () => {
    const theme = block('@theme inline')
    expect(theme).toContain('--color-background: var(--bg-primary)')
    expect(theme).toContain('--color-foreground: var(--text-primary)')
    expect(theme).toContain('--color-card: var(--bg-surface)')
    expect(theme).toContain('--color-primary: var(--primary)')
    expect(theme).toContain('--color-primary-foreground: var(--text-on-color)')
    expect(theme).toContain('--color-muted-foreground: var(--text-muted)')
    expect(theme).toContain('--color-border: var(--border-default)')
    expect(theme).toContain('--color-destructive: var(--status-error)')
    // 正对照：旧的 HSL 三元组写法一处都不能留（它们会让上面的别名指向空值）
    expect(css).not.toMatch(/hsl\(var\(--/)
  })

  it(':root 与 .dark 定义的是同一组 APP token，且值来自 APP 默认主题（生成器输出）', () => {
    const root = block(':root')
    const dark = block('.dark')
    for (const name of ['--primary', '--accent', '--bg-primary', '--bg-secondary', '--text-primary', '--text-muted', '--border-default', '--status-error']) {
      expect(root, `:root 缺 ${name}`).toContain(`${name}:`)
      expect(dark, `.dark 缺 ${name}`).toContain(`${name}:`)
    }
    expect(root).toContain('--primary: #0956c6')
    expect(root).toContain('--bg-primary: #ffffff')
    expect(dark).toContain('--primary: #3c83f7')
    expect(dark).toContain('--bg-primary: #06080c')
    // 正对照：两套值确实不同（否则"暗色"只是复制了一遍浅色）
    expect(root.match(/--bg-primary: (#[0-9a-f]{6})/)?.[1]).not.toBe(dark.match(/--bg-primary: (#[0-9a-f]{6})/)?.[1])
  })

  it('圆角按 APP 的刻度（sm 8 / md 12 / lg 14 / xl 16 / 2xl 22 / 3xl 28）', () => {
    const theme = block('@theme inline')
    expect(theme).toContain('--radius-sm: 8px')
    expect(theme).toContain('--radius-lg: 14px')
    expect(theme).toContain('--radius-3xl: 28px')
  })

  it('全仓源码里不再有 hsl(var(--x)) 写法（换 token 后它们会指向空值，静默失色）', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (entry === '__tests__' || entry === 'node_modules') continue
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(tsx?|css)$/.test(entry) && /hsl\(var\(--/.test(readFileSync(full, 'utf-8'))) offenders.push(full)
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
    // 正对照：扫描确实读到了源码（否则空目录也会绿）
    expect(readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf-8').length).toBeGreaterThan(1000)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/styles 2>&1 | tail -8`
Expected: FAIL —— `--color-background: var(--bg-primary)` 不存在；`hsl(var(--` 有 49 处。

- [ ] **Step 3: 重写 `src/styles/globals.css` 的 token 部分**

把文件开头到 `/* 基础样式 */` 之前（现在的 `@theme inline { … }`、`:root { … }`、`.dark { … }` 三块）**整体替换**为下面的内容（`@import`、`@custom-variant dark` 保留在最前面）：

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* ============================================
   设计 token —— 来源是 APP（huanwei520/Huanvae-Chat-App）的
   src/styles/variables.css + theme/generator.ts 对默认预设的输出。
   两套值（:root 浅色 / .dark 深色）都是生成器实际算出来的，不是手调。
   下面 @theme 只做「别名」：shadcn 的 --color-* 指向这些 token，
   59 个基础组件不改代码就换皮。第 2 期的主题编辑器只需改写这一组变量。
   ============================================ */
@theme inline {
  /* shadcn 语义色 → APP token */
  --color-background: var(--bg-primary);
  --color-foreground: var(--text-primary);
  --color-card: var(--bg-surface);
  --color-card-foreground: var(--text-primary);
  --color-popover: var(--bg-primary);
  --color-popover-foreground: var(--text-primary);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--text-on-color);
  --color-secondary: var(--bg-tertiary);
  --color-secondary-foreground: var(--text-secondary);
  --color-muted: var(--bg-muted);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--primary-subtle);
  --color-accent-foreground: var(--primary-text);
  --color-destructive: var(--status-error);
  --color-destructive-foreground: var(--text-on-color);
  --color-border: var(--border-default);
  --color-input: var(--border-default);
  --color-ring: var(--border-focus);
  --color-sidebar: var(--bg-secondary);
  --color-sidebar-foreground: var(--text-primary);
  --color-sidebar-primary: var(--primary);
  --color-sidebar-primary-foreground: var(--text-on-color);
  --color-sidebar-accent: var(--primary-subtle);
  --color-sidebar-accent-foreground: var(--primary-text);
  --color-sidebar-border: var(--border-subtle);
  --color-sidebar-ring: var(--border-focus);
  /* APP 自己的名字也暴露给 Tailwind：bg-app-surface / text-app-light / … */
  --color-app-surface: var(--bg-surface);
  --color-app-surface-hover: var(--bg-surface-hover);
  --color-app-tertiary: var(--bg-tertiary);
  --color-app-light: var(--text-light);
  --color-app-link: var(--text-link);
  --color-app-accent: var(--accent);
  --color-app-success: var(--status-success);
  --color-app-warning: var(--status-warning);
  --color-app-info: var(--status-info);
  --color-unread: var(--unread-badge-bg);
  --color-presence: var(--presence-online);
  /* 圆角：APP 刻度 */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --radius-xl: 16px;
  --radius-2xl: 22px;
  --radius-3xl: 28px;
  /* 字号：APP 刻度 */
  --text-app-xs: 11px;
  --text-app-sm: 12px;
  --text-app-base: 13px;
  --text-app-md: 14px;
  --text-app-lg: 15px;
  --text-app-xl: 16px;
}

:root {
  /* ---- 主题色（生成器·浅色）---- */
  --primary: #0956c6;
  --primary-hover: #0043b2;
  --primary-active: #002f9e;
  --primary-subtle: rgba(140, 216, 255, 0.2);
  --primary-text: #002f9e;
  --accent: #6a32cc;
  --accent-hover: #5a18b8;
  --accent-active: #4b00a3;
  --accent-subtle: rgba(224, 184, 255, 0.2);
  --accent-text: #4b00a3;
  --bg-primary: #ffffff;
  --bg-secondary: #f6faff;
  --bg-tertiary: #f0f4fa;
  --bg-surface: rgba(255, 255, 255, 0.8);
  --bg-surface-hover: rgba(255, 255, 255, 0.9);
  --bg-muted: #e2e6ed;
  --bg-inverse: #202328;
  --text-primary: #1e3a5f;
  --text-secondary: #475569;
  --text-muted: #64748b;
  --text-light: #94a3b8;
  --text-inverse: #ffffff;
  --text-link: #0956c6;
  --text-on-color: #ffffff;
  --border-default: rgba(121, 196, 255, 0.3);
  --border-subtle: rgba(121, 196, 255, 0.15);
  --border-strong: rgba(97, 169, 255, 0.5);
  --border-focus: rgba(66, 137, 254, 0.6);
  --status-success: #22c55e;
  --status-success-subtle: rgba(34, 197, 94, 0.15);
  --status-warning: #f59e0b;
  --status-warning-subtle: rgba(245, 158, 11, 0.15);
  --status-error: #ef4444;
  --status-error-subtle: rgba(239, 68, 68, 0.15);
  --status-info: #3b82f6;
  --status-info-subtle: rgba(59, 130, 246, 0.15);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.25), 0 0 40px rgba(59, 130, 246, 0.15);
  --shadow-focus: 0 0 0 3px rgba(59, 130, 246, 0.15);
  /* ---- 色阶（生成器·浅色）---- */
  --color-primary-1: #acfaff; --color-primary-2: #a6f3ff; --color-primary-3: #99e5ff; --color-primary-4: #8cd8ff;
  --color-primary-5: #79c4ff; --color-primary-6: #61a9ff; --color-primary-7: #4289fe; --color-primary-8: #2970e2;
  --color-primary-9: #0956c6; --color-primary-10: #0043b2; --color-primary-11: #002f9e; --color-primary-12: #00007a;
  --color-accent-1: #ffdaff; --color-accent-2: #fad3ff; --color-accent-3: #edc6ff; --color-accent-4: #e0b8ff;
  --color-accent-5: #cda4ff; --color-accent-6: #b48aff; --color-accent-7: #9669ff; --color-accent-8: #7f4ee8;
  --color-accent-9: #6a32cc; --color-accent-10: #5a18b8; --color-accent-11: #4b00a3; --color-accent-12: #33007f;
  --color-neutral-1: #f6faff; --color-neutral-2: #f0f4fa; --color-neutral-3: #e2e6ed; --color-neutral-4: #d5d9e0;
  --color-neutral-5: #c2c6cc; --color-neutral-6: #a9adb3; --color-neutral-7: #8a8e94; --color-neutral-8: #72767c;
  --color-neutral-9: #5c5f65; --color-neutral-10: #4b4f54; --color-neutral-11: #3b3f44; --color-neutral-12: #202328;
  /* ---- 静态 token（APP variables.css 原样）---- */
  --unread-badge-bg: #ff3b30;
  --unread-badge-text: #ffffff;
  --presence-online: #34d399;
  --presence-dot-ring: #ffffff;
  --role-owner-bg: rgba(234, 179, 8, 0.2);
  --role-owner-text: #ca8a04;
  --role-admin-bg: rgba(59, 130, 246, 0.2);
  --role-admin-text: #2563eb;
  --white-alpha-97: rgba(255, 255, 255, 0.97); --white-alpha-95: rgba(255, 255, 255, 0.95); --white-alpha-90: rgba(255, 255, 255, 0.9);
  --white-alpha-85: rgba(255, 255, 255, 0.85); --white-alpha-80: rgba(255, 255, 255, 0.8); --white-alpha-75: rgba(255, 255, 255, 0.75);
  --white-alpha-70: rgba(255, 255, 255, 0.7); --white-alpha-60: rgba(255, 255, 255, 0.6); --white-alpha-50: rgba(255, 255, 255, 0.5);
  --white-alpha-45: rgba(255, 255, 255, 0.45); --white-alpha-40: rgba(255, 255, 255, 0.4); --white-alpha-35: rgba(255, 255, 255, 0.35);
  --white-alpha-30: rgba(255, 255, 255, 0.3); --white-alpha-25: rgba(255, 255, 255, 0.25); --white-alpha-20: rgba(255, 255, 255, 0.2);
  --white-alpha-15: rgba(255, 255, 255, 0.15); --white-alpha-10: rgba(255, 255, 255, 0.1);
  --black-alpha-70: rgba(0, 0, 0, 0.7); --black-alpha-60: rgba(0, 0, 0, 0.6); --black-alpha-50: rgba(0, 0, 0, 0.5);
  --black-alpha-30: rgba(0, 0, 0, 0.3); --black-alpha-10: rgba(0, 0, 0, 0.1); --black-alpha-5: rgba(0, 0, 0, 0.05);
  --glass-white-90: rgba(255, 255, 255, 0.9); --glass-white-80: rgba(255, 255, 255, 0.8); --glass-white-70: rgba(255, 255, 255, 0.7);
  --glass-white-60: rgba(255, 255, 255, 0.6); --glass-white-50: rgba(255, 255, 255, 0.5); --glass-white-45: rgba(255, 255, 255, 0.45);
  --glass-white-40: rgba(255, 255, 255, 0.4); --glass-white-35: rgba(255, 255, 255, 0.35); --glass-white-30: rgba(255, 255, 255, 0.3);
  --glass-white-25: rgba(255, 255, 255, 0.25); --glass-white-20: rgba(255, 255, 255, 0.2); --glass-white-15: rgba(255, 255, 255, 0.15);
  --glass-white-10: rgba(255, 255, 255, 0.1);
  --glass-border: rgba(255, 255, 255, 0.6);
  --glass-border-light: rgba(255, 255, 255, 0.8);
  --glass-border-subtle: rgba(255, 255, 255, 0.4);
  --card-bg-start: rgba(255, 255, 255, 0.15);
  --card-bg-end: rgba(255, 255, 255, 0.1);
  --card-bg-hover-start: rgba(255, 255, 255, 0.25);
  --card-bg-hover-end: rgba(255, 255, 255, 0.2);
  --card-border: rgba(255, 255, 255, 0.3);
  --gradient-glass: linear-gradient(135deg, var(--glass-white-35) 0%, var(--glass-white-20) 50%, var(--glass-white-30) 100%);
  --gradient-glass-hover: linear-gradient(135deg, var(--glass-white-45) 0%, var(--glass-white-30) 50%, var(--glass-white-40) 100%);
  --gradient-bg-page: linear-gradient(135deg, var(--color-primary-2) 0%, var(--color-neutral-1) 25%, var(--bg-primary) 50%, var(--color-neutral-1) 75%, var(--color-primary-2) 100%);
  --blur-xs: blur(6px); --blur-sm: blur(10px); --blur-md: blur(12px); --blur-lg: blur(16px); --blur-xl: blur(24px);
  --saturate-normal: saturate(150%); --saturate-high: saturate(180%);
  --glass-backdrop: blur(20px) saturate(180%);
  --transition-fast: 0.2s ease; --transition-normal: 0.3s ease;
  --transition-smooth: 0.3s cubic-bezier(0.4, 0, 0.2, 1); --transition-bounce: 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  --radius-full: 50%;
  /* 兼容：shadcn 的 `rounded-lg` 等读 --radius；给它 APP 的 md */
  --radius: 12px;
}

.dark {
  /* ---- 主题色（生成器·深色）---- */
  --primary: #3c83f7;
  --primary-hover: #2269db;
  --primary-active: #0050c0;
  --primary-subtle: rgba(60, 131, 247, 0.2);
  --primary-text: #3c83f7;
  --accent: #9162fd;
  --accent-hover: #7a48e1;
  --accent-active: #642ac5;
  --accent-subtle: rgba(145, 98, 253, 0.2);
  --accent-text: #9162fd;
  --bg-primary: #06080c;
  --bg-secondary: #0c0e13;
  --bg-tertiary: #14171c;
  --bg-surface: rgba(12, 14, 19, 0.9);
  --bg-surface-hover: rgba(20, 23, 28, 0.9);
  --bg-muted: #202328;
  --bg-inverse: #d8dde3;
  --text-primary: #f8fafc;
  --text-secondary: #e2e8f0;
  --text-muted: #94a3b8;
  --text-light: #64748b;
  --text-inverse: #1e293b;
  --text-link: #3c83f7;
  --border-default: rgba(65, 68, 73, 0.4);
  --border-subtle: rgba(47, 50, 55, 0.25);
  --border-strong: rgba(86, 90, 95, 0.5);
  --border-focus: rgba(0, 80, 192, 0.6);
  --status-success: #4ade80;
  --status-success-subtle: rgba(74, 222, 128, 0.2);
  --status-warning: #fbbf24;
  --status-warning-subtle: rgba(251, 191, 36, 0.2);
  --status-error: #f87171;
  --status-error-subtle: rgba(248, 113, 113, 0.2);
  --status-info: #60a5fa;
  --status-info-subtle: rgba(96, 165, 250, 0.2);
  /* ---- 色阶（生成器·深色）---- */
  --color-primary-1: #0b0054; --color-primary-2: #06005e; --color-primary-3: #00006a; --color-primary-4: #00007a;
  --color-primary-5: #001d8e; --color-primary-6: #0036a5; --color-primary-7: #0050c0; --color-primary-8: #2269db;
  --color-primary-9: #3c83f7; --color-primary-10: #549cff; --color-primary-11: #70baff; --color-primary-12: #90dbff;
  --color-accent-1: #1d0058; --color-accent-2: #220062; --color-accent-3: #29006f; --color-accent-4: #33007f;
  --color-accent-5: #400093; --color-accent-6: #5000aa; --color-accent-7: #642ac5; --color-accent-8: #7a48e1;
  --color-accent-9: #9162fd; --color-accent-10: #a87dff; --color-accent-11: #c49aff; --color-accent-12: #e3bcff;
  --color-neutral-1: #06080c; --color-neutral-2: #0c0e13; --color-neutral-3: #14171c; --color-neutral-4: #202328;
  --color-neutral-5: #2f3237; --color-neutral-6: #414449; --color-neutral-7: #565a5f; --color-neutral-8: #6d7076;
  --color-neutral-9: #84888e; --color-neutral-10: #9ca0a6; --color-neutral-11: #b8bcc3; --color-neutral-12: #d8dde3;
  /* 玻璃面在深色下改用黑基（APP ThemeProvider 对 glass.baseColor 的处理：深色反相） */
  --glass-white-90: rgba(20, 23, 28, 0.9); --glass-white-80: rgba(20, 23, 28, 0.8); --glass-white-70: rgba(20, 23, 28, 0.7);
  --glass-white-60: rgba(20, 23, 28, 0.6); --glass-white-50: rgba(20, 23, 28, 0.5); --glass-white-45: rgba(20, 23, 28, 0.45);
  --glass-white-40: rgba(20, 23, 28, 0.4); --glass-white-35: rgba(20, 23, 28, 0.35); --glass-white-30: rgba(20, 23, 28, 0.3);
  --glass-white-25: rgba(20, 23, 28, 0.25); --glass-white-20: rgba(20, 23, 28, 0.2); --glass-white-15: rgba(20, 23, 28, 0.15);
  --glass-white-10: rgba(20, 23, 28, 0.1);
  --white-alpha-97: rgba(20, 23, 28, 0.97); --white-alpha-95: rgba(20, 23, 28, 0.95); --white-alpha-90: rgba(20, 23, 28, 0.9);
  --white-alpha-85: rgba(20, 23, 28, 0.85); --white-alpha-80: rgba(20, 23, 28, 0.8); --white-alpha-75: rgba(20, 23, 28, 0.75);
  --white-alpha-70: rgba(20, 23, 28, 0.7); --white-alpha-60: rgba(20, 23, 28, 0.6); --white-alpha-50: rgba(20, 23, 28, 0.5);
  --white-alpha-45: rgba(20, 23, 28, 0.45); --white-alpha-40: rgba(20, 23, 28, 0.4); --white-alpha-35: rgba(20, 23, 28, 0.35);
  --white-alpha-30: rgba(20, 23, 28, 0.3); --white-alpha-25: rgba(20, 23, 28, 0.25); --white-alpha-20: rgba(20, 23, 28, 0.2);
  --white-alpha-15: rgba(20, 23, 28, 0.15); --white-alpha-10: rgba(20, 23, 28, 0.1);
  --glass-border: rgba(255, 255, 255, 0.12);
  --glass-border-light: rgba(255, 255, 255, 0.18);
  --glass-border-subtle: rgba(255, 255, 255, 0.08);
  --card-bg-start: rgba(255, 255, 255, 0.06);
  --card-bg-end: rgba(255, 255, 255, 0.03);
  --card-bg-hover-start: rgba(255, 255, 255, 0.1);
  --card-bg-hover-end: rgba(255, 255, 255, 0.06);
  --card-border: rgba(255, 255, 255, 0.1);
  --presence-dot-ring: #06080c;
}

/* ============================================
   APP 组件类（styles/components/*.css 移植；只保留壳用得到的）
   ============================================ */
@utility glass-card {
  position: relative;
  background: var(--gradient-glass);
  backdrop-filter: var(--blur-xl) var(--saturate-high);
  -webkit-backdrop-filter: var(--blur-xl) var(--saturate-high);
  border-radius: var(--radius-3xl);
  border: 1.5px solid var(--glass-border);
  box-shadow:
    0 0 60px var(--glass-white-50),
    0 0 40px rgba(147, 197, 253, 0.15),
    0 8px 32px rgba(59, 130, 246, 0.1),
    0 20px 60px rgba(0, 0, 0, 0.08),
    inset 0 2px 2px var(--glass-white-80),
    inset 2px 0 2px var(--glass-white-40),
    inset 0 -1px 2px var(--glass-white-30);
}
/* 面板级玻璃面（侧栏 / 列表栏 / 弹层）：APP .chat-sidebar / .sidebar-more-panel 的底 */
@utility glass-surface {
  background: linear-gradient(180deg, var(--white-alpha-70) 0%, var(--white-alpha-50) 100%);
  backdrop-filter: var(--glass-backdrop);
  -webkit-backdrop-filter: var(--glass-backdrop);
}
@utility glass-input {
  width: 100%;
  padding: 14px 18px;
  font-size: 15px;
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--glass-white-45) 0%, var(--glass-white-30) 100%);
  backdrop-filter: var(--blur-md) var(--saturate-normal);
  -webkit-backdrop-filter: var(--blur-md) var(--saturate-normal);
  border: 1.5px solid var(--glass-white-70);
  border-radius: var(--radius-lg);
  outline: none;
  transition: border-color var(--transition-smooth), background var(--transition-smooth), box-shadow var(--transition-smooth);
}
@utility subtle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: var(--primary-subtle);
  color: var(--primary);
  transition: all 0.15s ease;
}
@utility app-scrollbar {
  &::-webkit-scrollbar { width: 6px; height: 6px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
  &::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
}
```

然后把文件余下部分（`@layer base` 起）里所有 `hsl(var(--X))` / `hsl(var(--X) / A)` 按下面的规则改写（38 处，逐个改，不留一处）：
- `hsl(var(--X))` → `var(--X)`；
- `hsl(var(--X) / 0.12)` → `color-mix(in srgb, var(--X) 12%, transparent)`（透明度 A 换成 `A×100%`）；
- `hsl(162 70% 42% / 0.1)` 这类**字面量** HSL → 换成 token：绿色系用 `color-mix(in srgb, var(--status-success) 10%, transparent)`，主色系用 `--primary`，中性用 `--bg-muted`。
- `body` 的 `background-image` 三个 radial-gradient 改成 `var(--gradient-bg-page)`（APP 的页面底）。

- [ ] **Step 4: 把六个组件里的 `hsl(var(--x))` 改成 token**

每个文件 `grep -n "hsl(var(--"` 定位后按同一规则改写。它们都是内联 `style` 或 Tailwind 任意值（`bg-[hsl(var(--primary)/0.1)]` → `bg-primary/10`；`text-[hsl(var(--muted-foreground))]` → `text-muted-foreground`；`style={{ background: 'hsl(var(--primary) / 0.12)' }}` → `style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}`）。改完 `grep -rn "hsl(var(--" src` 必须为空。

- [ ] **Step 5: 运行确认通过**

Run: `bun run test src/styles 2>&1 | tail -8`
Expected: PASS，4 条。

- [ ] **Step 6: 变异验证**

| 变异 | 期望 |
|---|---|
| `@theme inline` 里把 `--color-background: var(--bg-primary)` 改回 `hsl(var(--background))` | 「别名到 APP token」红（两处：别名缺失 + 正对照 `not.toMatch`） |
| `.dark` 块里 `--bg-primary` 改成与 `:root` 相同的 `#ffffff` | 「两套值确实不同」红 |
| `--radius-lg: 14px` 改成 `12px` | 「圆角刻度」红 |
| 在任意 `src/**/*.tsx` 里加回一行 `hsl(var(--primary))` | 「全仓源码里不再有」红 |

每条观察后还原。

- [ ] **Step 7: 视觉冒烟 + 门禁 + 提交**

Run: `bun run dev` 起一次（Node），用应用内浏览器打开 `http://localhost:3000/app/login`，截图确认登录卡片已是 APP 的蓝紫 + 玻璃面、切暗色（右上角或设置）后底色为 `#06080c` 系；不用登录。关闭 dev。

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/styles/globals.css src/styles/__tests__/tokens.test.ts src/features/chat/components/window/MarkdownEditor.tsx src/features/webrtc/components/VideoMeeting.tsx src/components/ui/sidebar.tsx src/features/auth/components/RegisterForm.tsx src/features/auth/components/LoginForm.tsx src/components/common/LoadingAnimation.tsx
git commit -m "$(cat <<'EOF'
feat(theme): APP 的设计 token 进 Tailwind，shadcn 变量别名到它

把 APP variables.css + theme/generator.ts 对默认预设算出的两套值（浅/深）写进 :root/.dark，
@theme 里 shadcn 的 --color-* 全部别名到 APP token，59 个基础组件不改代码换皮；
圆角按 APP 刻度；新增 glass-card / glass-surface / glass-input / subtle-btn / app-scrollbar
工具类（APP styles/components 移植）。全仓 49 处 hsl(var(--x)) 改成 token 或 color-mix，
并用一条扫描源码的测试钉住不再回潮——换 token 后那种写法会静默失色。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 路由常量、会话 id 编解码、APP 文案规则移植

**Files:**
- Modify: `src/lib/routes.ts`
- Create: `src/features/chat/lib/conversationId.ts`
- Create: `src/features/chat/lib/formatMessageTime.ts`
- Create: `src/features/chat/lib/friendName.ts`
- Create: `src/features/chat/lib/formatUnreadCount.ts`
- Test: `src/lib/__tests__/routes.test.ts`（若已存在则追加）、`src/features/chat/lib/__tests__/conversationId.test.ts`、`src/features/chat/lib/__tests__/formatMessageTime.test.ts`、`src/features/chat/lib/__tests__/friendName.test.ts`

**Interfaces:**
- Produces:
  - `ROUTES.app.{chat, contacts, settings, profile, files, meeting, bots, miniapps, aiChat, videoMeeting}`（旧键 `chatFriends/chatGroups/chatFiles/chatWebrtc/friends/devices` 本任务**保留**并标 `@deprecated`，第 11 步删除）
  - `chatPath(conversationId: string): string`、`contactFriendPath(userId: string): string`、`contactGroupPath(groupId: string): string`、`settingsPath(section: SettingsSection): string`
  - `SETTINGS_SECTIONS = ['appearance', 'notifications', 'account', 'ai', 'about'] as const`、`type SettingsSection`、`isSettingsSection(x: string): x is SettingsSection`（`ai` 是 spec §8 四个分区之外的第五个：现 SettingsPage 的「AI 配置」卡片（自备端点/Key/模型）没有别的去处，记为对 spec 的裁决）
  - `LEGACY_REDIRECTS: ReadonlyArray<readonly [from: string, to: string]>`、`legacyRedirectTarget(pathname: string): string | null`
  - `DEFAULT_AUTHENTICATED_ROUTE = ROUTES.app.chat`
  - `friendConversationId(userId): string`（`f-<uid>`）、`groupConversationId(groupId): string`（`g-<gid>`）、`parseConversationId(id): { kind: 'friend'; userId: string } | { kind: 'group'; groupId: string } | null`
  - `formatMessageTime(iso: string, now?: Date): string`（APP 规则：今天 `HH:mm`；昨天 `昨天 HH:mm`；一周内 `周X HH:mm`；更早 `M/D HH:mm`；无效返回 `''`）
  - `friendDisplayName(friend: { friend_id: string; friend_nickname?: string | null; friend_remark?: string | null }): string`（备注 > 昵称 > id，空白视为未设）
  - `formatUnreadCount(n: number): string`（`0`→`''`，`1..99`→原样，`>99`→`99+`）

- [ ] **Step 1: 写失败的测试**

`src/features/chat/lib/__tests__/conversationId.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { friendConversationId, groupConversationId, parseConversationId } from '../conversationId'

describe('会话 id：f-<uid> / g-<gid>', () => {
  it('编码后能解回同一个对象（用户 id 本身可含连字符，只在第一个连字符处切）', () => {
    expect(friendConversationId('alice-01')).toBe('f-alice-01')
    expect(parseConversationId('f-alice-01')).toEqual({ kind: 'friend', userId: 'alice-01' })
    expect(groupConversationId('g_123')).toBe('g-g_123')
    expect(parseConversationId('g-g_123')).toEqual({ kind: 'group', groupId: 'g_123' })
  })

  it('形状不对返回 null（前缀错 / 没有主体 / 空串）', () => {
    expect(parseConversationId('x-1')).toBe(null)
    expect(parseConversationId('f-')).toBe(null)
    expect(parseConversationId('')).toBe(null)
    // 正对照：合法的确实解得出（否则上面三条"恒 null"也绿）
    expect(parseConversationId('f-bob')).not.toBe(null)
  })
})
```

`src/features/chat/lib/__tests__/formatMessageTime.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { formatMessageTime } from '../formatMessageTime'

// 固定"现在"= 2026-09-10 15:30 本地时间（周四）
const NOW = new Date(2026, 8, 10, 15, 30)
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

describe('formatMessageTime（APP utils/time.ts 规则）', () => {
  it('今天只显示 HH:mm', () => {
    expect(formatMessageTime(at(2026, 9, 10, 9, 5), NOW)).toBe('09:05')
  })
  it('昨天显示「昨天 HH:mm」（按日期零点算，不按 24 小时）', () => {
    expect(formatMessageTime(at(2026, 9, 9, 23, 59), NOW)).toBe('昨天 23:59')
  })
  it('一周内显示「周X HH:mm」', () => {
    expect(formatMessageTime(at(2026, 9, 7, 8, 0), NOW)).toBe('周一 08:00')
  })
  it('更早显示「M/D HH:mm」', () => {
    expect(formatMessageTime(at(2026, 9, 1, 8, 0), NOW)).toBe('9/1 08:00')
  })
  it('无效时间返回空串（调用方据此隐藏）', () => {
    expect(formatMessageTime('not-a-date', NOW)).toBe('')
  })
})
```

`src/features/chat/lib/__tests__/friendName.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { friendDisplayName } from '../friendName'
import { formatUnreadCount } from '../formatUnreadCount'

describe('friendDisplayName：备注 > 昵称 > id，空白视为未设', () => {
  it('三级回退', () => {
    expect(friendDisplayName({ friend_id: 'u1', friend_nickname: '昵称', friend_remark: '备注' })).toBe('备注')
    expect(friendDisplayName({ friend_id: 'u1', friend_nickname: '昵称', friend_remark: '   ' })).toBe('昵称')
    expect(friendDisplayName({ friend_id: 'u1', friend_nickname: null, friend_remark: null })).toBe('u1')
  })
})

describe('formatUnreadCount', () => {
  it('0 → 空串，99 以内原样，超过 → 99+', () => {
    expect(formatUnreadCount(0)).toBe('')
    expect(formatUnreadCount(7)).toBe('7')
    expect(formatUnreadCount(99)).toBe('99')
    expect(formatUnreadCount(100)).toBe('99+')
  })
})
```

`src/lib/__tests__/routes.test.ts` 追加（文件已存在就加一个 describe，否则新建并带上 import）：

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTHENTICATED_ROUTE, LEGACY_REDIRECTS, ROUTES, SETTINGS_SECTIONS,
  chatPath, contactFriendPath, contactGroupPath, isSettingsSection, legacyRedirectTarget, settingsPath,
} from '../routes'

describe('壳的路由表（spec §3）', () => {
  it('路径助手拼出的是字面量 URL', () => {
    expect(chatPath('f-alice')).toBe('/app/chat/f-alice')
    expect(contactFriendPath('alice')).toBe('/app/contacts/friends/alice')
    expect(contactGroupPath('g1')).toBe('/app/contacts/groups/g1')
    expect(settingsPath('account')).toBe('/app/settings/account')
    expect(DEFAULT_AUTHENTICATED_ROUTE).toBe('/app/chat')
    expect(ROUTES.app.meeting).toBe('/app/meeting')
  })

  it('设置分区只有五个，且能做类型守卫', () => {
    expect([...SETTINGS_SECTIONS]).toEqual(['appearance', 'notifications', 'account', 'ai', 'about'])
    expect(isSettingsSection('account')).toBe(true)
    expect(isSettingsSection('devices')).toBe(false)
  })

  it('旧 URL 逐条映射到新 URL；不在表里的返回 null', () => {
    expect(legacyRedirectTarget('/app/friends')).toBe('/app/contacts')
    expect(legacyRedirectTarget('/app/groups')).toBe('/app/contacts')
    expect(legacyRedirectTarget('/app/webrtc')).toBe('/app/meeting')
    expect(legacyRedirectTarget('/app/devices')).toBe('/app/settings/account')
    expect(legacyRedirectTarget('/app/group-chat')).toBe('/app/chat')
    expect(legacyRedirectTarget('/app/chat')).toBe(null)
    expect(LEGACY_REDIRECTS.length).toBe(5)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/features/chat/lib src/lib/__tests__/routes.test.ts 2>&1 | tail -8`
Expected: FAIL —— 模块不存在 / 导出不存在。

- [ ] **Step 3: 写实现**

`src/features/chat/lib/conversationId.ts`：

```ts
/**
 * 统一会话 id：URL 里「选中了哪个会话」的唯一表示（spec §3）。
 *
 * `f-<userId>` 私聊、`g-<groupId>` 群聊。只在**第一个**连字符处切：用户 id 本身可以含连字符
 * （APP `utils/conversationId.ts` 同一条注释），按 '-' split 计数会切坏。
 * 这不是后端的 `conv-a-b` 会话 id（那个是 messages API 的键，见 `buildFriendConversationId`）。
 */
export type ParsedConversationId = { kind: 'friend'; userId: string } | { kind: 'group'; groupId: string }

export function friendConversationId(userId: string): string {
  return `f-${userId}`
}

export function groupConversationId(groupId: string): string {
  return `g-${groupId}`
}

export function parseConversationId(id: string): ParsedConversationId | null {
  const dash = id.indexOf('-')
  if (dash !== 1) return null
  const body = id.slice(2)
  if (body === '') return null
  if (id[0] === 'f') return { kind: 'friend', userId: body }
  if (id[0] === 'g') return { kind: 'group', groupId: body }
  return null
}
```

`src/features/chat/lib/formatMessageTime.ts`：

```ts
/**
 * 消息时间文案，逐条移植 APP `utils/time.ts` 的 formatMessageTime：
 * 今天 `HH:mm`；昨天 `昨天 HH:mm`；一周内 `周X HH:mm`；更早 `M/D HH:mm`。
 * 「昨天」按**日期零点**比较（23:59 → 00:01 也是昨天），不按 24 小时差。
 * 第二个参数只给测试用来固定"现在"。
 */
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatMessageTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const daysDiff = Math.floor((dayStart(now) - dayStart(date)) / 86_400_000)
  const time = hhmm(date)
  if (daysDiff <= 0) return time
  if (daysDiff === 1) return `昨天 ${time}`
  if (daysDiff < 7) return `${WEEKDAYS[date.getDay()]} ${time}`
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}
```

`src/features/chat/lib/friendName.ts`：

```ts
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
```

`src/features/chat/lib/formatUnreadCount.ts`：

```ts
/** 未读角标文案：0 不显示，99 以上截成 99+（APP 同规则）。 */
export function formatUnreadCount(n: number): string {
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
}
```

`src/lib/routes.ts`：把 `ROUTES` 常量改成下面这样（旧键保留、标记废弃；`legacy.groupChat` 保留），并在文件末尾追加助手与重定向表。`CHAT_TAB_ROUTE_MAP`、`getChatTabFromPath`、`ChatTabRouteKey`、`isRouteActive`、`SEGMENT_LABELS` 及其余现有导出**本任务不动**（第 11 步清理）：

```ts
export const ROUTES = {
  root: '/',
  webAppRoot: '/app',
  downloads: '/downloads',
  auth: {
    login: '/app/login',
    register: '/app/register',
  },
  app: {
    chat: '/app/chat',
    contacts: '/app/contacts',
    settings: '/app/settings',
    profile: '/app/profile',
    files: '/app/files',
    meeting: '/app/meeting',
    bots: '/app/bots',
    miniapps: '/app/miniapps',
    aiChat: '/app/ai-chat',
    videoMeeting: '/app/video-meeting',
    /** @deprecated 壳迁移（第 11 步删除）：旧分页路由，只剩重定向在用 */
    chatFriends: '/app/friends',
    /** @deprecated 同上 */
    chatGroups: '/app/groups',
    /** @deprecated 同上 */
    chatFiles: '/app/files',
    /** @deprecated 同上 */
    chatWebrtc: '/app/webrtc',
    /** @deprecated 同上 */
    friends: '/app/friends',
    /** @deprecated 同上：设备管理并入 /app/settings/account */
    devices: '/app/devices',
  },
  legacy: {
    groupChat: '/app/group-chat',
  },
} as const

export const SETTINGS_SECTIONS = ['appearance', 'notifications', 'account', 'ai', 'about'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function isSettingsSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as readonly string[]).includes(value)
}

export const chatPath = (conversationId: string): string => `${ROUTES.app.chat}/${conversationId}`
export const contactFriendPath = (userId: string): string => `${ROUTES.app.contacts}/friends/${encodeURIComponent(userId)}`
export const contactGroupPath = (groupId: string): string => `${ROUTES.app.contacts}/groups/${encodeURIComponent(groupId)}`
export const settingsPath = (section: SettingsSection): string => `${ROUTES.app.settings}/${section}`

/**
 * 旧 URL → 新 URL（spec §3）。第 11 步的 `legacy-redirect.tsx` 路由模块按这张表 `redirect()`；
 * `/app/profile` 不在表里：URL 不变，只是语义从整页变成壳上的模态框。
 */
export const LEGACY_REDIRECTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['/app/friends', ROUTES.app.contacts],
  ['/app/groups', ROUTES.app.contacts],
  ['/app/webrtc', ROUTES.app.meeting],
  ['/app/devices', `${ROUTES.app.settings}/account`],
  [ROUTES.legacy.groupChat, ROUTES.app.chat],
]

export function legacyRedirectTarget(pathname: string): string | null {
  const hit = LEGACY_REDIRECTS.find(([from]) => pathname === from || pathname.startsWith(`${from}/`))
  return hit ? hit[1] : null
}

export const DEFAULT_AUTHENTICATED_ROUTE = ROUTES.app.chat
export const DEFAULT_UNAUTHENTICATED_ROUTE = ROUTES.auth.login
```

（把文件里原来的 `DEFAULT_AUTHENTICATED_ROUTE = ROUTES.app.chatFriends` 与 `DEFAULT_UNAUTHENTICATED_ROUTE` 两行删掉，改用上面的。）

- [ ] **Step 4: 运行确认通过**

Run: `bun run test src/features/chat/lib src/lib 2>&1 | tail -8`
Expected: PASS。`DEFAULT_AUTHENTICATED_ROUTE` 变了会让 `LoginForm` / `ProtectedRoute` 相关旧用例里断言 `/app/friends` 的地方红——把那些字面量改成 `/app/chat`（它们钉的是"登录后去默认页"，不是具体哪一页），全量 `bun run test` 必须绿。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `parseConversationId` 改成 `id.split('-')` 取第二段 | 「用户 id 本身可含连字符」红（`alice-01` 变成 `alice`） |
| `formatMessageTime` 的"昨天"改成 `now - date < 24h` | 「按日期零点算」红 |
| `friendDisplayName` 不 trim | 「空白视为未设」红 |
| `LEGACY_REDIRECTS` 删掉 `/app/devices` 那条 | 「旧 URL 逐条映射」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/lib/routes.ts src/lib/__tests__/routes.test.ts src/features/chat/lib
git commit -m "$(cat <<'EOF'
feat(routes): 壳的路由表、会话 id 编解码与 APP 文案规则移植

ROUTES 加 contacts / profile / files / meeting / bots / miniapps 新键（旧键标 @deprecated 留给
重定向，第 11 步删）；chatPath / contactFriendPath / contactGroupPath / settingsPath 拼字面量
URL；SETTINGS_SECTIONS 四个分区；LEGACY_REDIRECTS 五条旧 URL 映射；默认登录后落 /app/chat。
会话 id 用 f-<uid> / g-<gid>，只在第一个连字符处切（用户 id 可含连字符）。
formatMessageTime / friendDisplayName / formatUnreadCount 逐条移植 APP 规则并配用例，
避免两端文案漂移。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 置顶存储 + `useUnifiedConversations`（统一会话列表的数据）

**Files:**
- Create: `src/features/chat/store/pinnedStore.ts`
- Create: `src/features/chat/hooks/useUnifiedConversations.ts`
- Test: `src/features/chat/store/__tests__/pinnedStore.test.ts`、`src/features/chat/hooks/__tests__/useUnifiedConversations.test.ts`

**Interfaces:**
- Consumes: `useFriendsStore().friends: Friend[]`（`friend_id / friend_nickname / friend_avatar_url / friend_remark`，头像已是绝对地址）、`useGroupStore().myGroups: MyGroup[]`（`group_id / group_name / group_avatar_url / unread_count / last_message_content / last_message_time`）、`useChatStore().unreadSummary`（`friend_unreads[] { friend_id, unread_count, last_message_preview, last_message_time }` / `group_unreads[]` 同形）、Task 2 的 `friendConversationId / groupConversationId / friendDisplayName`、`toAbsoluteApiUrl`（`@/lib/apiConfig`）、`registerSessionReset`（`@/lib/sessionScope`）。
- Produces:
  - `usePinnedStore`：`{ pinned: string[]; isPinned(id): boolean; toggle(id): void; reset(): void }`，persist key `huanvae.pinned-conversations`（账号级：`registerSessionReset` 登出清空）。
  - `interface UnifiedConversation { id: string; kind: 'friend' | 'group'; targetId: string; name: string; avatarUrl: string | null; preview: string | null; lastMessageTime: string | null; unreadCount: number; pinned: boolean }`
  - `sortConversations(list: UnifiedConversation[]): UnifiedConversation[]`（纯函数：置顶优先 → 时间倒序 → id 稳定）
  - `useUnifiedConversations(): { conversations: UnifiedConversation[]; status: 'loading' | 'ready' }`

- [ ] **Step 1: 写失败的测试**

`src/features/chat/store/__tests__/pinnedStore.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { beginSession, endSession } from '@/lib/sessionScope'
import { usePinnedStore } from '../pinnedStore'

describe('pinnedStore：账号级置顶', () => {
  beforeEach(() => {
    localStorage.clear()
    usePinnedStore.getState().reset()
    beginSession()
  })

  it('toggle 置顶/取消置顶并落盘到 huanvae.pinned-conversations', () => {
    usePinnedStore.getState().toggle('f-alice')
    expect(usePinnedStore.getState().isPinned('f-alice')).toBe(true)
    expect(localStorage.getItem('huanvae.pinned-conversations')).toContain('f-alice')
    usePinnedStore.getState().toggle('f-alice')
    expect(usePinnedStore.getState().isPinned('f-alice')).toBe(false)
  })

  it('登出（endSession）清空——置顶是账号的，不是设备的', () => {
    usePinnedStore.getState().toggle('g-1')
    expect(usePinnedStore.getState().pinned).toEqual(['g-1'])   // 正对照：清之前确实有
    endSession()
    expect(usePinnedStore.getState().pinned).toEqual([])
    expect(localStorage.getItem('huanvae.pinned-conversations') ?? '').not.toContain('g-1')
  })
})
```

`src/features/chat/hooks/__tests__/useUnifiedConversations.test.ts`：

```ts
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import type { Friend } from '@/features/chat/api/friends'
import type { MyGroup } from '@/features/chat/api/groups'
import { usePinnedStore } from '@/features/chat/store/pinnedStore'
import { sortConversations, useUnifiedConversations, type UnifiedConversation } from '../useUnifiedConversations'

const friend = (id: string, extra: Partial<Friend> = {}): Friend => ({
  friend_id: id, friend_nickname: `${id}-昵称`, friend_avatar_url: null, add_time: '2026-01-01T00:00:00Z',
  approve_reason: null, friend_remark: null, is_blacklisted: false, is_special_care: false, ...extra,
})
const group = (id: string, extra: Partial<MyGroup> = {}): MyGroup => ({
  group_id: id, group_name: `群${id}`, group_avatar_url: null, role: 'member', unread_count: null,
  last_message_content: null, last_message_time: null, ...extra,
} as MyGroup)

const conv = (id: string, extra: Partial<UnifiedConversation> = {}): UnifiedConversation => ({
  id, kind: id.startsWith('f-') ? 'friend' : 'group', targetId: id.slice(2), name: id, avatarUrl: null,
  preview: null, lastMessageTime: null, unreadCount: 0, pinned: false, ...extra,
})

describe('sortConversations（APP conversationSort：置顶优先 → 时间倒序 → id 稳定）', () => {
  it('置顶在前，同组按最后消息时间倒序，无时间的排最后', () => {
    const sorted = sortConversations([
      conv('f-old', { lastMessageTime: '2026-09-01T00:00:00Z' }),
      conv('g-pinned', { pinned: true, lastMessageTime: '2026-08-01T00:00:00Z' }),
      conv('f-new', { lastMessageTime: '2026-09-10T00:00:00Z' }),
      conv('f-none'),
    ])
    expect(sorted.map((c) => c.id)).toEqual(['g-pinned', 'f-new', 'f-old', 'f-none'])
  })
  it('时间相同按 id 稳定排序（不依赖输入顺序）', () => {
    const t = '2026-09-10T00:00:00Z'
    const a = sortConversations([conv('f-b', { lastMessageTime: t }), conv('f-a', { lastMessageTime: t })])
    const b = sortConversations([conv('f-a', { lastMessageTime: t }), conv('f-b', { lastMessageTime: t })])
    expect(a.map((c) => c.id)).toEqual(['f-a', 'f-b'])
    expect(b.map((c) => c.id)).toEqual(['f-a', 'f-b'])
  })
})

describe('useUnifiedConversations：friends × groups × unreadSummary × pinned', () => {
  beforeEach(() => {
    useFriendsStore.setState({ friends: [], isLoading: false })
    useGroupStore.setState({ myGroups: [], isLoading: false })
    useChatStore.setState({ unreadSummary: null })
    usePinnedStore.getState().reset()
  })

  it('好友与群合并为一张表，预览/时间/未读来自 unreadSummary，名字用备注优先', () => {
    useFriendsStore.setState({ friends: [friend('alice', { friend_remark: '小爱' })] })
    useGroupStore.setState({ myGroups: [group('g1', { group_name: '读书会' })] })
    useChatStore.setState({
      unreadSummary: {
        total_count: 5,
        friend_unreads: [{ friend_id: 'alice', unread_count: 2, last_message_preview: '在吗', last_message_time: '2026-09-10T08:00:00Z' }],
        group_unreads: [{ group_id: 'g1', unread_count: 3, last_message_preview: '张三: 明天见', last_message_time: '2026-09-10T09:00:00Z' }],
      },
    })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.status).toBe('ready')
    expect(result.current.conversations.map((c) => c.id)).toEqual(['g-g1', 'f-alice'])
    const alice = result.current.conversations[1]
    expect(alice).toMatchObject({ kind: 'friend', targetId: 'alice', name: '小爱', preview: '在吗', unreadCount: 2, pinned: false })
    expect(result.current.conversations[0]).toMatchObject({ kind: 'group', name: '读书会', preview: '张三: 明天见', unreadCount: 3 })
  })

  it('没有 unreadSummary 时也能列出（预览为 null、未读 0），群的最后消息回退到 myGroups 自带字段', () => {
    useFriendsStore.setState({ friends: [friend('bob')] })
    useGroupStore.setState({ myGroups: [group('g2', { last_message_content: '回退预览', last_message_time: '2026-09-09T00:00:00Z', unread_count: 4 })] })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.conversations.find((c) => c.id === 'f-bob')).toMatchObject({ preview: null, unreadCount: 0, name: 'bob-昵称' })
    expect(result.current.conversations.find((c) => c.id === 'g-g2')).toMatchObject({ preview: '回退预览', unreadCount: 4 })
  })

  it('置顶来自 pinnedStore 并影响排序', () => {
    useFriendsStore.setState({ friends: [friend('a'), friend('b')] })
    useChatStore.setState({ unreadSummary: { total_count: 0, friend_unreads: [
      { friend_id: 'a', unread_count: 0, last_message_preview: null, last_message_time: '2026-09-10T00:00:00Z' },
      { friend_id: 'b', unread_count: 0, last_message_preview: null, last_message_time: '2026-09-01T00:00:00Z' },
    ], group_unreads: [] } })
    usePinnedStore.getState().toggle('f-b')
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.conversations.map((c) => c.id)).toEqual(['f-b', 'f-a'])
    expect(result.current.conversations[0].pinned).toBe(true)
  })

  it('两个 store 任一还在首轮加载时 status 为 loading', () => {
    useFriendsStore.setState({ isLoading: true })
    const { result } = renderHook(() => useUnifiedConversations())
    expect(result.current.status).toBe('loading')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/features/chat/store/__tests__/pinnedStore.test.ts src/features/chat/hooks 2>&1 | tail -8`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写实现**

`src/features/chat/store/pinnedStore.ts`：

```ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { registerSessionReset } from '@/lib/sessionScope'

/**
 * 置顶的会话 id（`f-<uid>` / `g-<gid>`）。**账号级**：普通 localStorage 命名空间，
 * `endSession()` 清盘——换账号登录不能继承上一个人的置顶（spec §6）。
 * APP 把它存在本地 SQLite 的 is_pinned 列里；Web 没有本地库，一个数组就够。
 */
interface PinnedState {
  pinned: string[]
  isPinned: (id: string) => boolean
  toggle: (id: string) => void
  reset: () => void
}

export const PINNED_STORAGE_KEY = 'huanvae.pinned-conversations'

export const usePinnedStore = create<PinnedState>()(
  persist(
    (set, get) => ({
      pinned: [],
      isPinned: (id) => get().pinned.includes(id),
      toggle: (id) =>
        set((s) => ({ pinned: s.pinned.includes(id) ? s.pinned.filter((x) => x !== id) : [...s.pinned, id] })),
      reset: () => set({ pinned: [] }),
    }),
    { name: PINNED_STORAGE_KEY, storage: createJSONStorage(() => localStorage), partialize: (s) => ({ pinned: s.pinned }) },
  ),
)

registerSessionReset(() => {
  usePinnedStore.getState().reset()
  // persist 只在 set 时写盘；reset 已经 set 了空数组，盘上跟着变空。
})
```

`src/features/chat/hooks/useUnifiedConversations.ts`：

```ts
import { useMemo } from 'react'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { friendConversationId, groupConversationId } from '../lib/conversationId'
import { friendDisplayName } from '../lib/friendName'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'
import { usePinnedStore } from '../store/pinnedStore'

export interface UnifiedConversation {
  /** `f-<uid>` / `g-<gid>`，也是 URL 里的 :conversationId */
  id: string
  kind: 'friend' | 'group'
  /** 好友的 user_id 或群的 group_id */
  targetId: string
  name: string
  avatarUrl: string | null
  /** 服务端给的最后一条预览（群消息已带「发送者: 」前缀），Web 不自行拼接 */
  preview: string | null
  lastMessageTime: string | null
  unreadCount: number
  pinned: boolean
}

function toEpoch(time: string | null): number {
  if (!time) return 0
  const ms = new Date(time).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** APP `conversationSort.ts`：置顶优先，再按时间倒序，同时间按 id 稳定。 */
export function sortConversations(list: UnifiedConversation[]): UnifiedConversation[] {
  return [...list].sort((a, b) => {
    const pin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    if (pin !== 0) return pin
    const diff = toEpoch(b.lastMessageTime) - toEpoch(a.lastMessageTime)
    if (diff !== 0) return diff
    return a.id.localeCompare(b.id)
  })
}

export function useUnifiedConversations(): { conversations: UnifiedConversation[]; status: 'loading' | 'ready' } {
  const friends = useFriendsStore((s) => s.friends)
  const friendsLoading = useFriendsStore((s) => s.isLoading)
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)
  const summary = useChatStore((s) => s.unreadSummary)
  const pinned = usePinnedStore((s) => s.pinned)

  const conversations = useMemo(() => {
    const friendUnread = new Map(summary?.friend_unreads.map((u) => [u.friend_id, u]) ?? [])
    const groupUnread = new Map(summary?.group_unreads.map((u) => [u.group_id, u]) ?? [])
    const list: UnifiedConversation[] = []
    for (const f of friends) {
      const u = friendUnread.get(f.friend_id)
      const id = friendConversationId(f.friend_id)
      list.push({
        id, kind: 'friend', targetId: f.friend_id,
        name: friendDisplayName(f),
        avatarUrl: f.friend_avatar_url ? (toAbsoluteApiUrl(f.friend_avatar_url) ?? null) : null,
        preview: u?.last_message_preview ?? null,
        lastMessageTime: u?.last_message_time ?? null,
        unreadCount: u?.unread_count ?? 0,
        pinned: pinned.includes(id),
      })
    }
    for (const g of groups) {
      const u = groupUnread.get(g.group_id)
      const id = groupConversationId(g.group_id)
      list.push({
        id, kind: 'group', targetId: g.group_id,
        name: g.group_name,
        avatarUrl: g.group_avatar_url ? (toAbsoluteApiUrl(g.group_avatar_url) ?? null) : null,
        // unreadSummary 是实时真值；没有时退回 GET /api/groups/my 自带的快照
        preview: u?.last_message_preview ?? g.last_message_content ?? null,
        lastMessageTime: u?.last_message_time ?? g.last_message_time ?? null,
        unreadCount: u?.unread_count ?? g.unread_count ?? 0,
        pinned: pinned.includes(id),
      })
    }
    return sortConversations(list)
  }, [friends, groups, summary, pinned])

  return { conversations, status: friendsLoading || groupsLoading ? 'loading' : 'ready' }
}
```

（`toAbsoluteApiUrl` 的确切签名以 `src/lib/apiConfig.ts` 为准：它对非空字符串返回同源绝对地址；对绝对地址幂等。）

- [ ] **Step 4: 运行确认通过**

Run: `bun run test src/features/chat/store/__tests__/pinnedStore.test.ts src/features/chat/hooks 2>&1 | tail -8`
Expected: PASS，8 条。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `sortConversations` 去掉置顶比较 | 「置顶在前」与「置顶来自 pinnedStore 并影响排序」红 |
| 时间相同时不按 id 比较（返回 0） | 「时间相同按 id 稳定」红 |
| `name: friendDisplayName(f)` 改成 `f.friend_nickname ?? f.friend_id` | 「名字用备注优先」红 |
| 群预览不回退到 `g.last_message_content` | 「回退到 myGroups 自带字段」红 |
| `registerSessionReset` 那段删掉 | 「登出清空」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/features/chat/store/pinnedStore.ts src/features/chat/store/__tests__/pinnedStore.test.ts src/features/chat/hooks/useUnifiedConversations.ts src/features/chat/hooks/__tests__/useUnifiedConversations.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): 统一会话列表的数据——friends × groups × unreadSummary × pinned

useUnifiedConversations 把好友与群合并成一张表：名字备注优先、预览/时间/未读取 WS 的
unread_summary（与 APP 同一份服务端数据），群没有摘要时回退到 /api/groups/my 自带的快照；
排序移植 APP conversationSort（置顶优先 → 时间倒序 → id 稳定）。置顶存 pinnedStore
（账号级 localStorage，endSession 清空）。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 列表组件——`ListStates`、`ConversationCard`、`UnifiedList`（搜索 / 添加菜单 / 右键菜单）

**Files:**
- Create: `src/components/shell/ListStates.tsx`
- Create: `src/components/shell/ConversationCard.tsx`
- Create: `src/components/shell/UnifiedList.tsx`
- Modify: `src/i18n/messages.ts`（新增 `shell.list.*`）
- Test: `src/components/shell/__tests__/UnifiedList.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `UnifiedConversation`；Task 2 的 `formatMessageTime`、`formatUnreadCount`；shadcn `Avatar/AvatarImage/AvatarFallback`（`@/components/ui/avatar`）、`ContextMenu*`（`@/components/ui/context-menu`）、`DropdownMenu*`（`@/components/ui/dropdown-menu`）——导出名以各文件实际为准；`useI18n`。
- Produces:
  - `ListLoading({ message? })`、`ListError({ error, onRetry? })`、`ListEmpty({ message })`
  - `ConversationCard({ conversation, selected, onSelect, onTogglePin, onMarkRead })`
  - `UnifiedList({ conversations, status, error?, selectedId, onSelect, onTogglePin, onMarkRead, onRetry, onCreateGroup, onAddFriend, onJoinGroup })`——纯展示（不读 store、不读路由），第 5 步接线。
  - i18n key：`shell.list.searchPlaceholder`（搜索会话）、`shell.list.add`（添加）、`shell.list.createGroup`（创建群聊）、`shell.list.addFriend`（添加好友）、`shell.list.joinGroup`（加入群）、`shell.list.pin`（置顶）、`shell.list.unpin`（取消置顶）、`shell.list.markRead`（标记已读）、`shell.list.noMessage`（暂无消息）、`shell.list.loading`（加载中...）、`shell.list.loadFailed`（加载失败）、`shell.list.retry`（重试）、`shell.list.empty`（还没有会话，先去添加好友或创建群聊）、`shell.list.noMatch`（没有匹配的会话）、`shell.list.groupTag`（[群聊]）

- [ ] **Step 1: 写失败的测试**

`src/components/shell/__tests__/UnifiedList.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnifiedConversation } from '@/features/chat/hooks/useUnifiedConversations'
import { UnifiedList } from '../UnifiedList'

const conv = (id: string, extra: Partial<UnifiedConversation> = {}): UnifiedConversation => ({
  id, kind: id.startsWith('f-') ? 'friend' : 'group', targetId: id.slice(2), name: id, avatarUrl: null,
  preview: null, lastMessageTime: null, unreadCount: 0, pinned: false, ...extra,
})

const noop = () => {}
const base = {
  status: 'ready' as const, selectedId: null, onSelect: noop, onTogglePin: noop, onMarkRead: noop,
  onRetry: noop, onCreateGroup: noop, onAddFriend: noop, onJoinGroup: noop,
}

describe('UnifiedList', () => {
  it('三态：loading / error（可重试）/ empty 各自渲染，且互斥', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<UnifiedList {...base} conversations={[]} status="loading" />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
    rerender(<UnifiedList {...base} conversations={[]} status="error" error="网络断了" onRetry={onRetry} />)
    expect(screen.getByText(/加载失败/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
    rerender(<UnifiedList {...base} conversations={[]} status="ready" />)
    expect(screen.getByText(/还没有会话/)).toBeInTheDocument()
  })

  it('卡片显示名字、预览、未读角标（99+ 截断）、[群聊] 标记与置顶标识', () => {
    render(
      <UnifiedList
        {...base}
        conversations={[
          conv('g-g1', { name: '读书会', preview: '张三: 明天见', unreadCount: 120, pinned: true }),
          conv('f-alice', { name: '小爱', preview: '在吗', unreadCount: 2 }),
        ]}
      />,
    )
    expect(screen.getByText('读书会')).toBeInTheDocument()
    expect(screen.getByText('张三: 明天见')).toBeInTheDocument()
    expect(screen.getByText('99+')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('[群聊]')).toBeInTheDocument()
    // 正对照：两张卡片只有一张置顶——getAllByTitle 恰好 1，证明标识不是恒渲染
    expect(screen.getAllByTitle('已置顶')).toHaveLength(1)
  })

  it('点击卡片回调 onSelect(id)；选中项带 data-selected', () => {
    const onSelect = vi.fn()
    render(<UnifiedList {...base} onSelect={onSelect} selectedId="f-alice" conversations={[conv('f-alice', { name: '小爱' }), conv('f-bob', { name: '小波' })]} />)
    fireEvent.click(screen.getByText('小波'))
    expect(onSelect).toHaveBeenCalledWith('f-bob')
    expect(screen.getByTestId('conversation-f-alice')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('conversation-f-bob')).toHaveAttribute('data-selected', 'false')
  })

  it('搜索框按名字与预览过滤（本地，不分大小写），无匹配时显示提示', () => {
    render(<UnifiedList {...base} conversations={[conv('f-alice', { name: 'Alice', preview: '在吗' }), conv('f-bob', { name: 'Bob', preview: '明天见' })]} />)
    fireEvent.change(screen.getByPlaceholderText('搜索会话'), { target: { value: 'ali' } })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('搜索会话'), { target: { value: '明天' } })
    expect(screen.getByText('Bob')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('搜索会话'), { target: { value: 'zzz' } })
    expect(screen.getByText('没有匹配的会话')).toBeInTheDocument()
  })

  it('右键菜单：置顶/取消置顶文案随状态变，标记已读回调', async () => {
    const onTogglePin = vi.fn()
    const onMarkRead = vi.fn()
    render(<UnifiedList {...base} onTogglePin={onTogglePin} onMarkRead={onMarkRead} conversations={[conv('f-alice', { name: '小爱', pinned: true, unreadCount: 3 })]} />)
    fireEvent.contextMenu(screen.getByText('小爱'))
    fireEvent.click(await screen.findByText('取消置顶'))
    expect(onTogglePin).toHaveBeenCalledWith('f-alice')
    fireEvent.contextMenu(screen.getByText('小爱'))
    fireEvent.click(await screen.findByText('标记已读'))
    expect(onMarkRead).toHaveBeenCalledWith('f-alice')
  })

  it('「添加」菜单三项各自回调', async () => {
    const onCreateGroup = vi.fn(); const onAddFriend = vi.fn(); const onJoinGroup = vi.fn()
    render(<UnifiedList {...base} conversations={[]} onCreateGroup={onCreateGroup} onAddFriend={onAddFriend} onJoinGroup={onJoinGroup} />)
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    fireEvent.click(await screen.findByText('创建群聊'))
    expect(onCreateGroup).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    fireEvent.click(await screen.findByText('添加好友'))
    expect(onAddFriend).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    fireEvent.click(await screen.findByText('加入群'))
    expect(onJoinGroup).toHaveBeenCalledTimes(1)
  })
})
```

（Radix 的 `ContextMenu` / `DropdownMenu` 在 happy-dom 下弹层是异步挂载的，所以用 `findByText`。Radix 菜单项的回调是 `onSelect`，不是 `onClick`；若 `fireEvent.click` 触发不了 `onSelect`，改用 `@testing-library/user-event` 的 `userEvent.click`——仓里已有该依赖。）

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell 2>&1 | tail -6`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 写实现**

`src/i18n/messages.ts`：在 `zhCN` 与 `enUS` 各加一个顶层 `shell` 对象（放在 `nav` 之后）：

```ts
  shell: {
    list: {
      searchPlaceholder: '搜索会话', add: '添加', createGroup: '创建群聊', addFriend: '添加好友', joinGroup: '加入群',
      pin: '置顶', unpin: '取消置顶', markRead: '标记已读', noMessage: '暂无消息', loading: '加载中...',
      loadFailed: '加载失败', retry: '重试', empty: '还没有会话，先去添加好友或创建群聊', noMatch: '没有匹配的会话', groupTag: '[群聊]',
    },
  },
```

英文：`searchPlaceholder: 'Search conversations', add: 'Add', createGroup: 'Create group', addFriend: 'Add friend', joinGroup: 'Join group', pin: 'Pin', unpin: 'Unpin', markRead: 'Mark as read', noMessage: 'No messages yet', loading: 'Loading...', loadFailed: 'Failed to load', retry: 'Retry', empty: 'No conversations yet — add a friend or create a group', noMatch: 'No matching conversations', groupTag: '[Group]'`。

`src/components/shell/ListStates.tsx`（APP `ListStates.tsx` 移植）：

```tsx
import { Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

const base = 'flex flex-col items-center justify-center gap-2 px-4 py-8 text-[13px] text-app-light'

export function ListLoading({ message }: { message?: string }) {
  const { t } = useI18n()
  return (
    <div className={base} role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{message ?? t('shell.list.loading')}</span>
    </div>
  )
}

export function ListError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className={`${base} text-destructive`} role="alert">
      <span>{t('shell.list.loadFailed')}: {error}</span>
      {onRetry && (
        <button type="button" className="subtle-btn" onClick={onRetry}>{t('shell.list.retry')}</button>
      )}
    </div>
  )
}

export function ListEmpty({ message }: { message: string }) {
  return <div className={base}><span>{message}</span></div>
}
```

`src/components/shell/ConversationCard.tsx`（APP `UnifiedList.tsx` 的 `conversation-item` 标记 + `main.css` 对应规则，Tailwind 化）：

```tsx
import { Pin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { UnifiedConversation } from '@/features/chat/hooks/useUnifiedConversations'
import { formatMessageTime } from '@/features/chat/lib/formatMessageTime'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'

interface ConversationCardProps {
  conversation: UnifiedConversation
  selected: boolean
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onMarkRead: (id: string) => void
}

export function ConversationCard({ conversation: c, selected, onSelect, onTogglePin, onMarkRead }: ConversationCardProps) {
  const { t } = useI18n()
  const unread = formatUnreadCount(c.unreadCount)
  const time = c.lastMessageTime ? formatMessageTime(c.lastMessageTime) : ''
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-testid={`conversation-${c.id}`}
          data-selected={selected ? 'true' : 'false'}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(c.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id) } }}
          className={cn(
            // APP .conversation-item：玻璃卡片 + 12px 圆角 + 卡片专用透明度
            'relative mb-1 flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 transition-[background,box-shadow,border-color] duration-200',
            'bg-[linear-gradient(135deg,var(--card-bg-start),var(--card-bg-end))] border-[var(--card-border)] shadow-[0_2px_8px_rgba(0,0,0,0.04)]',
            'backdrop-blur-[20px] backdrop-saturate-[180%]',
            'hover:bg-[linear-gradient(135deg,var(--card-bg-hover-start),var(--card-bg-hover-end))] hover:shadow-[0_4px_12px_rgba(59,130,246,0.08)]',
            // APP .conversation-selected-border：外扩 3px 的主色描边
            selected && 'outline outline-2 outline-offset-[3px] outline-primary',
          )}
        >
          <Avatar className="h-12 w-12 shrink-0 rounded-[12px] border-[1.5px] border-[var(--white-alpha-80)]">
            {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
            <AvatarFallback className="rounded-[12px] bg-[linear-gradient(135deg,var(--white-alpha-80),var(--white-alpha-50))] text-app-light">
              {c.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex min-w-0 flex-1 items-center gap-1 text-[14px] font-semibold text-foreground">
                {c.kind === 'group' && <span className="shrink-0 text-[10px] font-medium text-[var(--color-primary-5)]">{t('shell.list.groupTag')}</span>}
                <span className="block min-w-0 flex-1 truncate" title={c.name}>{c.name}</span>
              </span>
              {time && <span className="shrink-0 select-none text-[11px] text-app-light">{time}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 select-none truncate text-[12px] text-muted-foreground" title={c.preview ?? undefined}>
                {c.preview ?? t('shell.list.noMessage')}
              </span>
              {c.pinned && <span className="inline-flex shrink-0 text-muted-foreground" title="已置顶"><Pin className="h-3.5 w-3.5" /></span>}
              {unread && (
                <span className="ml-2 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[9px] bg-unread px-1.5 text-[10px] font-semibold text-[var(--unread-badge-text)]">
                  {unread}
                </span>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="glass-surface min-w-[160px] rounded-[14px] border-[var(--glass-border)]">
        <ContextMenuItem onSelect={() => onTogglePin(c.id)}>{c.pinned ? t('shell.list.unpin') : t('shell.list.pin')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => onMarkRead(c.id)} disabled={c.unreadCount === 0}>{t('shell.list.markRead')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
```

`src/components/shell/UnifiedList.tsx`：

```tsx
import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { UnifiedConversation } from '@/features/chat/hooks/useUnifiedConversations'
import { useI18n } from '@/i18n/I18nProvider'
import { ConversationCard } from './ConversationCard'
import { ListEmpty, ListError, ListLoading } from './ListStates'

export interface UnifiedListProps {
  conversations: UnifiedConversation[]
  status: 'loading' | 'error' | 'ready'
  error?: string
  selectedId: string | null
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onMarkRead: (id: string) => void
  onRetry: () => void
  onCreateGroup: () => void
  onAddFriend: () => void
  onJoinGroup: () => void
}

/** 统一会话列表（APP UnifiedList 的展示部分；数据与路由由第 5 步的壳接线） */
export function UnifiedList(props: UnifiedListProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return props.conversations
    return props.conversations.filter((c) => c.name.toLowerCase().includes(q) || (c.preview ?? '').toLowerCase().includes(q))
  }, [props.conversations, query])

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* APP .search-box + AddMenu */}
      <div className="flex shrink-0 items-center gap-2 p-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[var(--white-alpha-70)] bg-[var(--white-alpha-60)] px-3 py-2 focus-within:border-[var(--border-strong)] focus-within:shadow-[0_0_0_3px_var(--primary-subtle)]">
          <Search className="h-4 w-4 shrink-0 text-app-light" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('shell.list.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-app-light"
          />
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={t('shell.list.add')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-[var(--primary-subtle)] hover:text-primary">
              <Plus className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-surface min-w-[160px] rounded-[14px] border-[var(--glass-border)]">
            <DropdownMenuItem onSelect={props.onCreateGroup}>{t('shell.list.createGroup')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onAddFriend}>{t('shell.list.addFriend')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={props.onJoinGroup}>{t('shell.list.joinGroup')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* APP .conversation-list：右侧 2px + 滚动条槽 6px = 左侧 8px，各 tab 卡片等宽 */}
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto py-2 pl-2 pr-0.5 [scrollbar-gutter:stable]">
        {props.status === 'loading' && <ListLoading />}
        {props.status === 'error' && <ListError error={props.error ?? ''} onRetry={props.onRetry} />}
        {props.status === 'ready' && props.conversations.length === 0 && <ListEmpty message={t('shell.list.empty')} />}
        {props.status === 'ready' && props.conversations.length > 0 && filtered.length === 0 && <ListEmpty message={t('shell.list.noMatch')} />}
        {props.status === 'ready' && filtered.map((c) => (
          <ConversationCard
            key={c.id}
            conversation={c}
            selected={c.id === props.selectedId}
            onSelect={props.onSelect}
            onTogglePin={props.onTogglePin}
            onMarkRead={props.onMarkRead}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行确认通过**

Run: `bun run test src/components/shell 2>&1 | tail -8`
Expected: PASS，6 条。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `formatUnreadCount` 调用改成 `String(c.unreadCount)` | 「99+ 截断」红 |
| 搜索只按 `name` 过滤（去掉 preview） | 「按名字与预览过滤」红（`明天` 找不到 Bob） |
| `data-selected` 恒为 `'false'` | 「选中项带 data-selected」红 |
| `ContextMenuItem` 文案不随 `pinned` 变（恒「置顶」） | 「文案随状态变」红 |
| `status === 'ready' && conversations.length === 0` 的空态改成也在 loading 时渲染 | 「互斥」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/components/shell/ListStates.tsx src/components/shell/ConversationCard.tsx src/components/shell/UnifiedList.tsx src/components/shell/__tests__/UnifiedList.test.tsx src/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat(shell): 统一会话列表组件——卡片 / 三态 / 搜索 / 添加菜单 / 右键菜单

按 APP UnifiedList 的标记与 main.css 规则重写为 Tailwind + token：玻璃卡片、[群聊] 标记、
备注优先的名字、服务端预览、时间文案、未读角标（99+）、置顶图钉、选中外描边；
右键菜单置顶/取消置顶、标记已读；「+」菜单创建群聊/添加好友/加入群。纯展示组件，
数据与路由第 5 步接线。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 壳与聊天主路径——`Sidebar`、`AppShell`、`EmptyContent`、壳布局路由、`/app/chat/:conversationId`

**Files:**
- Create: `src/components/shell/sidebarTools.tsx`
- Create: `src/components/shell/Sidebar.tsx`
- Create: `src/components/shell/EmptyContent.tsx`
- Create: `src/components/shell/AppShell.tsx`
- Create: `src/features/chat/hooks/useRouteConversation.ts`
- Create: `src/app/routes/app-shell.tsx`
- Create: `src/app/routes/legacy-layout.tsx`
- Create: `src/app/routes/shell/chat.tsx`
- Create: `src/app/routes/shell/chat.$conversationId.tsx`
- Modify: `src/app/routes/protected-layout.tsx`
- Modify: `src/app/routes.ts`
- Modify: `src/i18n/messages.ts`（`shell.nav.*`、`shell.empty.*`）
- Modify: `src/app/routes/app-index.tsx`（`last_visited_path` 只接受新 URL）
- Test: `src/components/shell/__tests__/Sidebar.test.tsx`、`src/features/chat/hooks/__tests__/useRouteConversation.test.ts`、`src/app/routes/__tests__/appShellRoutes.test.tsx`

**Interfaces:**
- Consumes: Task 3/4 的 hook 与 `UnifiedList`；Task 2 的 `ROUTES`/`chatPath`/`parseConversationId`；`useChatStore().{ totalUnreadCount, markRead, setSelectedConversation }`；`useFriendsStore().{ friends, isLoading, error, pendingRequests, loadFriends, loadPendingRequests, loadSentRequests }`；`useGroupStore().{ myGroups, isLoading, loadMyGroups }`；`useProfileStore().{ profile, loadProfile }`（`profile.user_avatar_url` 已是绝对地址）；`useWSStore().{ connect, connected }`（`connect` 已有「已连接/连接中就返回」的守卫）；`useSettingsStore().{ theme, setSetting }`；`useAuthStore().{ user, isAuthenticated }`（`user.avatar_url / user.nickname` 是侧栏头像的回落来源——`profile` 还没加载时用它，见原 `Navigation.tsx` 的注释）；`toAbsoluteApiUrl`（`@/lib/apiConfig`，空串/空值一律得到 `undefined`）；`ChatWindow`（`@/features/chat/components/ChatWindow`，props `hideMobileHeader?`，它读 `chatStore.selectedConversation`）；`useRouter/usePathname`（`@/lib/navigation`）。
- Produces:
  - `SIDEBAR_TOOLS: ReadonlyArray<SidebarTool>`，`interface SidebarTool { key: SidebarToolKey; labelKey: string; icon: LucideIcon; to: string }`，`type SidebarToolKey = 'meeting' | 'files' | 'bots' | 'miniapps' | 'ai'`
  - `Sidebar({ activeTab: 'chat' | 'contacts'; pinnedTools?: ReadonlyArray<SidebarTool> })`（本任务 `pinnedTools` 恒空、「更多」是 Popover；第 9 步换成拖拽版）
  - `AppShell({ activeTab, list: ReactNode, children })`
  - `EmptyContent({ hint: 'chat' | 'contacts' })`
  - `useRouteConversation(conversationId: string | undefined): 'idle' | 'loading' | 'ready' | 'missing'`
  - 路由：`/app/chat`、`/app/chat/:conversationId` 在 `app-shell.tsx` 之下；`legacy-layout.tsx` 包住其余旧页面（第 11 步删）。

- [ ] **Step 1: 写失败的测试**

`src/components/shell/__tests__/Sidebar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { makeProfile } from '@/features/profile/api/__tests__/profileFixture'
import { Sidebar } from '../Sidebar'

const renderAt = (path: string, activeTab: 'chat' | 'contacts') =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <Sidebar activeTab={activeTab} /> }], { initialEntries: [path] })} />)

describe('Sidebar', () => {
  beforeEach(() => {
    useChatStore.setState({ totalUnreadCount: 0 })
    useFriendsStore.setState({ pendingRequests: [] })
    useProfileStore.setState({ profile: makeProfile({ user_nickname: '爱丽丝', user_avatar_url: 'https://cdn.test/a.png' }) })
  })

  it('两个 tab 链接到 /app/chat 与 /app/contacts，当前 tab 带 aria-current', () => {
    renderAt('/app/chat', 'chat')
    expect(screen.getByRole('link', { name: '消息' })).toHaveAttribute('href', '/app/chat')
    expect(screen.getByRole('link', { name: '联系人' })).toHaveAttribute('href', '/app/contacts')
    expect(screen.getByRole('link', { name: '消息' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '联系人' })).not.toHaveAttribute('aria-current')
  })

  it('未读总数与待处理申请数各自成角标（99+ 截断）；为 0 时不渲染', () => {
    useChatStore.setState({ totalUnreadCount: 120 })
    useFriendsStore.setState({ pendingRequests: [{ request_id: 'r1' } as never, { request_id: 'r2' } as never] })
    const first = renderAt('/app/chat', 'chat')
    expect(screen.getByTestId('badge-chat')).toHaveTextContent('99+')
    expect(screen.getByTestId('badge-contacts')).toHaveTextContent('2')
    first.unmount()
    useChatStore.setState({ totalUnreadCount: 0 })
    useFriendsStore.setState({ pendingRequests: [] })
    renderAt('/app/chat', 'chat')
    expect(screen.queryByTestId('badge-chat')).toBeNull()
    expect(screen.queryByTestId('badge-contacts')).toBeNull()
  })

  it('头像链接到 /app/profile，用绝对地址渲染 img', () => {
    renderAt('/app/chat', 'chat')
    const avatar = screen.getByRole('link', { name: '个人资料' })
    expect(avatar).toHaveAttribute('href', '/app/profile')
    expect(avatar.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/a.png')
  })

  it('「更多」面板列出五个工具并链接到各自 URL；设置链接到 /app/settings', async () => {
    renderAt('/app/chat', 'chat')
    screen.getByRole('button', { name: '更多功能' }).click()
    expect(await screen.findByRole('link', { name: '视频会议' })).toHaveAttribute('href', '/app/meeting')
    expect(screen.getByRole('link', { name: '我的文件' })).toHaveAttribute('href', '/app/files')
    expect(screen.getByRole('link', { name: '机器人' })).toHaveAttribute('href', '/app/bots')
    expect(screen.getByRole('link', { name: '小程序' })).toHaveAttribute('href', '/app/miniapps')
    expect(screen.getByRole('link', { name: 'AI 助手' })).toHaveAttribute('href', '/app/ai-chat')
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/app/settings')
  })
})
```

`src/features/chat/hooks/__tests__/useRouteConversation.test.ts`：

```ts
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { useRouteConversation } from '../useRouteConversation'

const friend = { friend_id: 'alice', friend_nickname: '爱丽丝', friend_avatar_url: 'https://cdn.test/a.png', add_time: '', approve_reason: null, friend_remark: '小爱', is_blacklisted: false, is_special_care: false }
const group = { group_id: 'g1', group_name: '读书会', group_avatar_url: null, role: 'member', unread_count: 2, last_message_content: '晚安', last_message_time: '2026-09-10T00:00:00Z' } as never

describe('useRouteConversation：URL → chatStore.selectedConversation', () => {
  beforeEach(() => {
    useFriendsStore.setState({ friends: [friend], isLoading: false })
    useGroupStore.setState({ myGroups: [group], isLoading: false })
    useChatStore.setState({ selectedConversation: null })
  })

  it('f-<uid> 解析成好友会话，形状与旧 FriendList 写入的一致', () => {
    const { result } = renderHook(() => useRouteConversation('f-alice'))
    expect(result.current).toBe('ready')
    expect(useChatStore.getState().selectedConversation).toEqual({
      id: 'alice', type: 'friend', name: '小爱', avatar: 'https://cdn.test/a.png', unreadCount: 0, online: false,
    })
  })

  it('g-<gid> 解析成群会话，带未读与最后消息', () => {
    const { result } = renderHook(() => useRouteConversation('g-g1'))
    expect(result.current).toBe('ready')
    expect(useChatStore.getState().selectedConversation).toMatchObject({ id: 'g1', type: 'group', name: '读书会', unreadCount: 2, lastMessage: '晚安' })
  })

  it('stores 还在加载时是 loading；加载完仍找不到是 missing；两种都不写 store', () => {
    useFriendsStore.setState({ isLoading: true })
    const loading = renderHook(() => useRouteConversation('f-nobody'))
    expect(loading.result.current).toBe('loading')
    loading.unmount()
    useFriendsStore.setState({ isLoading: false })
    const missing = renderHook(() => useRouteConversation('f-nobody'))
    expect(missing.result.current).toBe('missing')
    expect(useChatStore.getState().selectedConversation).toBe(null)
  })

  it('没有 id 时是 idle 并把 store 清成 null；卸载也清', () => {
    renderHook(() => useRouteConversation('f-alice')).unmount()
    expect(useChatStore.getState().selectedConversation).toBe(null)
    useChatStore.setState({ selectedConversation: { id: 'x', type: 'friend', name: 'x', unreadCount: 0 } })
    const { result } = renderHook(() => useRouteConversation(undefined))
    expect(result.current).toBe('idle')
    expect(useChatStore.getState().selectedConversation).toBe(null)
  })
})
```

`src/app/routes/__tests__/appShellRoutes.test.tsx`（钉路由表本身，不渲染组件）：

```tsx
import { describe, expect, it } from 'vitest'
import routes from '../../routes'

interface RouteEntry { file: string; path?: string; index?: boolean; children?: RouteEntry[] }

/** 把 @react-router/dev/routes 的 RouteConfig 拍平成 "file@fullPath" */
function flatten(entries: RouteEntry[], prefix = ''): string[] {
  const out: string[] = []
  for (const e of entries) {
    const full = e.index ? `${prefix}/` : e.path ? `${prefix}/${e.path}` : prefix
    out.push(`${e.file}@${full || '/'}`)
    if (e.children) out.push(...flatten(e.children, e.path ? `${prefix}/${e.path}` : prefix))
  }
  return out
}

describe('路由表：壳布局承载 /app/chat', () => {
  it('app-shell.tsx 之下有 /app/chat 与 /app/chat/:conversationId，旧的 routes/chat.tsx 不再注册', () => {
    const flat = flatten(routes as unknown as RouteEntry[])
    expect(flat).toContain('routes/app-shell.tsx@/')
    expect(flat).toContain('routes/shell/chat.tsx@/app/chat')
    expect(flat).toContain('routes/shell/chat.$conversationId.tsx@/app/chat/:conversationId')
    expect(flat.some((x) => x.startsWith('routes/chat.tsx@'))).toBe(false)
    // 正对照：旧页面这一步还在（legacy-layout 之下），证明 flatten 读到了整张表
    expect(flat).toContain('routes/friends.tsx@/app/friends')
  })
})
```

（`route()`/`layout()`/`index()` 返回的就是 `{ file, path?, index?, children? }` 形状的对象；`layout()` 没有 `path`。若 `routes` 默认导出是异步/函数，改成 `await routes`。）

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell/__tests__/Sidebar.test.tsx src/features/chat/hooks/__tests__/useRouteConversation.test.ts src/app/routes/__tests__/appShellRoutes.test.tsx 2>&1 | tail -8`
Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/i18n/messages.ts` 的 `shell` 对象里追加（zh；en 见下）：

```ts
    nav: { chat: '消息', contacts: '联系人', more: '更多功能', settings: '设置', profile: '个人资料', theme: '切换明暗', meeting: '视频会议', files: '我的文件', bots: '机器人', miniapps: '小程序', ai: 'AI 助手', backToList: '返回列表' },
    empty: { title: '欢迎使用 Huanvae Chat', chat: '选择一个会话开始聊天', contacts: '选择一个联系人查看资料' },
```

英文：`nav: { chat: 'Chats', contacts: 'Contacts', more: 'More', settings: 'Settings', profile: 'Profile', theme: 'Toggle theme', meeting: 'Meetings', files: 'My files', bots: 'Bots', miniapps: 'Mini apps', ai: 'AI assistant', backToList: 'Back to list' }, empty: { title: 'Welcome to Huanvae Chat', chat: 'Pick a conversation to start chatting', contacts: 'Pick a contact to see their profile' }`。

`src/components/shell/sidebarTools.tsx`：

```tsx
import { Bot, FolderOpen, LayoutGrid, Sparkles, Video, type LucideIcon } from 'lucide-react'
import { ROUTES } from '@/lib/routes'

/** 侧栏「更多」面板的工具注册表——第 2/4/5/6 期加条目的唯一入口（spec §13） */
export type SidebarToolKey = 'meeting' | 'files' | 'bots' | 'miniapps' | 'ai'

export interface SidebarTool {
  key: SidebarToolKey
  /** i18n key：shell.nav.<key> */
  labelKey: string
  icon: LucideIcon
  to: string
}

export const SIDEBAR_TOOLS: ReadonlyArray<SidebarTool> = [
  { key: 'meeting', labelKey: 'shell.nav.meeting', icon: Video, to: ROUTES.app.meeting },
  { key: 'files', labelKey: 'shell.nav.files', icon: FolderOpen, to: ROUTES.app.files },
  { key: 'bots', labelKey: 'shell.nav.bots', icon: Bot, to: ROUTES.app.bots },
  { key: 'miniapps', labelKey: 'shell.nav.miniapps', icon: LayoutGrid, to: ROUTES.app.miniapps },
  { key: 'ai', labelKey: 'shell.nav.ai', icon: Sparkles, to: ROUTES.app.aiChat },
]
```

`src/components/shell/Sidebar.tsx`（APP `Sidebar.tsx` 的 avatar / nav / bottom 三区 + `.chat-sidebar/.nav-btn/.online-indicator` 样式）：

```tsx
import { MessageCircle, Moon, MoreHorizontal, Settings, Sun, Users } from 'lucide-react'
import { NavLink } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuthStore } from '@/features/auth/store/authStore'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWSStore } from '@/store/wsStore'
import { SIDEBAR_TOOLS, type SidebarTool } from './sidebarTools'

interface SidebarProps {
  activeTab: 'chat' | 'contacts'
  /** 第 9 步：钉在侧栏上的工具；本任务恒空 */
  pinnedTools?: ReadonlyArray<SidebarTool>
}

/** APP .nav-btn：42px 圆角 12，hover 主色淡底，active 渐变底 */
const navBtn = 'flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-muted-foreground transition-all duration-200 hover:bg-[var(--primary-subtle)] hover:text-primary [&>svg]:h-[22px] [&>svg]:w-[22px]'
const navBtnActive = 'bg-[var(--primary-subtle)] text-[var(--primary-hover)]'

function Badge({ value, testId }: { value: string; testId: string }) {
  if (!value) return null
  return (
    <span data-testid={testId} className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-unread px-1 text-[10px] font-semibold text-[var(--unread-badge-text)]">
      {value}
    </span>
  )
}

export function Sidebar({ activeTab, pinnedTools = [] }: SidebarProps) {
  const { t } = useI18n()
  const totalUnread = useChatStore((s) => s.totalUnreadCount)
  const pendingCount = useFriendsStore((s) => s.pendingRequests.length)
  const profile = useProfileStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const connected = useWSStore((s) => s.connected)
  const theme = useSettingsStore((s) => s.theme)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  // 头像：profile 优先，回落到 authStore 的 user（profile 还没加载时侧栏已经在渲染）；空串当"没有头像"——
  // 裸 <img src=""> 会让 React 告警并重下整页。`||` 而不是 `??`：空串必须继续往后找。
  const avatarSrc = toAbsoluteApiUrl(profile?.user_avatar_url || user?.avatar_url) ?? null
  const avatarInitial = (profile?.user_nickname || user?.nickname || 'U')[0]?.toUpperCase() ?? 'U'

  return (
    <aside data-testid="sidebar" className="glass-surface z-10 flex h-full w-[60px] flex-col items-center border-r border-[var(--glass-border)] py-4">
      {/* APP .sidebar-avatar + .online-indicator */}
      <NavLink to={ROUTES.app.profile} aria-label={t('shell.nav.profile')} title={t('shell.nav.profile')} className="relative mb-6 block h-10 w-10 overflow-hidden rounded-[10px] border-2 border-[var(--white-alpha-90)] bg-[linear-gradient(135deg,var(--white-alpha-80),var(--white-alpha-50))] shadow-[0_4px_12px_rgba(59,130,246,0.15)]">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-app-light">{avatarInitial}</span>
        )}
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--presence-dot-ring)]', connected ? 'bg-app-success' : 'bg-destructive')} />
      </NavLink>

      {/* APP .sidebar-nav */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        <NavLink to={ROUTES.app.chat} title={t('shell.nav.chat')} aria-label={t('shell.nav.chat')} aria-current={activeTab === 'chat' ? 'page' : undefined} className={cn(navBtn, 'relative', activeTab === 'chat' && navBtnActive)}>
          <MessageCircle />
          <Badge value={formatUnreadCount(totalUnread)} testId="badge-chat" />
        </NavLink>
        <NavLink to={ROUTES.app.contacts} title={t('shell.nav.contacts')} aria-label={t('shell.nav.contacts')} aria-current={activeTab === 'contacts' ? 'page' : undefined} className={cn(navBtn, 'relative', activeTab === 'contacts' && navBtnActive)}>
          <Users />
          <Badge value={formatUnreadCount(pendingCount)} testId="badge-contacts" />
        </NavLink>
        {pinnedTools.map((tool) => (
          <NavLink key={tool.key} to={tool.to} title={t(tool.labelKey)} aria-label={t(tool.labelKey)} className={navBtn}>
            <tool.icon />
          </NavLink>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" title={t('shell.nav.more')} aria-label={t('shell.nav.more')} className={navBtn}><MoreHorizontal /></button>
          </PopoverTrigger>
          {/* APP .sidebar-more-panel */}
          <PopoverContent side="right" align="start" className="glass-surface w-[210px] rounded-[14px] border-[var(--glass-border)] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.14)]">
            <div className="mb-1.5 border-b border-[var(--border-subtle)] px-2.5 pb-2.5 pt-1.5 text-[13px] font-semibold text-foreground">{t('shell.nav.more')}</div>
            <div className="flex flex-col gap-0.5">
              {SIDEBAR_TOOLS.filter((tool) => !pinnedTools.some((p) => p.key === tool.key)).map((tool) => (
                <NavLink key={tool.key} to={tool.to} className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] text-foreground transition-colors hover:bg-[var(--primary-subtle)]">
                  <tool.icon className="h-[18px] w-[18px] text-muted-foreground" />
                  <span>{t(tool.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </nav>

      {/* APP .sidebar-bottom */}
      <div className="flex flex-col items-center gap-2">
        <NavLink to={ROUTES.app.settings} title={t('shell.nav.settings')} aria-label={t('shell.nav.settings')} className={({ isActive }) => cn(navBtn, isActive && navBtnActive)}>
          <Settings />
        </NavLink>
        <button type="button" title={t('shell.nav.theme')} aria-label={t('shell.nav.theme')} className={navBtn} onClick={() => setSetting('theme', isDark ? 'light' : 'dark')}>
          {isDark ? <Sun /> : <Moon />}
        </button>
      </div>
    </aside>
  )
}
```

（`NavLink` 的 `aria-label` 与可见文字都缺时，可访问名来自 `aria-label`——测试用 `getByRole('link', { name: '消息' })` 正是靠它；`title` 只做悬停提示。）

`src/components/shell/EmptyContent.tsx`（APP `EmptyChat` 移植；不显示 serverUrl——Web 同源没有这个概念）：

```tsx
import { motion } from 'framer-motion'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useI18n } from '@/i18n/I18nProvider'

export function EmptyContent({ hint }: { hint: 'chat' | 'contacts' }) {
  const { t } = useI18n()
  const nickname = useProfileStore((s) => s.profile?.user_nickname)
  return (
    <motion.div className="flex h-full flex-1 items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }}>
      <div className="text-center">
        <div className="mb-4 text-5xl">💬</div>
        <h3 className="mb-2 text-xl font-semibold text-foreground">{t('shell.empty.title')}</h3>
        <p className="text-muted-foreground">{t(`shell.empty.${hint}`)}</p>
        {nickname && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary-subtle)] px-3 py-1 text-[12px] text-[var(--primary-text)]">{nickname}</div>}
      </div>
    </motion.div>
  )
}
```

`src/components/shell/AppShell.tsx`（本任务只做桌面三栏；折叠是第 10 步）：

```tsx
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'

interface AppShellProps {
  activeTab: 'chat' | 'contacts'
  list: ReactNode
  children: ReactNode
}

/** APP Main.tsx 的三栏：Sidebar 60 ｜ 列表 320 ｜ 内容 */
export function AppShell({ activeTab, list, children }: AppShellProps) {
  return (
    <div className="grid h-[100dvh] w-screen grid-cols-[60px_320px_1fr] overflow-hidden bg-[var(--gradient-bg-page)] text-foreground">
      <Sidebar activeTab={activeTab} />
      <section data-testid="list-column" className="glass-surface flex min-h-0 flex-col border-r border-[var(--glass-border)]">{list}</section>
      <main data-testid="content-column" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</main>
    </div>
  )
}
```

`src/features/chat/hooks/useRouteConversation.ts`：

```ts
import { useEffect } from 'react'
import { parseConversationId } from '../lib/conversationId'
import { friendDisplayName } from '../lib/friendName'
import { useChatStore } from '../store/chatStore'
import { useFriendsStore } from '../store/friendsStore'
import { useGroupStore } from '../store/groupStore'

export type RouteConversationStatus = 'idle' | 'loading' | 'ready' | 'missing'

/**
 * URL 里的 :conversationId → `chatStore.selectedConversation`。
 * 这是全仓**唯一**写 `selectedConversation` 的地方（spec §3：URL 是选中态的唯一真值）；
 * 写入的对象形状与迁移前 FriendList / GroupList 点击时写的一致，ChatWindow 不必改。
 */
export function useRouteConversation(conversationId: string | undefined): RouteConversationStatus {
  const friends = useFriendsStore((s) => s.friends)
  const friendsLoading = useFriendsStore((s) => s.isLoading)
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)
  const setSelectedConversation = useChatStore((s) => s.setSelectedConversation)

  const parsed = conversationId ? parseConversationId(conversationId) : null
  const friend = parsed?.kind === 'friend' ? friends.find((f) => f.friend_id === parsed.userId) : undefined
  const group = parsed?.kind === 'group' ? groups.find((g) => g.group_id === parsed.groupId) : undefined

  let status: RouteConversationStatus
  if (!conversationId) status = 'idle'
  else if (friend || group) status = 'ready'
  else if (friendsLoading || groupsLoading) status = 'loading'
  else status = 'missing'

  useEffect(() => {
    if (friend) {
      setSelectedConversation({ id: friend.friend_id, type: 'friend', name: friendDisplayName(friend), avatar: friend.friend_avatar_url ?? undefined, unreadCount: 0, online: false })
    } else if (group) {
      setSelectedConversation({ id: group.group_id, type: 'group', name: group.group_name, avatar: group.group_avatar_url ?? undefined, unreadCount: group.unread_count || 0, lastMessage: group.last_message_content || undefined, lastTime: group.last_message_time || undefined })
    } else {
      setSelectedConversation(null)
    }
    return () => setSelectedConversation(null)
  }, [friend, group, setSelectedConversation])

  return status
}
```

`src/app/routes/app-shell.tsx`（壳布局路由：数据加载 + 三栏 + 列表栏按 tab 切换）：

```tsx
import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router'
import { AppShell } from '@/components/shell/AppShell'
import { UnifiedList } from '@/components/shell/UnifiedList'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useUnifiedConversations } from '@/features/chat/hooks/useUnifiedConversations'
import { parseConversationId } from '@/features/chat/lib/conversationId'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { usePinnedStore } from '@/features/chat/store/pinnedStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { usePathname, useRouter } from '@/lib/navigation'
import { ROUTES, chatPath } from '@/lib/routes'
import { useWSStore } from '@/store/wsStore'

function shellTabOf(pathname: string): 'chat' | 'contacts' {
  return pathname.startsWith(ROUTES.app.contacts) ? 'contacts' : 'chat'
}

/** 原 ChatPage 的挂载副作用，搬到壳：整个 /app/* 只跑一次 */
function useShellBootstrap() {
  const userId = useAuthStore((s) => s.user?.user_id)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const connect = useWSStore((s) => s.connect)
  const loadProfile = useProfileStore((s) => s.loadProfile)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const loadPendingRequests = useFriendsStore((s) => s.loadPendingRequests)
  const loadSentRequests = useFriendsStore((s) => s.loadSentRequests)
  const loadMyGroups = useGroupStore((s) => s.loadMyGroups)
  useEffect(() => {
    if (!userId || !isAuthenticated) return
    connect()
    loadProfile().catch(console.error)
    loadFriends().catch(console.error)
    loadPendingRequests().catch(console.error)
    loadSentRequests().catch(console.error)
    loadMyGroups().catch(console.error)
  }, [userId, isAuthenticated, connect, loadProfile, loadFriends, loadPendingRequests, loadSentRequests, loadMyGroups])
}

function ChatListColumn() {
  const router = useRouter()
  const { conversationId } = useParams()
  const { conversations, status } = useUnifiedConversations()
  const friendsError = useFriendsStore((s) => s.error)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const loadMyGroups = useGroupStore((s) => s.loadMyGroups)
  const togglePin = usePinnedStore((s) => s.toggle)
  const markRead = useChatStore((s) => s.markRead)
  return (
    <UnifiedList
      conversations={conversations}
      status={friendsError ? 'error' : status}
      error={friendsError ?? undefined}
      selectedId={conversationId ?? null}
      onSelect={(id) => router.push(chatPath(id))}
      onTogglePin={togglePin}
      onMarkRead={(id) => { const p = parseConversationId(id); if (p) markRead(p.kind, p.kind === 'friend' ? p.userId : p.groupId) }}
      onRetry={() => { loadFriends().catch(console.error); loadMyGroups().catch(console.error) }}
      // 第 6 步把三个入口换到 /app/contacts?add=…；过渡期先落到仍然存活的旧页面
      onCreateGroup={() => router.push(ROUTES.app.chatGroups)}
      onAddFriend={() => router.push(ROUTES.app.chatFriends)}
      onJoinGroup={() => router.push(ROUTES.app.chatGroups)}
    />
  )
}

export default function AppShellLayout() {
  useShellBootstrap()
  const pathname = usePathname()
  const tab = shellTabOf(pathname)
  // 原 Navigation.tsx 写的"上次访问路径"（app-index.tsx 读它恢复落点；登出时由 sessionScope 清掉）。壳内每次路径变化都写
  useEffect(() => {
    if (pathname.startsWith('/app')) localStorage.setItem('last_visited_path', pathname)
  }, [pathname])
  return (
    <AppShell activeTab={tab} list={<ChatListColumn />}>
      <Outlet />
    </AppShell>
  )
}
```

`src/app/routes/shell/chat.tsx`（`/app/chat` 索引：有子路由渲染子路由，否则空态）：

```tsx
import { useOutlet } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'

export default function ChatIndex() {
  const outlet = useOutlet()
  return outlet ?? <EmptyContent hint="chat" />
}
```

`src/app/routes/shell/chat.$conversationId.tsx`：

```tsx
import { useEffect } from 'react'
import { useParams } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { ListLoading } from '@/components/shell/ListStates'
import ChatWindow from '@/features/chat/components/ChatWindow'
import { useRouteConversation } from '@/features/chat/hooks/useRouteConversation'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

export default function ChatConversation() {
  const { conversationId } = useParams()
  const router = useRouter()
  const status = useRouteConversation(conversationId)
  useEffect(() => {
    // 加载完仍找不到（被删的好友 / 已退的群 / 手打的错 id）：回到列表，不停在一个空聊天窗口
    if (status === 'missing') router.replace(ROUTES.app.chat)
  }, [status, router])
  if (status === 'loading') return <ListLoading />
  if (status !== 'ready') return <EmptyContent hint="chat" />
  return <ChatWindow hideMobileHeader />
}
```

`src/app/routes/legacy-layout.tsx`（过渡期：旧页面继续用 MainLayout；第 11 步删除）：

```tsx
import { Outlet } from 'react-router'
import MainLayout from '@/components/layout/MainLayout'

export default function LegacyLayout() {
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  )
}
```

`src/app/routes/protected-layout.tsx`：去掉 `MainLayout` 与 `isVideoMeeting` 分支，只保留鉴权与全局资料模态框（`meta` 导出不动）：

```tsx
export default function ProtectedLayout() {
  const { profileModalOpen, closeProfileModal } = useUIStore()
  return (
    <ProtectedRoute>
      <Outlet />
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
```

（同时删掉文件里不再用的 `MainLayout`、`usePathname`、`ROUTES` import。）

`src/app/routes.ts`：把 `layout('routes/protected-layout.tsx', [...])` 改成：

```ts
  layout('routes/protected-layout.tsx', [
    // 壳：spec §3 的三栏。本任务只挂 /app/chat*，后续任务逐条搬入
    layout('routes/app-shell.tsx', [
      route('app/chat', 'routes/shell/chat.tsx', [
        route(':conversationId', 'routes/shell/chat.$conversationId.tsx'),
      ]),
    ]),
    // 过渡期：还没搬进壳的旧页面（第 11 步整段删除）
    layout('routes/legacy-layout.tsx', [
      route('app/friends', 'routes/friends.tsx'),
      route('app/groups', 'routes/groups.tsx'),
      route('app/files', 'routes/files.tsx'),
      route('app/webrtc', 'routes/webrtc.tsx'),
      route('app/ai-chat', 'routes/ai-chat.tsx'),
      route('app/devices', 'routes/devices.tsx'),
      route('app/settings', 'routes/settings.tsx'),
      route('app/profile', 'routes/profile.tsx'),
    ]),
    route('app/video-meeting', 'routes/video-meeting.tsx'),
  ]),
```

（原来的 `route('app/chat', 'routes/chat.tsx')` 删除；`routes/chat.tsx` 文件本任务保留不动，第 11 步删。）

`src/app/routes/app-index.tsx`：`last_visited_path` 只接受新壳的 URL——校验改成 `lastPath.startsWith('/app/chat') || lastPath.startsWith('/app/contacts') || lastPath.startsWith('/app/settings')`，其余一律回 `DEFAULT_AUTHENTICATED_ROUTE`。写入点原来在 `Navigation.tsx`（第 11 步删），现在由上面 `AppShellLayout` 的 effect 写（`sessionHandoff.test.tsx` 只断言登出后这个键被清，与谁写入无关）。

- [ ] **Step 4: 运行确认通过 + 手动冒烟**

Run: `bun run test src/components/shell src/features/chat/hooks src/app/routes/__tests__/appShellRoutes.test.tsx 2>&1 | tail -8`
Expected: PASS。

Run: `bunx react-router typegen && bunx tsc --noEmit`（新路由模块要通过 typegen）。

手动冒烟（必须做，这是主路径）：`bun run dev`，用应用内浏览器登录后打开 `/app/chat`：三栏出现、列表有会话、点击一条 → URL 变成 `/app/chat/f-…` 且右栏出现聊天窗口、浏览器后退回到空态；侧栏「更多」能展开（链接目标此时还是旧页面，正常）。截图存入报告。登录用 owner 提供的测试账号；若没有，用假后端：`FAKE_BACKEND_PORT=39473 bun run tests/fixtures/fake-backend.ts &` 并以 `BFF_UPSTREAM_HTTP=http://127.0.0.1:39473 BFF_UPSTREAM_WS=ws://127.0.0.1:39473` 起 dev，账号 `e2e` / `correct-horse`。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `Sidebar` 的 `aria-current` 恒为 `'page'` | 「当前 tab 带 aria-current」红 |
| `Badge` 在 `value === ''` 时也渲染 | 「为 0 时不渲染」红 |
| `useRouteConversation` 的 `missing` 分支改成 `loading` | 「加载完仍找不到是 missing」红 |
| `useRouteConversation` 卸载时不清 store | 「卸载也清」红 |
| `routes.ts` 里把 `routes/shell/chat.tsx` 放回顶层（不在 app-shell 之下） | 路由表用例红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/components/shell src/features/chat/hooks/useRouteConversation.ts src/features/chat/hooks/__tests__/useRouteConversation.test.ts src/app/routes/app-shell.tsx src/app/routes/legacy-layout.tsx src/app/routes/shell src/app/routes/protected-layout.tsx src/app/routes.ts src/app/routes/app-index.tsx src/app/routes/__tests__/appShellRoutes.test.tsx src/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat(shell): 三栏壳落地——侧栏、统一会话列表、/app/chat/:conversationId

新增壳布局路由 app-shell.tsx：Sidebar（头像/消息·联系人 tab 与角标/更多工具/设置/明暗）、
列表栏（UnifiedList 接 useUnifiedConversations、置顶、标记已读）、内容区（空态或聊天窗口）。
URL 成为选中态的唯一真值：useRouteConversation 把 :conversationId 解析成与旧 FriendList/
GroupList 写入形状一致的 selectedConversation，ChatWindow 不必改；找不到就回列表。
原 ChatPage 的挂载副作用（连 WS、拉资料/好友/申请/群）搬到壳，整个 /app/* 只跑一次。
其余旧页面暂由 legacy-layout 包住 MainLayout，逐任务搬入后第 11 步整段删除。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 联系人栏与右栏详情——`ContactsList`、`ProfileView`、`/app/contacts/*`

**Files:**
- Create: `src/components/shell/ContactsList.tsx`
- Create: `src/components/shell/ProfileView.tsx`
- Create: `src/app/routes/shell/contacts.tsx`、`src/app/routes/shell/contacts.friends.$userId.tsx`、`src/app/routes/shell/contacts.groups.$groupId.tsx`
- Modify: `src/features/chat/components/sidebar/GroupList.tsx`（加一个可选 prop `initialCreateOpen?: boolean`）
- Modify: `src/app/routes/app-shell.tsx`（列表栏按 tab 切换；添加菜单改指向 contacts）
- Modify: `src/app/routes.ts`
- Modify: `src/i18n/messages.ts`（`shell.contacts.*`）
- Test: `src/components/shell/__tests__/ContactsList.test.tsx`、`src/components/shell/__tests__/ProfileView.test.tsx`

**Interfaces:**
- Consumes: `useFriendsStore().{ friends, isLoading, error, removeFriend(friendUserId, reason?) }`、`useGroupStore().{ myGroups, isLoading }`、`FriendList({ subTab: 'main' | 'new' | 'sent', searchQuery })`、`GroupList({ subTab: 'main' | 'invites' | 'join', searchQuery, initialCreateOpen? })`（二者内部点击只写 store、不导航；在联系人栏里**只复用它们的 new / sent / join / invites / 创建群 面板**，主列表由 `ContactsList` 自己渲染并导航）、`GroupManagement({ groupId, onClose? })`（`@/features/chat/components/sidebar/GroupManagement`）、`profileApi.getPublicProfile(userId): Promise<PublicProfileResponse>`（`@/features/profile/api/profile`；字段 `user_id / user_nickname / user_signature / user_avatar_url / background_url / gender / birthday / region`，头像已是绝对地址）、Task 2 的 `contactFriendPath / contactGroupPath / chatPath / friendConversationId / friendDisplayName`。
- Produces:
  - `ContactsList()`：读路由（`?tab=friends|groups|requests`，默认 friends；`?add=friend|join-group|create-group`）与 stores，自渲染好友/群行（点击 → `/app/contacts/friends/:id` / `/app/contacts/groups/:id`），申请 tab 与 add 面板复用旧组件。
  - `contactsTabFrom(params: URLSearchParams): 'friends' | 'groups' | 'requests'`、`contactsAddFrom(params): 'friend' | 'join-group' | 'create-group' | null`
  - `ProfileView({ userId })`：对方资料 + 发消息 / 删除好友。
  - i18n：`shell.contacts.friends`（好友）、`groups`（群）、`requests`（申请）、`search`（搜索联系人）、`noFriends`（还没有好友）、`noGroups`（还没有加入任何群）、`noMatch`（没有匹配的联系人）、`closePanel`（收起）、`message`（发消息）、`removeFriend`（删除好友）、`confirmRemove`（确定删除这位好友？）、`notFriend`（不是你的好友）、`loadFailed`（资料加载失败）、`signature`（签名）、`region`（地区）、`memberSince`（成为好友）

- [ ] **Step 1: 写失败的测试**

`src/components/shell/__tests__/ContactsList.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { ContactsList } from '../ContactsList'

// 旧的 FriendList / GroupList 只在「添加」与「申请」面板里复用：把它们换成探针，
// 断言渲染了哪个、subTab 是什么——不测它们的内部
vi.mock('@/features/chat/components/sidebar/FriendList', () => ({
  default: (p: { subTab: string }) => <div data-testid="friend-list" data-subtab={p.subTab} />,
}))
vi.mock('@/features/chat/components/sidebar/GroupList', () => ({
  default: (p: { subTab: string; initialCreateOpen?: boolean }) => <div data-testid="group-list" data-subtab={p.subTab} data-create={String(!!p.initialCreateOpen)} />,
}))

const renderAt = (url: string) =>
  render(<RouterProvider router={createMemoryRouter([{ path: '/app/contacts/*', element: <ContactsList /> }], { initialEntries: [url] })} />)

const friend = (id: string, nickname: string, remark: string | null = null) => ({
  friend_id: id, friend_nickname: nickname, friend_avatar_url: null, add_time: '2026-01-01T00:00:00Z',
  approve_reason: null, friend_remark: remark, is_blacklisted: false, is_special_care: false,
})

describe('ContactsList', () => {
  beforeEach(() => {
    useFriendsStore.setState({ friends: [friend('alice', '爱丽丝', '小爱'), friend('bob', '鲍勃')], isLoading: false, error: null })
    useGroupStore.setState({ myGroups: [{ group_id: 'g1', group_name: '读书会', group_avatar_url: null, role: 'member', unread_count: null, last_message_content: null, last_message_time: null }] as never, isLoading: false })
  })

  it('默认好友 tab：每个好友一行，名字备注优先，链接到 /app/contacts/friends/:id，当前项 data-selected', () => {
    renderAt('/app/contacts/friends/alice')
    expect(screen.getByRole('link', { name: /小爱/ })).toHaveAttribute('href', '/app/contacts/friends/alice')
    expect(screen.getByRole('link', { name: /鲍勃/ })).toHaveAttribute('href', '/app/contacts/friends/bob')
    expect(screen.getByTestId('contact-f-alice')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('contact-f-bob')).toHaveAttribute('data-selected', 'false')
    expect(screen.queryByTestId('friend-list')).toBeNull()   // 没有 add 参数不渲染旧面板
  })

  it('?tab=groups：群行链接到 /app/contacts/groups/:id；?tab=requests：申请面板复用旧组件', () => {
    renderAt('/app/contacts?tab=groups')
    expect(screen.getByRole('link', { name: /读书会/ })).toHaveAttribute('href', '/app/contacts/groups/g1')
    expect(screen.queryByRole('link', { name: /小爱/ })).toBeNull()
    renderAt('/app/contacts?tab=requests')
    const lists = screen.getAllByTestId('friend-list').map((el) => el.getAttribute('data-subtab'))
    expect(lists).toEqual(['new', 'sent'])
    expect(screen.getByTestId('group-list')).toHaveAttribute('data-subtab', 'invites')
  })

  it('?add=friend / join-group / create-group 各自渲染对应旧面板', () => {
    renderAt('/app/contacts?add=friend')
    expect(screen.getByTestId('friend-list')).toHaveAttribute('data-subtab', 'new')
    renderAt('/app/contacts?tab=groups&add=join-group')
    expect(screen.getAllByTestId('group-list').at(-1)).toHaveAttribute('data-subtab', 'join')
    renderAt('/app/contacts?tab=groups&add=create-group')
    expect(screen.getAllByTestId('group-list').at(-1)).toHaveAttribute('data-create', 'true')
  })

  it('搜索框按名字过滤；无匹配给提示', () => {
    renderAt('/app/contacts')
    fireEvent.change(screen.getByPlaceholderText('搜索联系人'), { target: { value: '鲍' } })
    expect(screen.getByRole('link', { name: /鲍勃/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /小爱/ })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('搜索联系人'), { target: { value: 'zzz' } })
    expect(screen.getByText('没有匹配的联系人')).toBeInTheDocument()
  })
})
```

`src/components/shell/__tests__/ProfileView.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { profileApi } from '@/features/profile/api/profile'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { ProfileView } from '../ProfileView'

const PUBLIC = { user_id: 'alice', user_nickname: '爱丽丝', user_signature: '早睡早起', user_avatar_url: 'https://cdn.test/a.png', background_url: null, gender: null, birthday: null, region: '杭州' }

const renderView = () =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <ProfileView userId="alice" /> }], { initialEntries: ['/app/contacts/friends/alice'] })} />)

describe('ProfileView', () => {
  beforeEach(() => {
    vi.spyOn(profileApi, 'getPublicProfile').mockResolvedValue(PUBLIC)
    useFriendsStore.setState({ friends: [{ friend_id: 'alice', friend_nickname: '爱丽丝', friend_avatar_url: null, add_time: '2026-01-01T00:00:00Z', approve_reason: null, friend_remark: '小爱', is_blacklisted: false, is_special_care: false }], removeFriend: vi.fn(async () => {}) })
  })
  afterEach(() => vi.restoreAllMocks())

  it('显示备注名、@id、签名、地区；发消息链接到 /app/chat/f-alice', async () => {
    renderView()
    expect(await screen.findByText('早睡早起')).toBeInTheDocument()
    expect(screen.getByText('小爱')).toBeInTheDocument()
    expect(screen.getByText('@alice')).toBeInTheDocument()
    expect(screen.getByText('杭州')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发消息' })).toHaveAttribute('href', '/app/chat/f-alice')
    expect(profileApi.getPublicProfile).toHaveBeenCalledWith('alice')
  })

  it('删除好友：确认后调 removeFriend(userId)；取消不调', async () => {
    renderView()
    await screen.findByText('早睡早起')
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    screen.getByRole('button', { name: '删除好友' }).click()
    expect(useFriendsStore.getState().removeFriend).not.toHaveBeenCalled()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    screen.getByRole('button', { name: '删除好友' }).click()
    await waitFor(() => expect(useFriendsStore.getState().removeFriend).toHaveBeenCalledWith('alice'))
  })

  it('资料接口失败时显示错误，但好友本地信息（名字/发消息）仍在', async () => {
    vi.spyOn(profileApi, 'getPublicProfile').mockRejectedValue(new Error('boom'))
    renderView()
    expect(await screen.findByText(/资料加载失败/)).toBeInTheDocument()
    expect(screen.getByText('小爱')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '发消息' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell/__tests__/ContactsList.test.tsx src/components/shell/__tests__/ProfileView.test.tsx 2>&1 | tail -6`
Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/i18n/messages.ts` 的 `shell` 里追加（zh）：

```ts
    contacts: { friends: '好友', groups: '群', requests: '申请', search: '搜索联系人', noFriends: '还没有好友', noGroups: '还没有加入任何群', noMatch: '没有匹配的联系人', closePanel: '收起', message: '发消息', removeFriend: '删除好友', confirmRemove: '确定删除这位好友？', notFriend: '不是你的好友', loadFailed: '资料加载失败', signature: '签名', region: '地区', memberSince: '成为好友' },
```

英文：`contacts: { friends: 'Friends', groups: 'Groups', requests: 'Requests', search: 'Search contacts', noFriends: 'No friends yet', noGroups: 'No groups yet', noMatch: 'No matching contacts', closePanel: 'Close', message: 'Message', removeFriend: 'Remove friend', confirmRemove: 'Remove this friend?', notFriend: 'Not your friend', loadFailed: 'Failed to load profile', signature: 'Signature', region: 'Region', memberSince: 'Friends since' }`。

`src/features/chat/components/sidebar/GroupList.tsx`：props 接口加 `initialCreateOpen?: boolean`，`const [showCreateDialog, setShowCreateDialog] = useState(false)` 改成 `useState(initialCreateOpen ?? false)`。只此两处。

`src/components/shell/ContactsList.tsx`：

```tsx
import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import FriendList from '@/features/chat/components/sidebar/FriendList'
import GroupList from '@/features/chat/components/sidebar/GroupList'
import { friendDisplayName } from '@/features/chat/lib/friendName'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { contactFriendPath, contactGroupPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { ListEmpty, ListError, ListLoading } from './ListStates'

export type ContactsTab = 'friends' | 'groups' | 'requests'
export type ContactsAdd = 'friend' | 'join-group' | 'create-group'

export function contactsTabFrom(params: URLSearchParams): ContactsTab {
  const t = params.get('tab')
  return t === 'groups' || t === 'requests' ? t : 'friends'
}
export function contactsAddFrom(params: URLSearchParams): ContactsAdd | null {
  const a = params.get('add')
  return a === 'friend' || a === 'join-group' || a === 'create-group' ? a : null
}

function ContactRow({ testId, to, name, subtitle, avatarUrl, selected }: { testId: string; to: string; name: string; subtitle: string; avatarUrl: string | null; selected: boolean }) {
  return (
    <NavLink
      to={to}
      data-testid={testId}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'mb-1 flex items-center gap-3 rounded-[12px] border border-[var(--card-border)] bg-[linear-gradient(135deg,var(--card-bg-start),var(--card-bg-end))] p-3 transition-colors hover:bg-[linear-gradient(135deg,var(--card-bg-hover-start),var(--card-bg-hover-end))]',
        selected && 'outline outline-2 outline-offset-[3px] outline-primary',
      )}
    >
      <Avatar className="h-10 w-10 shrink-0 rounded-[10px]">
        {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="rounded-[10px] text-app-light">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-foreground">{name}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{subtitle}</span>
      </span>
    </NavLink>
  )
}

/** 联系人栏：好友 / 群 / 申请三段；主列表自渲染并导航，add 与申请面板复用旧组件 */
export function ContactsList() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const { userId, groupId } = useParams()
  const tab = contactsTabFrom(params)
  const add = contactsAddFrom(params)
  const [query, setQuery] = useState('')
  const friends = useFriendsStore((s) => s.friends)
  const friendsLoading = useFriendsStore((s) => s.isLoading)
  const friendsError = useFriendsStore((s) => s.error)
  const loadFriends = useFriendsStore((s) => s.loadFriends)
  const groups = useGroupStore((s) => s.myGroups)
  const groupsLoading = useGroupStore((s) => s.isLoading)

  const q = query.trim().toLowerCase()
  const shownFriends = useMemo(() => friends.filter((f) => !q || friendDisplayName(f).toLowerCase().includes(q) || f.friend_id.toLowerCase().includes(q)), [friends, q])
  const shownGroups = useMemo(() => groups.filter((g) => !q || g.group_name.toLowerCase().includes(q)), [groups, q])

  const setTab = (next: ContactsTab) => { const p = new URLSearchParams(params); p.set('tab', next); p.delete('add'); setParams(p, { replace: true }) }
  const closeAdd = () => { const p = new URLSearchParams(params); p.delete('add'); setParams(p, { replace: true }) }

  const segment = (key: ContactsTab, label: string) => (
    <button type="button" key={key} onClick={() => setTab(key)} aria-pressed={tab === key}
      className={cn('flex-1 rounded-[10px] px-2 py-1.5 text-[13px] transition-colors', tab === key ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground hover:text-foreground')}>
      {label}
    </button>
  )

  const addPanel = add && (
    <div className="mb-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
      <div className="mb-1 flex justify-end">
        <button type="button" aria-label={t('shell.contacts.closePanel')} onClick={closeAdd} className="rounded-md p-1 text-muted-foreground hover:bg-[var(--primary-subtle)]"><X className="h-4 w-4" /></button>
      </div>
      {add === 'friend' && <FriendList subTab="new" searchQuery="" />}
      {add === 'join-group' && <GroupList subTab="join" searchQuery="" />}
      {add === 'create-group' && <GroupList subTab="main" searchQuery="" initialCreateOpen />}
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 p-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('shell.contacts.search')}
          className="w-full rounded-[10px] border border-[var(--white-alpha-70)] bg-[var(--white-alpha-60)] px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-app-light focus:border-[var(--border-strong)]" />
        <div className="flex gap-1 rounded-[12px] bg-[var(--bg-tertiary)] p-1">
          {segment('friends', t('shell.contacts.friends'))}
          {segment('groups', t('shell.contacts.groups'))}
          {segment('requests', t('shell.contacts.requests'))}
        </div>
      </div>
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto py-2 pl-2 pr-0.5 [scrollbar-gutter:stable]">
        {addPanel}
        {tab === 'friends' && (friendsLoading ? <ListLoading /> : friendsError ? <ListError error={friendsError} onRetry={() => { loadFriends().catch(console.error) }} /> :
          friends.length === 0 ? <ListEmpty message={t('shell.contacts.noFriends')} /> : shownFriends.length === 0 ? <ListEmpty message={t('shell.contacts.noMatch')} /> :
          shownFriends.map((f) => (
            <ContactRow key={f.friend_id} testId={`contact-f-${f.friend_id}`} to={contactFriendPath(f.friend_id)} name={friendDisplayName(f)} subtitle={`@${f.friend_id}`}
              avatarUrl={f.friend_avatar_url ? (toAbsoluteApiUrl(f.friend_avatar_url) ?? null) : null} selected={userId === f.friend_id} />
          )))}
        {tab === 'groups' && (groupsLoading ? <ListLoading /> :
          groups.length === 0 ? <ListEmpty message={t('shell.contacts.noGroups')} /> : shownGroups.length === 0 ? <ListEmpty message={t('shell.contacts.noMatch')} /> :
          shownGroups.map((g) => (
            <ContactRow key={g.group_id} testId={`contact-g-${g.group_id}`} to={contactGroupPath(g.group_id)} name={g.group_name} subtitle={g.member_count ? `${g.member_count} 人` : g.group_id}
              avatarUrl={g.group_avatar_url ? (toAbsoluteApiUrl(g.group_avatar_url) ?? null) : null} selected={groupId === g.group_id} />
          )))}
        {tab === 'requests' && (
          <div className="space-y-3">
            <FriendList subTab="new" searchQuery="" />
            <FriendList subTab="sent" searchQuery="" />
            <GroupList subTab="invites" searchQuery="" />
          </div>
        )}
      </div>
    </div>
  )
}
```

`src/components/shell/ProfileView.tsx`：

```tsx
import { MessageCircle, UserMinus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { friendConversationId } from '@/features/chat/lib/conversationId'
import { friendDisplayName } from '@/features/chat/lib/friendName'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { profileApi, type PublicProfileResponse } from '@/features/profile/api/profile'
import { useI18n } from '@/i18n/I18nProvider'
import { useRouter } from '@/lib/navigation'
import { ROUTES, chatPath } from '@/lib/routes'

/** 对方资料（右栏）。好友的本地信息（备注、成为好友时间）来自 friendsStore；公开资料来自 GET /api/profile/{id}/public */
export function ProfileView({ userId }: { userId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const friend = useFriendsStore((s) => s.friends.find((f) => f.friend_id === userId))
  const removeFriend = useFriendsStore((s) => s.removeFriend)
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let alive = true
    setProfile(null)
    setError(null)
    profileApi.getPublicProfile(userId)
      .then((p) => { if (alive) setProfile(p) })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [userId])

  const name = friend ? friendDisplayName(friend) : (profile?.user_nickname ?? userId)
  const avatarUrl = profile?.user_avatar_url ?? friend?.friend_avatar_url ?? null

  const handleRemove = async () => {
    if (!window.confirm(t('shell.contacts.confirmRemove'))) return
    setRemoving(true)
    try {
      await removeFriend(userId)
      router.replace(ROUTES.app.contacts)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="app-scrollbar h-full overflow-y-auto p-6">
      <div className="glass-card mx-auto max-w-[520px] p-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20 rounded-[16px]">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="rounded-[16px] text-2xl text-app-light">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-foreground">{name}</h2>
            <p className="text-[13px] text-muted-foreground">@{userId}</p>
            {!friend && <p className="text-[12px] text-app-warning">{t('shell.contacts.notFriend')}</p>}
          </div>
        </div>
        {error && <p className="mt-4 text-[13px] text-destructive" role="alert">{t('shell.contacts.loadFailed')}: {error}</p>}
        <dl className="mt-6 space-y-2 text-[13px]">
          {profile?.user_signature && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.signature')}</dt><dd className="text-foreground">{profile.user_signature}</dd></div>}
          {profile?.region && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.region')}</dt><dd className="text-foreground">{profile.region}</dd></div>}
          {friend?.add_time && <div className="flex gap-3"><dt className="w-16 shrink-0 text-muted-foreground">{t('shell.contacts.memberSince')}</dt><dd className="text-foreground">{new Date(friend.add_time).toLocaleDateString()}</dd></div>}
        </dl>
        {friend && (
          <div className="mt-8 flex gap-3">
            <NavLink to={chatPath(friendConversationId(userId))} className="subtle-btn"><MessageCircle className="h-4 w-4" />{t('shell.contacts.message')}</NavLink>
            <button type="button" onClick={handleRemove} disabled={removing} className="subtle-btn !bg-[var(--status-error-subtle)] !text-destructive"><UserMinus className="h-4 w-4" />{t('shell.contacts.removeFriend')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

`src/app/routes/shell/contacts.tsx`：

```tsx
import { useOutlet } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'

export default function ContactsIndex() {
  const outlet = useOutlet()
  return outlet ?? <EmptyContent hint="contacts" />
}
```

`src/app/routes/shell/contacts.friends.$userId.tsx`：

```tsx
import { useParams } from 'react-router'
import { ProfileView } from '@/components/shell/ProfileView'

export default function ContactFriend() {
  const { userId } = useParams()
  if (!userId) return null
  return <ProfileView userId={userId} />
}
```

`src/app/routes/shell/contacts.groups.$groupId.tsx`：

```tsx
import { useParams } from 'react-router'
import GroupManagement from '@/features/chat/components/sidebar/GroupManagement'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

export default function ContactGroup() {
  const { groupId } = useParams()
  const router = useRouter()
  if (!groupId) return null
  return (
    <div className="app-scrollbar h-full overflow-y-auto p-4">
      <GroupManagement groupId={groupId} onClose={() => router.replace(ROUTES.app.contacts)} />
    </div>
  )
}
```

`src/app/routes.ts`：`app-shell` 之下追加：

```ts
      route('app/contacts', 'routes/shell/contacts.tsx', [
        route('friends/:userId', 'routes/shell/contacts.friends.$userId.tsx'),
        route('groups/:groupId', 'routes/shell/contacts.groups.$groupId.tsx'),
      ]),
```

`src/app/routes/app-shell.tsx`：
1. `import { ContactsList } from '@/components/shell/ContactsList'`；
2. `AppShellLayout` 的 `list` 改为 `tab === 'contacts' ? <ContactsList /> : <ChatListColumn />`；
3. `ChatListColumn` 的三个添加入口改成：`onCreateGroup={() => router.push(`${ROUTES.app.contacts}?tab=groups&add=create-group`)}`、`onAddFriend={() => router.push(`${ROUTES.app.contacts}?add=friend`)}`、`onJoinGroup={() => router.push(`${ROUTES.app.contacts}?tab=groups&add=join-group`)}`（不再引用 `ROUTES.app.chatGroups/chatFriends`）。

`src/app/routes/__tests__/appShellRoutes.test.tsx` 追加断言：`expect(flat).toContain('routes/shell/contacts.tsx@/app/contacts')`、`'routes/shell/contacts.friends.$userId.tsx@/app/contacts/friends/:userId'`、`'routes/shell/contacts.groups.$groupId.tsx@/app/contacts/groups/:groupId'`。

- [ ] **Step 4: 运行确认通过 + 冒烟**

Run: `bun run test src/components/shell src/app/routes/__tests__ 2>&1 | tail -8`；`bunx react-router typegen && bunx tsc --noEmit`。
冒烟：dev 里点侧栏「联系人」→ 三段切换、点一个好友 → 右栏资料、「发消息」→ 跳到 `/app/chat/f-…`；`?add=friend` 面板能收起。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `ContactRow` 的 `to` 改成 `chatPath(...)` | 「链接到 /app/contacts/friends/:id」红 |
| `contactsTabFrom` 对 `groups` 返回 `friends` | 「?tab=groups」红 |
| `contactsAddFrom` 对 `create-group` 返回 `null` | 「?add=create-group」红 |
| `ProfileView.handleRemove` 不看 `confirm` 的返回值 | 「取消不调」红 |
| `ProfileView` 接口失败时不渲染 error | 「资料接口失败时显示错误」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/components/shell/ContactsList.tsx src/components/shell/ProfileView.tsx src/components/shell/__tests__/ContactsList.test.tsx src/components/shell/__tests__/ProfileView.test.tsx src/app/routes/shell/contacts.tsx 'src/app/routes/shell/contacts.friends.$userId.tsx' 'src/app/routes/shell/contacts.groups.$groupId.tsx' src/features/chat/components/sidebar/GroupList.tsx src/app/routes/app-shell.tsx src/app/routes.ts src/app/routes/__tests__/appShellRoutes.test.tsx src/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat(shell): 联系人栏与右栏详情——/app/contacts、对方资料、群详情

联系人栏三段（好友 / 群 / 申请）：主列表自渲染并导航到 /app/contacts/friends/:id 与
/app/contacts/groups/:id（URL 是选中态的真值），申请与「添加」面板复用旧的 FriendList /
GroupList 子面板（?add=friend|join-group|create-group）。右栏：ProfileView 合并本地好友
信息与 GET /api/profile/{id}/public，发消息直达 /app/chat/f-<id>，删除好友回列表；群详情
复用 GroupManagement。统一列表的「+」菜单改指向联系人栏。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 设置面板——`/app/settings/:section` 五个分区，设备管理并入账户

**Files:**
- Create: `src/components/shell/settings/SettingsSection.tsx`（`SettingsSection` / `SettingsGroup` / `SettingsRow`，APP 同名组件移植）
- Create: `src/components/shell/settings/sections.tsx`（分区注册表）
- Create: `src/components/shell/settings/SettingsSectionList.tsx`（列表栏）
- Create: `src/components/shell/settings/AppearanceSection.tsx`、`NotificationsSection.tsx`、`AccountSection.tsx`、`AiSection.tsx`、`AboutSection.tsx`
- Create: `src/app/routes/shell/settings.tsx`、`src/app/routes/shell/settings.$section.tsx`
- Modify: `src/features/settings/components/DevicesPage.tsx`（加 `embedded?: boolean`：为真时不渲染页头与返回按钮）
- Modify: `src/components/shell/Sidebar.tsx`、`src/components/shell/AppShell.tsx`（`activeTab` 允许 `'settings'`：两个 tab 都不高亮）
- Modify: `src/app/routes/app-shell.tsx`、`src/app/routes.ts`、`src/i18n/messages.ts`（`shell.settings.*`）
- Test: `src/components/shell/settings/__tests__/sections.test.tsx`、`src/components/shell/settings/__tests__/AppearanceSection.test.tsx`

**Interfaces:**
- Consumes: `useSettingsStore().{ theme, language, animationsEnabled, particleBackground, notificationsEnabled, soundEnabled, soundVolume, aiEnabled, aiModel, showOnlineStatus, messageEncryption, setSetting(key, value) }`；`PrivacySettings`（`@/features/settings/components/PrivacySettings`，无 props）；`Devices`（`@/features/settings/components/DevicesPage` 默认导出）；`useAuthStore().logout()`；`APP_VERSION`（`@/lib/version`）；shadcn `Switch / Select* / Label / Button`；Task 2 的 `SETTINGS_SECTIONS / isSettingsSection / settingsPath`；现 `SettingsPage.tsx:83-111` 的「AI 配置」卡片 JSX（搬到 `AiSection`）。
- Produces:
  - `SettingsSection({ title, children })`、`SettingsGroup({ children })`、`SettingsRow({ icon?, title, subtitle?, right })`（Web 版：右侧内容由调用方传，不复刻 APP 的 type 枚举）
  - `SETTINGS_SECTION_META: ReadonlyArray<{ key: SettingsSection; labelKey: string; icon: LucideIcon }>` 与 `SECTION_COMPONENTS: Record<SettingsSection, ComponentType>`
  - `SettingsSectionList()`（列表栏，`NavLink` 到 `settingsPath(key)`，当前分区 `aria-current`）
  - i18n：`shell.settings.title`（设置）、`appearance`（外观）、`notifications`（通知与提醒）、`account`（账户与安全）、`ai`（AI 配置）、`about`（关于）、`theme`（主题）、`themeLight/themeDark/themeAuto`（浅色/深色/跟随系统）、`language`（语言）、`animations`（界面动画）、`particles`（粒子背景）、`notify`（桌面通知）、`sound`（提示音）、`volume`（音量）、`privacy`（隐私）、`devices`（登录设备）、`logout`（退出登录）、`version`（版本）、`downloads`（下载客户端）

- [ ] **Step 1: 写失败的测试**

`src/components/shell/settings/__tests__/sections.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SETTINGS_SECTIONS } from '@/lib/routes'
import { SECTION_COMPONENTS, SETTINGS_SECTION_META } from '../sections'
import { SettingsSectionList } from '../SettingsSectionList'

describe('设置分区注册表', () => {
  it('五个分区与 SETTINGS_SECTIONS 同序，每个都有组件', () => {
    expect(SETTINGS_SECTION_META.map((m) => m.key)).toEqual([...SETTINGS_SECTIONS])
    for (const key of SETTINGS_SECTIONS) expect(typeof SECTION_COMPONENTS[key]).toBe('function')
  })

  it('列表栏每个分区一条链接，当前分区 aria-current', () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '/app/settings/:section', element: <SettingsSectionList /> }], { initialEntries: ['/app/settings/account'] })} />)
    expect(screen.getByRole('link', { name: '外观' })).toHaveAttribute('href', '/app/settings/appearance')
    expect(screen.getByRole('link', { name: '账户与安全' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '外观' })).not.toHaveAttribute('aria-current')
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })
})
```

`src/components/shell/settings/__tests__/AppearanceSection.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { AppearanceSection } from '../AppearanceSection'

describe('AppearanceSection', () => {
  beforeEach(() => useSettingsStore.setState({ theme: 'light', animationsEnabled: true, particleBackground: false }))

  it('主题三选一写回 settingsStore.theme', () => {
    render(<AppearanceSection />)
    fireEvent.click(screen.getByRole('radio', { name: '深色' }))
    expect(useSettingsStore.getState().theme).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: '跟随系统' }))
    expect(useSettingsStore.getState().theme).toBe('auto')
  })

  it('动画与粒子背景开关写回对应字段', () => {
    render(<AppearanceSection />)
    fireEvent.click(screen.getByRole('switch', { name: '界面动画' }))
    expect(useSettingsStore.getState().animationsEnabled).toBe(false)
    fireEvent.click(screen.getByRole('switch', { name: '粒子背景' }))
    expect(useSettingsStore.getState().particleBackground).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell/settings 2>&1 | tail -6`
Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/i18n/messages.ts` 的 `shell` 里追加（zh）：

```ts
    settings: { title: '设置', appearance: '外观', notifications: '通知与提醒', account: '账户与安全', ai: 'AI 配置', about: '关于', theme: '主题', themeLight: '浅色', themeDark: '深色', themeAuto: '跟随系统', language: '语言', animations: '界面动画', particles: '粒子背景', notify: '桌面通知', sound: '提示音', volume: '音量', privacy: '隐私', devices: '登录设备', logout: '退出登录', version: '版本', downloads: '下载客户端' },
```

英文：`settings: { title: 'Settings', appearance: 'Appearance', notifications: 'Notifications', account: 'Account & security', ai: 'AI', about: 'About', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeAuto: 'System', language: 'Language', animations: 'Animations', particles: 'Particle background', notify: 'Desktop notifications', sound: 'Sounds', volume: 'Volume', privacy: 'Privacy', devices: 'Devices', logout: 'Log out', version: 'Version', downloads: 'Download the app' }`。

`src/components/shell/settings/SettingsSection.tsx`（APP `SettingsSection/Group/Row` 的结构）：

```tsx
import type { ReactNode } from 'react'

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">{title}</h3>
      <div className="glass-card rounded-[16px] p-1">{children}</div>
    </section>
  )
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[var(--border-subtle)]">{children}</div>
}

/** 一行：左侧图标+标题+副标题，右侧由调用方决定（开关 / 选择 / 按钮 / 文本） */
export function SettingsRow({ icon, title, subtitle, right, htmlFor }: { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--primary-subtle)] text-primary">{icon}</span>}
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[14px] text-foreground">{title}</label>
        {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
```

`src/components/shell/settings/AppearanceSection.tsx`：

```tsx
import { Palette } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import type { LanguagePreference } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

const THEMES = ['light', 'dark', 'auto'] as const

export function AppearanceSection() {
  const { t } = useI18n()
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)
  const particleBackground = useSettingsStore((s) => s.particleBackground)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const labels = { light: t('shell.settings.themeLight'), dark: t('shell.settings.themeDark'), auto: t('shell.settings.themeAuto') }
  return (
    <SettingsSection title={t('shell.settings.appearance')}>
      <SettingsGroup>
        <SettingsRow icon={<Palette className="h-4 w-4" />} title={t('shell.settings.theme')} right={
          <div role="radiogroup" className="flex gap-1 rounded-[10px] bg-[var(--bg-tertiary)] p-1">
            {THEMES.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={theme === v} aria-label={labels[v]} onClick={() => setSetting('theme', v)}
                className={cn('rounded-[8px] px-3 py-1 text-[13px]', theme === v ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground')}>
                {labels[v]}
              </button>
            ))}
          </div>
        } />
        <SettingsRow title={t('shell.settings.language')} right={
          <Select value={language} onValueChange={(v) => setSetting('language', v as LanguagePreference)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('settings.languageOptions.auto')}</SelectItem>
              <SelectItem value="zh-CN">{t('settings.languageOptions.zhCN')}</SelectItem>
              <SelectItem value="en-US">{t('settings.languageOptions.enUS')}</SelectItem>
            </SelectContent>
          </Select>
        } />
        <SettingsRow title={t('shell.settings.animations')} htmlFor="set-animations" right={<Switch id="set-animations" aria-label={t('shell.settings.animations')} checked={animationsEnabled} onCheckedChange={(v) => setSetting('animationsEnabled', v)} />} />
        <SettingsRow title={t('shell.settings.particles')} htmlFor="set-particles" right={<Switch id="set-particles" aria-label={t('shell.settings.particles')} checked={particleBackground} onCheckedChange={(v) => setSetting('particleBackground', v)} />} />
      </SettingsGroup>
    </SettingsSection>
  )
}
```

`NotificationsSection.tsx`：同一形状——`notificationsEnabled`（Switch，`aria-label` = `shell.settings.notify`）、`soundEnabled`（Switch）、`soundVolume`（`<input type="range" min={0} max={100} aria-label={t('shell.settings.volume')} value={soundVolume} onChange={(e) => setSetting('soundVolume', Number(e.target.value))} />`）。

`AccountSection.tsx`：

```tsx
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/features/auth/store/authStore'
import Devices from '@/features/settings/components/DevicesPage'
import PrivacySettings from '@/features/settings/components/PrivacySettings'
import { useI18n } from '@/i18n/I18nProvider'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

export function AccountSection() {
  const { t } = useI18n()
  const logout = useAuthStore((s) => s.logout)
  return (
    <>
      <SettingsSection title={t('shell.settings.privacy')}><div className="p-3"><PrivacySettings /></div></SettingsSection>
      <SettingsSection title={t('shell.settings.devices')}><div className="p-3"><Devices embedded /></div></SettingsSection>
      <SettingsSection title={t('shell.settings.account')}>
        <SettingsGroup>
          <SettingsRow title={t('shell.settings.logout')} right={<Button variant="destructive" size="sm" onClick={() => { void logout() }}><LogOut className="mr-1 h-4 w-4" />{t('shell.settings.logout')}</Button>} />
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}
```

`src/features/settings/components/DevicesPage.tsx`：`export default function Devices({ embedded = false }: { embedded?: boolean })`；`embedded` 为真时不渲染 `DevicesPage.tsx:140-148` 那段页头（返回按钮 + `<h1>设备管理</h1>`），外层容器去掉 `max-w-5xl p-4 md:p-6`（用 `embedded ? '' : 'mx-auto …'`）。其余逻辑一行不改。

`AiSection.tsx`：把 `SettingsPage.tsx:83-111` 的「AI 配置」`Card` 内容（`aiEnabled` 开关、`aiModel` 选择、`customApi` 开关及其描述文案）原样搬进 `<SettingsSection title={t('settings.aiConfig')}>`，把 `Card/CardHeader/CardTitle` 换成 `SettingsSection/SettingsRow`；文案 key 继续用现有的 `settings.aiConfig*`。

`AboutSection.tsx`：

```tsx
import { NavLink } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'
import { APP_VERSION } from '@/lib/version'
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsSection'

export function AboutSection() {
  const { t } = useI18n()
  return (
    <SettingsSection title={t('shell.settings.about')}>
      <SettingsGroup>
        <SettingsRow title={t('shell.settings.version')} right={<span className="text-[13px] text-muted-foreground">{APP_VERSION}</span>} />
        <SettingsRow title={t('shell.settings.downloads')} right={<NavLink to={ROUTES.downloads} className="subtle-btn">{t('shell.settings.downloads')}</NavLink>} />
      </SettingsGroup>
    </SettingsSection>
  )
}
```

`src/components/shell/settings/sections.tsx`：

```tsx
import { Bell, Info, Palette, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { SettingsSection } from '@/lib/routes'
import { AboutSection } from './AboutSection'
import { AccountSection } from './AccountSection'
import { AiSection } from './AiSection'
import { AppearanceSection } from './AppearanceSection'
import { NotificationsSection } from './NotificationsSection'

/** 分区注册表：与 SETTINGS_SECTIONS 同序；第 2 期（主题编辑器 / 黑名单 / OAuth）在这里加条目 */
export const SETTINGS_SECTION_META: ReadonlyArray<{ key: SettingsSection; labelKey: string; icon: LucideIcon }> = [
  { key: 'appearance', labelKey: 'shell.settings.appearance', icon: Palette },
  { key: 'notifications', labelKey: 'shell.settings.notifications', icon: Bell },
  { key: 'account', labelKey: 'shell.settings.account', icon: ShieldCheck },
  { key: 'ai', labelKey: 'shell.settings.ai', icon: Sparkles },
  { key: 'about', labelKey: 'shell.settings.about', icon: Info },
]

export const SECTION_COMPONENTS: Record<SettingsSection, ComponentType> = {
  appearance: AppearanceSection,
  notifications: NotificationsSection,
  account: AccountSection,
  ai: AiSection,
  about: AboutSection,
}
```

`src/components/shell/settings/SettingsSectionList.tsx`：

```tsx
import { NavLink, useParams } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { settingsPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { SETTINGS_SECTION_META } from './sections'

export function SettingsSectionList() {
  const { t } = useI18n()
  const { section } = useParams()
  return (
    <div className="flex h-full flex-col">
      <h2 className="px-4 pb-2 pt-4 text-lg font-semibold text-foreground">{t('shell.settings.title')}</h2>
      <nav className="flex flex-col gap-1 px-2">
        {SETTINGS_SECTION_META.map((m) => (
          <NavLink key={m.key} to={settingsPath(m.key)} aria-current={section === m.key ? 'page' : undefined}
            className={cn('flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--primary-subtle)]', section === m.key ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-foreground')}>
            <m.icon className="h-[18px] w-[18px]" />
            <span>{t(m.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
```

`src/app/routes/shell/settings.tsx`：

```tsx
import { Navigate, useOutlet } from 'react-router'
import { settingsPath } from '@/lib/routes'

export default function SettingsIndex() {
  const outlet = useOutlet()
  return outlet ?? <Navigate to={settingsPath('appearance')} replace />
}
```

`src/app/routes/shell/settings.$section.tsx`：

```tsx
import { Navigate, useParams } from 'react-router'
import { SECTION_COMPONENTS } from '@/components/shell/settings/sections'
import { isSettingsSection, settingsPath } from '@/lib/routes'

export default function SettingsSectionRoute() {
  const { section } = useParams()
  if (!section || !isSettingsSection(section)) return <Navigate to={settingsPath('appearance')} replace />
  const Section = SECTION_COMPONENTS[section]
  return (
    <div className="app-scrollbar h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-[720px]"><Section /></div>
    </div>
  )
}
```

`Sidebar.tsx` / `AppShell.tsx`：`activeTab` 类型改为 `'chat' | 'contacts' | 'settings'`（settings 时两个 tab 都不带 `aria-current`/高亮；设置按钮靠 `NavLink` 的 `isActive` 高亮，已有）。

`src/app/routes/app-shell.tsx`：`shellTabOf` 加 `if (pathname.startsWith(ROUTES.app.settings)) return 'settings'`；`list` 改为 `tab === 'settings' ? <SettingsSectionList /> : tab === 'contacts' ? <ContactsList /> : <ChatListColumn />`。

`src/app/routes.ts`：`app-shell` 之下追加 `route('app/settings', 'routes/shell/settings.tsx', [route(':section', 'routes/shell/settings.$section.tsx')])`；从 `legacy-layout` 里**删除** `route('app/settings', 'routes/settings.tsx')` 与 `route('app/devices', 'routes/devices.tsx')`（`/app/devices` 的重定向在第 11 步；这一步它 404 一次可以接受——它从未被任何链接引用，只有 `SettingsPage`/`ProfilePage` 里「管理设备」按钮，那两个页面本任务后也只剩 `/app/profile` 还挂着；把 `ProfilePage.tsx:557` 那个按钮的目标改成 `settingsPath('account')`）。

路由表测试追加：`'routes/shell/settings.tsx@/app/settings'`、`'routes/shell/settings.$section.tsx@/app/settings/:section'`，并断言 `flat.some((x) => x.startsWith('routes/settings.tsx@'))` 为 false。

- [ ] **Step 4: 运行确认通过 + 冒烟**

Run: `bun run test src/components/shell src/app/routes/__tests__ 2>&1 | tail -8`；`bunx react-router typegen && bunx tsc --noEmit`。
冒烟：`/app/settings` → 自动到 `appearance`；切深色立即生效；`account` 里能看到隐私 + 设备列表 + 退出登录；`/app/settings/nope` → 回 `appearance`。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `SETTINGS_SECTION_META` 调换两项顺序 | 「与 SETTINGS_SECTIONS 同序」红 |
| `SettingsSectionList` 的 `aria-current` 恒空 | 「当前分区 aria-current」红 |
| `AppearanceSection` 主题按钮写死 `'light'` | 「主题三选一」红 |
| `settings.$section.tsx` 不校验 `isSettingsSection` | 冒烟 `/app/settings/nope` 白屏（补一条路由用例：`createMemoryRouter` 渲染该模块，非法 section 后 `location.pathname === '/app/settings/appearance'`） |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/components/shell/settings src/app/routes/shell/settings.tsx 'src/app/routes/shell/settings.$section.tsx' src/features/settings/components/DevicesPage.tsx src/features/profile/components/ProfilePage.tsx src/components/shell/Sidebar.tsx src/components/shell/AppShell.tsx src/app/routes/app-shell.tsx src/app/routes.ts src/app/routes/__tests__/appShellRoutes.test.tsx src/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat(shell): 设置面板——/app/settings/:section 五个分区，设备管理并入账户与安全

列表栏换成分区列表（外观 / 通知与提醒 / 账户与安全 / AI 配置 / 关于），内容区按 URL 渲染分区，
未知分区回外观；分区壳按 APP 的 SettingsSection / Group / Row 结构重写。外观：主题三选一、
语言、动画、粒子背景；通知：桌面通知、提示音、音量；账户与安全：隐私 + 登录设备（DevicesPage
嵌入模式）+ 退出登录；AI 配置：原 SettingsPage 的卡片原样搬入（spec 四分区之外的第五个，已记
裁决）；关于：版本与下载入口。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 带 URL 的模态框（资料 / 文件 / 会议 / 机器人 / 小程序）与 AI 助手工具页

**Files:**
- Create: `src/components/shell/RouteDialog.tsx`
- Create: `src/features/bots/api/bots.ts`、`src/features/miniapps/api/miniapps.ts`
- Create: `src/app/routes/shell/profile.tsx`、`files.tsx`、`meeting.tsx`、`bots.tsx`、`miniapps.tsx`、`ai-chat.tsx`
- Modify: `src/features/ai/components/AiChatPage.tsx`（去掉返回按钮）
- Modify: `src/app/routes/protected-layout.tsx`（去掉 uiStore 驱动的 ProfileModal 挂载）
- Delete: `src/store/uiStore.ts`（及其 `__tests__` 若有）——它唯一的消费方就是 protected-layout，且没有任何调用点打开过这两个模态框
- Modify: `src/app/routes.ts`、`src/i18n/messages.ts`（`shell.modals.*`）
- Create: `src/components/shell/shellTab.ts`（`ShellTab`、`shellTabOf`、sessionStorage 记住最近 tab、`useShellTab`）
- Modify: `src/app/routes/app-shell.tsx`（`shellTabOf` 换成 `useShellTab`：模态框路由下列表栏保持最近的 tab，spec §3）
- Test: `src/components/shell/__tests__/RouteDialog.test.tsx`、`src/components/shell/__tests__/shellTab.test.ts`、`src/features/bots/api/__tests__/bots.test.ts`、`src/features/miniapps/api/__tests__/miniapps.test.ts`、`src/app/routes/shell/__tests__/bots.test.tsx`

**Interfaces:**
- Consumes: `ProfileModal({ isOpen, onClose })`、`FileManager({ subTab: 'main' | 'upload' })`、`WebRTCPanel()`、`AiChat()`（`@/features/ai/components/AiChatPage` 默认导出）、`fetchWithAuth`（`@/api/authedFetch`）、`readEnvelopeList<T>(response, { endpoint, fallbackMessage? })`（`@/lib/apiEnvelope`）、`toAbsoluteApiUrl`、shadcn `Dialog / DialogContent / DialogHeader / DialogTitle`（导出名以 `src/components/ui/dialog.tsx` 为准）。
- Produces:
  - `RouteDialog({ title, children, className? })`：关闭规则 = 有来路（`useLocation().key !== 'default'`）`router.back()`，否则 `router.replace(ROUTES.app.chat)`。
  - `botsApi.listMyBots(): Promise<BotSummary[]>`，`interface BotSummary { bot_user_id: string; username: string; nickname: string; description: string; is_active: boolean; created_at: string }`（`GET /api/bots`，严格解析这六个字段；其余字段忽略——APP `BotInfo` 还有 commands/webhook 等，本期用不到）
  - `miniappsApi.listMy(): Promise<MiniAppSummary[]>`，`interface MiniAppSummary { miniapp_id: string; name: string; display_name: string; description: string; icon_url: string | null; access_url: string; status: string }`（`GET /api/miniapps/my`；`icon_url` 经 `toAbsoluteApiUrl`；`access_url` 原样，打开时再经 `toAbsoluteApiUrl` 落到同源 `/apps/*`）
  - i18n：`shell.modals.files`（我的文件）、`upload`（上传）、`meeting`（视频会议）、`bots`（机器人）、`botsEmpty`（还没有机器人）、`miniapps`（小程序）、`miniappsEmpty`（还没有小程序）、`open`（打开）、`active`（运行中）、`inactive`（已停用）
  - `type ShellTab = 'chat' | 'contacts'`；`shellTabOf(pathname: string, remembered: ShellTab): ShellTab | 'settings'`（chat / contacts / settings 由路径决定，模态框路由与 `/app/ai-chat` 返回 `remembered`）；`rememberShellTab(tab: ShellTab): void` / `recallShellTab(): ShellTab`（sessionStorage `huanvae.shell-tab`，默认 `'chat'`，坏值当 `'chat'`）；`useShellTab(): ShellTab | 'settings'`（壳布局用：按路径算并把 chat / contacts 记下）

- [ ] **Step 1: 写失败的测试**

`src/components/shell/__tests__/RouteDialog.test.tsx`：

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RouteDialog } from '../RouteDialog'

function mount(entries: string[]) {
  const router = createMemoryRouter(
    [
      { path: '/app/chat', element: <div>chat-home</div> },
      { path: '/app/files', element: <RouteDialog title="我的文件"><div>files-body</div></RouteDialog> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('RouteDialog 的关闭规则', () => {
  it('从站内进入：关闭 = 后退一步', async () => {
    const router = mount(['/app/chat', '/app/files'])
    expect(await screen.findByText('files-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(router.state.location.pathname).toBe('/app/chat')
  })

  it('直接打开（没有来路）：关闭 = replace 到 /app/chat', async () => {
    const router = mount(['/app/files'])
    expect(await screen.findByText('files-body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close|关闭/i }))
    expect(router.state.location.pathname).toBe('/app/chat')
    // 正对照：历史栈没有增长（replace 而不是 push）
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
```

（shadcn `DialogContent` 自带一个 `sr-only` 文案为 `Close` 的关闭按钮，正则 `/close|关闭/i` 两种都认。`createMemoryRouter` 的首条 entry 的 `location.key` 是 `'default'`，第二条不是——`RouteDialog` 靠这个区分来路。）

`src/features/bots/api/__tests__/bots.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { botsApi } from '../bots'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const BOT = { bot_user_id: 'bot_1', username: 'helper', nickname: '小助手', description: '帮忙', commands: [], webhook_url: null, can_join_groups: true, is_active: true, message_policy: 'all', message_whitelist: [], is_discoverable: true, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }

describe('botsApi.listMyBots', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('打同源 GET /api/bots，只保留六个字段', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [BOT] }))
    const bots = await botsApi.listMyBots()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/bots')
    expect(bots).toEqual([{ bot_user_id: 'bot_1', username: 'helper', nickname: '小助手', description: '帮忙', is_active: true, created_at: '2026-09-01T00:00:00Z' }])
  })

  it('缺必需字段（bot_user_id）抛错，不静默吞成 undefined', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, code: 200, data: [{ ...BOT, bot_user_id: undefined }] }))
    await expect(botsApi.listMyBots()).rejects.toThrow()
  })

  it('HTTP 200 但 success:false 透出后端文案', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, code: 403, error: '无权限' }))
    await expect(botsApi.listMyBots()).rejects.toThrow(/无权限/)
  })
})
```

`src/features/miniapps/api/__tests__/miniapps.test.ts`：同一形状——`GET /api/miniapps/my`；字段 `miniapp_id / name / display_name / description / icon_url / access_url / status`；断言 `icon_url` 相对路径 `apps/x/icon.png` 被 `toAbsoluteApiUrl` 落成 `${location.origin}/apps/x/icon.png`，`access_url` 原样保留；缺 `access_url` 抛错。

`src/app/routes/shell/__tests__/bots.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { botsApi } from '@/features/bots/api/bots'
import BotsRoute from '../bots'

const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/app/bots', element: <BotsRoute /> }], { initialEntries: ['/app/bots'] })} />)

describe('/app/bots 模态框', () => {
  afterEach(() => vi.restoreAllMocks())

  it('列出机器人：昵称、@username、运行状态', async () => {
    vi.spyOn(botsApi, 'listMyBots').mockResolvedValue([{ bot_user_id: 'b1', username: 'helper', nickname: '小助手', description: '帮忙', is_active: true, created_at: '2026-09-01T00:00:00Z' }])
    mount()
    expect(await screen.findByText('小助手')).toBeInTheDocument()
    expect(screen.getByText('@helper')).toBeInTheDocument()
    expect(screen.getByText('运行中')).toBeInTheDocument()
  })

  it('空列表给空态；失败给可重试的错误', async () => {
    const spy = vi.spyOn(botsApi, 'listMyBots').mockResolvedValueOnce([])
    mount()
    expect(await screen.findByText('还没有机器人')).toBeInTheDocument()
    spy.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([])
    screen.getByRole('button', { name: '重试' })?.click?.()
  })
})
```

（第二条只需断言空态与错误态各自出现即可：分两次 `mount`，第二次 `mockRejectedValue(new Error('boom'))` 后 `findByText(/加载失败/)`，并点「重试」后 `listMyBots` 被调用第二次。）

`src/components/shell/__tests__/shellTab.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { recallShellTab, rememberShellTab, shellTabOf } from '../shellTab'

describe('shellTabOf：列表栏该显示哪个 tab（spec §3：模态框下保持最近 tab）', () => {
  it('chat / contacts / settings 由路径决定，与记忆无关', () => {
    expect(shellTabOf('/app/chat/f-alice', 'contacts')).toBe('chat')
    expect(shellTabOf('/app/contacts', 'chat')).toBe('contacts')
    expect(shellTabOf('/app/settings/account', 'chat')).toBe('settings')
  })
  it('模态框路由与 AI 助手返回记住的 tab（两种都试，证明确实读了参数）', () => {
    for (const path of ['/app/files', '/app/meeting', '/app/bots', '/app/miniapps', '/app/profile', '/app/ai-chat']) {
      expect(shellTabOf(path, 'chat')).toBe('chat')
      expect(shellTabOf(path, 'contacts')).toBe('contacts')
    }
  })
})

describe('rememberShellTab / recallShellTab（sessionStorage huanvae.shell-tab）', () => {
  beforeEach(() => sessionStorage.clear())
  it('默认 chat；记过 contacts 就回 contacts；坏值回 chat', () => {
    expect(recallShellTab()).toBe('chat')
    rememberShellTab('contacts')
    expect(sessionStorage.getItem('huanvae.shell-tab')).toBe('contacts')
    expect(recallShellTab()).toBe('contacts')
    sessionStorage.setItem('huanvae.shell-tab', 'nope')
    expect(recallShellTab()).toBe('chat')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell/__tests__/RouteDialog.test.tsx src/components/shell/__tests__/shellTab.test.ts src/features/bots src/features/miniapps src/app/routes/shell 2>&1 | tail -6`
Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/i18n/messages.ts` 的 `shell` 里追加（zh）：

```ts
    modals: { files: '我的文件', upload: '上传', meeting: '视频会议', bots: '机器人', botsEmpty: '还没有机器人', miniapps: '小程序', miniappsEmpty: '还没有小程序', open: '打开', active: '运行中', inactive: '已停用' },
```

英文：`modals: { files: 'My files', upload: 'Upload', meeting: 'Meetings', bots: 'Bots', botsEmpty: 'No bots yet', miniapps: 'Mini apps', miniappsEmpty: 'No mini apps yet', open: 'Open', active: 'Active', inactive: 'Inactive' }`。

`src/components/shell/RouteDialog.tsx`：

```tsx
import type { ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

/**
 * 带 URL 的模态框（spec §3/§9）：路由挂着它就打开；关闭 = 有来路则后退，直接进入则回 /app/chat。
 * RR 给直接打开的第一个 location 的 key 是 'default'，站内导航过来的不是——用它区分来路。
 */
export function RouteDialog({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const router = useRouter()
  const location = useLocation()
  const close = () => {
    if (location.key === 'default') router.replace(ROUTES.app.chat)
    else router.back()
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className={cn('glass-card max-h-[85vh] overflow-hidden rounded-[28px] border-[var(--glass-border)] p-0', className)}>
        <DialogHeader className="border-b border-[var(--border-subtle)] px-6 pt-5 pb-3"><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="app-scrollbar max-h-[calc(85vh-64px)] overflow-y-auto px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
```

`src/features/bots/api/bots.ts`：

```ts
import { fetchWithAuth } from '@/api/authedFetch'
import { readEnvelopeList } from '@/lib/apiEnvelope'

/** `GET /api/bots` 一条（APP src/api/bots.ts 的 BotInfo；本期只取六个字段） */
export interface BotSummary {
  bot_user_id: string
  username: string
  nickname: string
  description: string
  is_active: boolean
  created_at: string
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`GET /api/bots: ${field} 缺失或不是字符串`)
  return v
}

export function parseBotSummary(input: unknown): BotSummary {
  const r = (input ?? {}) as Record<string, unknown>
  return {
    bot_user_id: str(r.bot_user_id, 'bot_user_id'),
    username: str(r.username, 'username'),
    nickname: str(r.nickname, 'nickname'),
    description: typeof r.description === 'string' ? r.description : '',
    is_active: r.is_active === true,
    created_at: str(r.created_at, 'created_at'),
  }
}

export const botsApi = {
  listMyBots: async (): Promise<BotSummary[]> => {
    const response = await fetchWithAuth('/api/bots')
    const items = await readEnvelopeList<unknown>(response, { endpoint: 'GET /api/bots', fallbackMessage: '加载机器人失败' })
    return items.map(parseBotSummary)
  },
}
```

`src/features/miniapps/api/miniapps.ts`：同一形状，`MiniAppSummary`，`parseMiniAppSummary`（`icon_url`：`typeof === 'string' && !== '' ? toAbsoluteApiUrl(...) ?? null : null`；`access_url` 必需字符串原样），`miniappsApi.listMy()` 打 `/api/miniapps/my`。

`src/app/routes/shell/profile.tsx`：

```tsx
import { useLocation } from 'react-router'
import { EmptyContent } from '@/components/shell/EmptyContent'
import ProfileModal from '@/features/profile/components/ProfileModal'
import { useRouter } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

export default function ProfileRoute() {
  const router = useRouter()
  const location = useLocation()
  const close = () => (location.key === 'default' ? router.replace(ROUTES.app.chat) : router.back())
  return (
    <>
      <EmptyContent hint="chat" />
      <ProfileModal isOpen onClose={close} />
    </>
  )
}
```

`src/app/routes/shell/files.tsx`：

```tsx
import { useState } from 'react'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { RouteDialog } from '@/components/shell/RouteDialog'
import FileManager from '@/features/chat/components/FileManager'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'

export default function FilesRoute() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'main' | 'upload'>('main')
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.files')} className="max-w-4xl">
        <div className="mb-3 flex gap-1 rounded-[10px] bg-[var(--bg-tertiary)] p-1">
          {(['main', 'upload'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn('flex-1 rounded-[8px] py-1.5 text-[13px]', tab === k ? 'bg-[var(--primary-subtle)] font-semibold text-[var(--primary-text)]' : 'text-muted-foreground')}>
              {k === 'main' ? t('shell.modals.files') : t('shell.modals.upload')}
            </button>
          ))}
        </div>
        <FileManager subTab={tab} />
      </RouteDialog>
    </>
  )
}
```

`src/app/routes/shell/meeting.tsx`：`<EmptyContent hint="chat" />` + `<RouteDialog title={t('shell.modals.meeting')} className="max-w-3xl"><WebRTCPanel /></RouteDialog>`（`WebRTCPanel` 内部的创建/加入 `Dialog` 是嵌套弹层，Radix 支持）。

`src/app/routes/shell/bots.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react'
import { EmptyContent } from '@/components/shell/EmptyContent'
import { ListEmpty, ListError, ListLoading } from '@/components/shell/ListStates'
import { RouteDialog } from '@/components/shell/RouteDialog'
import { botsApi, type BotSummary } from '@/features/bots/api/bots'
import { useI18n } from '@/i18n/I18nProvider'

export default function BotsRoute() {
  const { t } = useI18n()
  const [bots, setBots] = useState<BotSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    setBots(null)
    botsApi.listMyBots().then(setBots).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <>
      <EmptyContent hint="chat" />
      <RouteDialog title={t('shell.modals.bots')}>
        {error ? <ListError error={error} onRetry={load} /> : bots === null ? <ListLoading /> : bots.length === 0 ? <ListEmpty message={t('shell.modals.botsEmpty')} /> : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {bots.map((b) => (
              <li key={b.bot_user_id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-foreground">{b.nickname}</div>
                  <div className="truncate text-[12px] text-muted-foreground">@{b.username}{b.description ? ` · ${b.description}` : ''}</div>
                </div>
                <span className={b.is_active ? 'text-[12px] text-app-success' : 'text-[12px] text-muted-foreground'}>{b.is_active ? t('shell.modals.active') : t('shell.modals.inactive')}</span>
              </li>
            ))}
          </ul>
        )}
      </RouteDialog>
    </>
  )
}
```

`src/app/routes/shell/miniapps.tsx`：同一形状——`miniappsApi.listMy()`；每项图标（`icon_url` 或首字）+ `display_name` + `description`；「打开」按钮 `window.open(toAbsoluteApiUrl(app.access_url) ?? app.access_url, '_blank', 'noopener')`。

`src/app/routes/shell/ai-chat.tsx`：

```tsx
import AiChat from '@/features/ai/components/AiChatPage'

/** AI 助手是内容区整栏页（不是模态框）：列表栏保持当前 tab */
export default function AiChatRoute() {
  return <div className="h-full min-h-0 overflow-hidden p-3"><AiChat /></div>
}
```

`src/features/ai/components/AiChatPage.tsx`：删掉 `:207-209` 的返回按钮（壳负责导航），随之删除未用的 `ArrowLeft`、`ROUTES`、`router` 引用（若 `router` 只为它而存在）。

`src/app/routes/protected-layout.tsx`：去掉 `ProfileModal` 与 `useUIStore` 的引用，只剩 `<ProtectedRoute><Outlet /></ProtectedRoute>`；`src/store/uiStore.ts` 删除（`grep -rn useUIStore src` 必须为空）。

`src/components/shell/shellTab.ts`：

```ts
import { useEffect } from 'react'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'

export type ShellTab = 'chat' | 'contacts'

const STORAGE_KEY = 'huanvae.shell-tab'

/** 列表栏显示哪个 tab：chat / contacts / settings 由路径决定；模态框路由与 AI 助手保持记住的 tab（spec §3） */
export function shellTabOf(pathname: string, remembered: ShellTab): ShellTab | 'settings' {
  if (pathname.startsWith(ROUTES.app.contacts)) return 'contacts'
  if (pathname.startsWith(ROUTES.app.settings)) return 'settings'
  if (pathname.startsWith(ROUTES.app.chat)) return 'chat'
  return remembered
}

export function rememberShellTab(tab: ShellTab): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, tab)
  } catch {
    // 隐私模式等拿不到 sessionStorage：记不住就算了，默认聊天
  }
}

export function recallShellTab(): ShellTab {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'contacts' ? 'contacts' : 'chat'
  } catch {
    return 'chat'
  }
}

/**
 * 壳布局用：按当前路径算 tab，并把 chat / contacts 记进 sessionStorage（账号级，登出随 purge 清掉）。
 * SSR 读不到 sessionStorage，服务端一律按 chat 渲染；直接打开模态框 URL 且记忆是 contacts 时，水合后高亮会切一次。
 */
export function useShellTab(): ShellTab | 'settings' {
  const pathname = usePathname()
  const tab = shellTabOf(pathname, typeof window === 'undefined' ? 'chat' : recallShellTab())
  useEffect(() => {
    if (tab === 'chat' || tab === 'contacts') rememberShellTab(tab)
  }, [tab])
  return tab
}
```

`src/app/routes/app-shell.tsx`：删掉文件里的 `shellTabOf` 函数（第 5/7 步的那个），`import { useShellTab } from '@/components/shell/shellTab'`，`AppShellLayout` 里 `const tab = shellTabOf(pathname)` 改成 `const tab = useShellTab()`（`pathname` 仍用于写 `last_visited_path`）。

`src/app/routes.ts`：`app-shell` 之下追加 `route('app/profile', …shell/profile.tsx)`、`app/files`、`app/meeting`、`app/bots`、`app/miniapps`、`app/ai-chat`；从 `legacy-layout` 里删除 `app/files`、`app/ai-chat`、`app/profile`（`app/webrtc`、`app/friends`、`app/groups` 留到第 11 步重定向）。路由表测试追加这六条断言，并断言 `routes/files.tsx`、`routes/ai-chat.tsx`、`routes/profile.tsx` 不再注册。

- [ ] **Step 4: 运行确认通过 + 冒烟**

Run: `bun run test src/components/shell src/features/bots src/features/miniapps src/app/routes 2>&1 | tail -8`；`bunx react-router typegen && bunx tsc --noEmit`。
冒烟：侧栏头像 → `/app/profile` 模态框，关闭回到上一页；「更多」→ 我的文件 / 视频会议 / 机器人 / 小程序 各自弹出，直接刷新 `/app/files` 再关闭回 `/app/chat`；AI 助手整栏显示且没有返回按钮。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `RouteDialog.close` 恒 `router.back()` | 「直接打开：replace 到 /app/chat」红 |
| `parseBotSummary` 的 `bot_user_id` 用 `String(r.bot_user_id)` | 「缺必需字段抛错」红 |
| `parseMiniAppSummary` 不经 `toAbsoluteApiUrl` | 「icon_url 落成同源」红 |
| `bots.tsx` 空数组也渲染 `<ul>` 不渲染空态 | 「空列表给空态」红 |
| `shellTabOf` 对模态框路由恒返回 `'chat'` | 「返回记住的 tab（两种都试）」红 |
| `recallShellTab` 不校验值 | 「坏值回 chat」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/components/shell/RouteDialog.tsx src/components/shell/__tests__/RouteDialog.test.tsx src/components/shell/shellTab.ts src/components/shell/__tests__/shellTab.test.ts src/app/routes/app-shell.tsx src/features/bots src/features/miniapps src/app/routes/shell src/features/ai/components/AiChatPage.tsx src/app/routes/protected-layout.tsx src/app/routes.ts src/app/routes/__tests__/appShellRoutes.test.tsx src/i18n/messages.ts
git rm -q src/store/uiStore.ts
git commit -m "$(cat <<'EOF'
feat(shell): 带 URL 的模态框——资料 / 文件 / 会议 / 机器人 / 小程序，AI 助手进内容区

RouteDialog：路由挂着就打开，关闭有来路则后退、直接进入则回 /app/chat（RR 首个 location
的 key 是 'default'）。/app/profile 用现有 ProfileModal（查看 + 编辑），uiStore 驱动的挂载
连同 uiStore 一起删除——它从未被任何调用点打开。/app/files 装 FileManager，/app/meeting 装
WebRTCPanel 的创建/加入；/app/bots 与 /app/miniapps 新接 GET /api/bots、/api/miniapps/my，
解析器严格（缺必需字段抛错），小程序「打开」在新标签页走同源 /apps/* 透传。/app/ai-chat
是内容区整栏页，去掉它自带的返回按钮。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 侧栏工具拖拽钉住——`@dnd-kit` 双区布局（APP `sidebarLayout.ts` 移植）

**Files:**
- Modify: `package.json`、`bun.lock`（`bun add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2`——APP 同款三个版本）
- Create: `src/components/shell/sidebarLayout.ts`（纯模块：`{ pinned, more }` 模型、`normalizeLayout`、持久化、两个拖拽归约函数）
- Create: `src/components/shell/SidebarMorePanel.tsx`
- Modify: `src/components/shell/sidebarTools.tsx`（加 `SIDEBAR_TOOLS_BY_KEY`）
- Modify: `src/components/shell/Sidebar.tsx`（去掉 `pinnedTools` prop 与 Popover，换成 DndContext + 钉住区 + 自绘「更多」面板）
- Modify: `src/lib/sessionScope.ts`（`huanvae.sidebar-layout` 进设备级名单）
- Modify: `src/lib/__tests__/sessionScope.test.ts`（既有用例加一条种子 + 一条断言）
- Modify: `src/i18n/messages.ts`（`shell.nav.dragHint / allPinned / dragBackHint`）
- Test: `src/components/shell/__tests__/sidebarLayout.test.ts`、`src/components/shell/__tests__/Sidebar.test.tsx`（追加）

**Interfaces:**
- Consumes: Task 5 的 `SIDEBAR_TOOLS / SidebarTool / SidebarToolKey`、`Sidebar` 的现有结构（头像 / 两个 tab / 底部）、`useI18n`；`@dnd-kit/core` 的 `DndContext / DragOverlay / MeasuringStrategy / PointerSensor / pointerWithin / useDroppable / useSensor / useSensors`，`@dnd-kit/sortable` 的 `SortableContext / useSortable / verticalListSortingStrategy`，`@dnd-kit/utilities` 的 `CSS`。
- Produces:
  - `SIDEBAR_LAYOUT_STORAGE_KEY = 'huanvae.sidebar-layout'`、`SIDEBAR_TOOL_KEYS: readonly SidebarToolKey[]`（注册表顺序）
  - `type SidebarZone = 'pinned' | 'more'`、`interface SidebarLayout { pinned: SidebarToolKey[]; more: SidebarToolKey[] }`
  - `defaultLayout(): SidebarLayout`、`normalizeLayout(saved: unknown): SidebarLayout`、`loadLayout(storage?: Pick<Storage, 'getItem'>): SidebarLayout`、`saveLayout(layout, storage?: Pick<Storage, 'setItem'>): void`
  - `zoneOf(key, layout): SidebarZone | null`、`moveAcrossZones(layout, activeId: SidebarToolKey, overId: string): SidebarLayout`（跨区，onDragOver 用；同区或无效目标返回**同一引用**）、`reorderWithinZone(layout, activeId: SidebarToolKey, overId: string): SidebarLayout`（同区排序，onDragEnd 用；跨区或容器 id 返回同一引用）
  - `SIDEBAR_TOOLS_BY_KEY: Record<SidebarToolKey, SidebarTool>`
  - `SidebarMorePanel`（`forwardRef<HTMLDivElement, { moreKeys: SidebarToolKey[]; position: { top: number; left: number }; onNavigate: () => void }>`）
  - `Sidebar({ activeTab })`（不再有 `pinnedTools`；布局自己从 localStorage 读，设备级、登出不清）
  - i18n：`shell.nav.dragHint`（拖到侧栏可钉住）、`shell.nav.allPinned`（已全部钉到侧栏）、`shell.nav.dragBackHint`（从侧栏拖回此处可收纳）

- [ ] **Step 1: 装依赖 + 写失败的测试**

Run: `bun add @dnd-kit/core@^6.3.1 @dnd-kit/sortable@^10.0.0 @dnd-kit/utilities@^3.2.2`

`src/components/shell/__tests__/sidebarLayout.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_LAYOUT_STORAGE_KEY, SIDEBAR_TOOL_KEYS,
  defaultLayout, loadLayout, moveAcrossZones, normalizeLayout, reorderWithinZone, saveLayout, zoneOf,
} from '../sidebarLayout'

describe('sidebarLayout：注册表与默认布局', () => {
  it('工具 key 集合与顺序钉死（spec §5：meeting/files/bots/miniapps/ai）', () => {
    expect([...SIDEBAR_TOOL_KEYS]).toEqual(['meeting', 'files', 'bots', 'miniapps', 'ai'])
    expect(defaultLayout()).toEqual({ pinned: [], more: ['meeting', 'files', 'bots', 'miniapps', 'ai'] })
    expect(SIDEBAR_LAYOUT_STORAGE_KEY).toBe('huanvae.sidebar-layout')
  })
})

describe('normalizeLayout（APP 同名函数的移植用例）', () => {
  it('不是对象 / 数组 / 缺任一区 → 默认布局', () => {
    for (const bad of [null, undefined, 'x', 7, [], { pinned: [] }, { more: [] }, { pinned: 'files', more: [] }]) {
      expect(normalizeLayout(bad)).toEqual(defaultLayout())
    }
  })
  it('非法 key 被丢弃；跨区重复 pinned 优先；同区重复留首个；缺的按注册表顺序补到 more 末尾', () => {
    expect(normalizeLayout({ pinned: ['files', 'lan', 'files'], more: ['files', 'ai', 'ai', 'stocks'] })).toEqual({
      pinned: ['files'],
      more: ['ai', 'meeting', 'bots', 'miniapps'],
    })
  })
  it('合法布局原样保留顺序（正对照：不是一律回默认）', () => {
    expect(normalizeLayout({ pinned: ['ai', 'meeting'], more: ['miniapps', 'bots', 'files'] })).toEqual({ pinned: ['ai', 'meeting'], more: ['miniapps', 'bots', 'files'] })
  })
})

describe('loadLayout / saveLayout', () => {
  it('没存过 → 默认；坏 JSON → 默认；存过 → 经 normalizeLayout', () => {
    expect(loadLayout({ getItem: () => null })).toEqual(defaultLayout())
    expect(loadLayout({ getItem: () => '{oops' })).toEqual(defaultLayout())
    expect(loadLayout({ getItem: () => '{"pinned":["bots"],"more":[]}' })).toEqual({ pinned: ['bots'], more: ['meeting', 'files', 'miniapps', 'ai'] })
  })
  it('saveLayout 往约定键写 JSON', () => {
    const writes: Array<[string, string]> = []
    saveLayout({ pinned: ['ai'], more: ['meeting', 'files', 'bots', 'miniapps'] }, { setItem: (k, v) => { writes.push([k, v]) } })
    expect(writes).toEqual([['huanvae.sidebar-layout', '{"pinned":["ai"],"more":["meeting","files","bots","miniapps"]}']])
  })
})

describe('拖拽归约：moveAcrossZones（onDragOver）与 reorderWithinZone（onDragEnd）', () => {
  const base = { pinned: ['ai'], more: ['meeting', 'files', 'bots', 'miniapps'] } as const
  const layout = () => ({ pinned: [...base.pinned], more: [...base.more] })

  it('zoneOf', () => {
    expect(zoneOf('ai', layout())).toBe('pinned')
    expect(zoneOf('files', layout())).toBe('more')
  })
  it('拖到容器 pinned：从 more 移除并追加到 pinned 末尾', () => {
    expect(moveAcrossZones(layout(), 'files', 'pinned')).toEqual({ pinned: ['ai', 'files'], more: ['meeting', 'bots', 'miniapps'] })
  })
  it('拖到另一区的某一项上：插到该项前面', () => {
    expect(moveAcrossZones(layout(), 'ai', 'bots')).toEqual({ pinned: [], more: ['meeting', 'files', 'ai', 'bots', 'miniapps'] })
  })
  it('同区 / 未知目标：返回同一引用（不触发多余渲染）', () => {
    const l = layout()
    expect(moveAcrossZones(l, 'files', 'bots')).toBe(l)
    expect(moveAcrossZones(l, 'files', 'nowhere')).toBe(l)
    expect(moveAcrossZones(l, 'files', 'more')).toBe(l)
  })
  it('同区排序：files 放到 miniapps 的位置', () => {
    expect(reorderWithinZone(layout(), 'files', 'miniapps')).toEqual({ pinned: ['ai'], more: ['meeting', 'bots', 'miniapps', 'files'] })
  })
  it('跨区 / 容器 id / 自己：reorderWithinZone 返回同一引用', () => {
    const l = layout()
    expect(reorderWithinZone(l, 'ai', 'files')).toBe(l)
    expect(reorderWithinZone(l, 'files', 'more')).toBe(l)
    expect(reorderWithinZone(l, 'files', 'files')).toBe(l)
  })
})
```

`src/components/shell/__tests__/Sidebar.test.tsx` 追加（沿用文件顶部的 `renderAt` 与 `beforeEach`；`beforeEach` 里加一句 `localStorage.clear()`）：

```tsx
import { within } from '@testing-library/react'

describe('Sidebar：钉住布局', () => {
  it('localStorage 里钉住的工具出现在侧栏本体，「更多」面板只剩其余项并按存的顺序排', async () => {
    localStorage.setItem('huanvae.sidebar-layout', '{"pinned":["files"],"more":["ai","meeting","bots","miniapps"]}')
    renderAt('/app/chat', 'chat')
    const aside = within(screen.getByTestId('sidebar'))
    expect(aside.getByRole('link', { name: '我的文件' })).toHaveAttribute('href', '/app/files')
    screen.getByRole('button', { name: '更多功能' }).click()
    const panel = within(await screen.findByTestId('sidebar-more-panel'))
    expect(panel.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/app/ai-chat', '/app/meeting', '/app/bots', '/app/miniapps'])
    expect(panel.queryByRole('link', { name: '我的文件' })).toBeNull()
  })

  it('坏掉的布局值不影响渲染：回到默认（无钉住，五个都在面板里）', async () => {
    localStorage.setItem('huanvae.sidebar-layout', '{"pinned":"files"}')
    renderAt('/app/chat', 'chat')
    expect(within(screen.getByTestId('sidebar')).queryByRole('link', { name: '我的文件' })).toBeNull()
    screen.getByRole('button', { name: '更多功能' }).click()
    expect(within(await screen.findByTestId('sidebar-more-panel')).getAllByRole('link')).toHaveLength(5)
  })

  it('再点「更多」或点面板外收起', async () => {
    renderAt('/app/chat', 'chat')
    const more = screen.getByRole('button', { name: '更多功能' })
    more.click()
    expect(await screen.findByTestId('sidebar-more-panel')).toBeInTheDocument()
    more.click()
    await waitFor(() => expect(screen.queryByTestId('sidebar-more-panel')).toBeNull())
    more.click()
    await screen.findByTestId('sidebar-more-panel')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await waitFor(() => expect(screen.queryByTestId('sidebar-more-panel')).toBeNull())
  })
})
```

（`waitFor` 从 `@testing-library/react` 导入；面板经 `AnimatePresence` 退场，所以收起要 `waitFor`。）

`src/lib/__tests__/sessionScope.test.ts`：在「清掉本模块从没听说过的键，同时留下设备级键」那条用例里，种子段加 `localStorage.setItem('huanvae.sidebar-layout', '{"pinned":["files"],"more":[]}')`，断言段加 `expect(localStorage.getItem('huanvae.sidebar-layout')).toBe('{"pinned":["files"],"more":[]}')`。

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell/__tests__/sidebarLayout.test.ts src/components/shell/__tests__/Sidebar.test.tsx src/lib/__tests__/sessionScope.test.ts 2>&1 | tail -8`
Expected: FAIL（模块不存在 / 钉住项不渲染 / 布局键被清）。

- [ ] **Step 3: 写实现**

`src/i18n/messages.ts` 的 `shell.nav` 里追加：`dragHint: '拖到侧栏可钉住', allPinned: '已全部钉到侧栏', dragBackHint: '从侧栏拖回此处可收纳'`；英文 `dragHint: 'Drag to the sidebar to pin', allPinned: 'Everything is pinned', dragBackHint: 'Drag back here to unpin'`。

`src/lib/sessionScope.ts` 的 `DEVICE_SCOPED_KEYS` 里追加一条（放在 `app-settings` 之前）：

```ts
  /**
   * 侧栏工具的钉住布局（`components/shell/sidebarLayout.ts`）。这是**这台机器**上
   * 的排版偏好，不含任何账号数据——和 APP 一样按设备保存（spec §5）；登出清掉它
   * 等于每次换号都把用户拖好的侧栏打回默认。
   */
  ['huanvae.sidebar-layout', { keep: 'whole' }],
```

`src/components/shell/sidebarTools.tsx` 末尾追加：

```tsx
export const SIDEBAR_TOOLS_BY_KEY = Object.fromEntries(SIDEBAR_TOOLS.map((tool) => [tool.key, tool])) as Record<SidebarToolKey, SidebarTool>
```

`src/components/shell/sidebarLayout.ts`（APP `sidebarLayout.ts` 移植；key 集合换成 Web 的五个；不依赖 dnd-kit，便于单测）：

```ts
import { SIDEBAR_TOOLS, type SidebarToolKey } from './sidebarTools'

/**
 * 侧栏双区布局（APP sidebarLayout.ts 移植）：pinned = 钉在侧栏上的工具，more = 收在「更多」面板里的工具。
 * 两区合计恒等于 SIDEBAR_TOOL_KEYS 全集（normalizeLayout 保证：去重 + 补缺）。
 * 持久化在 localStorage `huanvae.sidebar-layout`，**设备级**（sessionScope 名单里，登出不清）。
 */
export const SIDEBAR_LAYOUT_STORAGE_KEY = 'huanvae.sidebar-layout'
export const SIDEBAR_TOOL_KEYS: readonly SidebarToolKey[] = SIDEBAR_TOOLS.map((tool) => tool.key)

export type SidebarZone = 'pinned' | 'more'
export interface SidebarLayout {
  pinned: SidebarToolKey[]
  more: SidebarToolKey[]
}

export function defaultLayout(): SidebarLayout {
  return { pinned: [], more: [...SIDEBAR_TOOL_KEYS] }
}

function isToolKey(value: unknown): value is SidebarToolKey {
  return typeof value === 'string' && (SIDEBAR_TOOL_KEYS as readonly string[]).includes(value)
}

function isZone(value: string): value is SidebarZone {
  return value === 'pinned' || value === 'more'
}

/** 清洗任意来源的布局：结构不对 → 默认；非法 key 丢弃；跨区重复 pinned 优先；同区重复留首个；缺失补到 more 末尾 */
export function normalizeLayout(saved: unknown): SidebarLayout {
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) return defaultLayout()
  const candidate = saved as { pinned?: unknown; more?: unknown }
  if (!Array.isArray(candidate.pinned) || !Array.isArray(candidate.more)) return defaultLayout()
  const seen = new Set<SidebarToolKey>()
  const pinned: SidebarToolKey[] = []
  for (const key of candidate.pinned) {
    if (isToolKey(key) && !seen.has(key)) { seen.add(key); pinned.push(key) }
  }
  const more: SidebarToolKey[] = []
  for (const key of candidate.more) {
    if (isToolKey(key) && !seen.has(key)) { seen.add(key); more.push(key) }
  }
  for (const key of SIDEBAR_TOOL_KEYS) {
    if (!seen.has(key)) more.push(key)
  }
  return { pinned, more }
}

export function loadLayout(storage: Pick<Storage, 'getItem'> = localStorage): SidebarLayout {
  const raw = storage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY)
  if (raw === null) return defaultLayout()
  try {
    return normalizeLayout(JSON.parse(raw))
  } catch {
    return defaultLayout()
  }
}

export function saveLayout(layout: SidebarLayout, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
}

export function zoneOf(key: SidebarToolKey, layout: SidebarLayout): SidebarZone | null {
  if (layout.pinned.includes(key)) return 'pinned'
  if (layout.more.includes(key)) return 'more'
  return null
}

/** onDragOver：跨区移动。over 是容器 id → 追加到该区末尾；over 是另一区的项 → 插到它前面。同区 / 无效目标返回同一引用。 */
export function moveAcrossZones(layout: SidebarLayout, activeId: SidebarToolKey, overId: string): SidebarLayout {
  const activeZone = zoneOf(activeId, layout)
  const overZone: SidebarZone | null = isZone(overId) ? overId : isToolKey(overId) ? zoneOf(overId, layout) : null
  if (!activeZone || !overZone || activeZone === overZone) return layout
  const next: SidebarLayout = { pinned: [...layout.pinned], more: [...layout.more] }
  next[activeZone] = next[activeZone].filter((k) => k !== activeId)
  const overIndex = isZone(overId) ? -1 : next[overZone].indexOf(overId as SidebarToolKey)
  if (overIndex === -1) next[overZone].push(activeId)
  else next[overZone].splice(overIndex, 0, activeId)
  return next
}

function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** onDragEnd：同区排序。跨区、容器 id、拖到自己身上都返回同一引用。 */
export function reorderWithinZone(layout: SidebarLayout, activeId: SidebarToolKey, overId: string): SidebarLayout {
  if (!isToolKey(overId) || overId === activeId) return layout
  const activeZone = zoneOf(activeId, layout)
  if (!activeZone || activeZone !== zoneOf(overId, layout)) return layout
  const from = layout[activeZone].indexOf(activeId)
  const to = layout[activeZone].indexOf(overId)
  if (from === -1 || to === -1 || from === to) return layout
  return { ...layout, [activeZone]: arrayMove(layout[activeZone], from, to) }
}
```

`src/components/shell/SidebarMorePanel.tsx`（APP 同名组件移植：`useDroppable('more')` 容器 + 竖排 `SortableContext`；行是 `useSortable` 包装的 `div`，里面才是真正的 `NavLink`——`useSortable` 的 `attributes` 带 `role="button"`，不能直接放到链接上，否则 `getByRole('link')` 找不到）：

```tsx
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'framer-motion'
import { forwardRef } from 'react'
import { NavLink } from 'react-router'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import { SIDEBAR_TOOLS_BY_KEY, type SidebarTool, type SidebarToolKey } from './sidebarTools'

interface SidebarMorePanelProps {
  moreKeys: SidebarToolKey[]
  /** fixed 定位（Sidebar 按「更多」按钮的位置算） */
  position: { top: number; left: number }
  /** 点了某一项：Sidebar 负责收起面板 */
  onNavigate: () => void
}

function MoreRow({ tool, label, onNavigate }: { tool: SidebarTool; label: string; onNavigate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tool.key })
  return (
    // 无键盘 sensor，wrapper 不抢 tab 焦点（覆写 attributes 的 tabIndex=0），焦点留给内层链接
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} tabIndex={-1} className={cn('rounded-[10px]', isDragging && 'opacity-40')}>
      <NavLink to={tool.to} onClick={onNavigate} className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[13px] text-foreground transition-colors hover:bg-[var(--primary-subtle)]">
        <tool.icon className="h-[18px] w-[18px] text-muted-foreground" />
        <span>{label}</span>
      </NavLink>
    </div>
  )
}

export const SidebarMorePanel = forwardRef<HTMLDivElement, SidebarMorePanelProps>(function SidebarMorePanel({ moreKeys, position, onNavigate }, ref) {
  const { t } = useI18n()
  const { setNodeRef, isOver } = useDroppable({ id: 'more' })
  return (
    <motion.div
      ref={ref}
      data-testid="sidebar-more-panel"
      role="dialog"
      aria-label={t('shell.nav.more')}
      style={{ top: position.top, left: position.left }}
      className="glass-surface fixed z-[10000] w-[210px] rounded-[14px] border border-[var(--glass-border)] p-2 shadow-[0_16px_48px_rgba(0,0,0,0.14)]"
      initial={{ opacity: 0, x: -8, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-[var(--border-subtle)] px-2.5 pb-2.5 pt-1.5">
        <span className="text-[13px] font-semibold text-foreground">{t('shell.nav.more')}</span>
        <span className="text-[11px] text-app-light">{t('shell.nav.dragHint')}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex min-h-[40px] flex-col gap-0.5 rounded-[10px] transition-colors', isOver && 'bg-[var(--primary-subtle)]')}>
        <SortableContext items={moreKeys} strategy={verticalListSortingStrategy}>
          {moreKeys.map((key) => (
            <MoreRow key={key} tool={SIDEBAR_TOOLS_BY_KEY[key]} label={t(SIDEBAR_TOOLS_BY_KEY[key].labelKey)} onNavigate={onNavigate} />
          ))}
        </SortableContext>
        {moreKeys.length === 0 && (
          <div className="px-2.5 py-3 text-center text-[12px] text-app-light">
            <div>{t('shell.nav.allPinned')}</div>
            <div>{t('shell.nav.dragBackHint')}</div>
          </div>
        )}
      </div>
    </motion.div>
  )
})
```

`src/components/shell/Sidebar.tsx`：整体替换为下面这版（头像 / tab / 底部三区与第 5 步一致，只有工具区换成拖拽双区；`Popover` import 删掉）：

```tsx
import { DndContext, DragOverlay, MeasuringStrategy, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence } from 'framer-motion'
import { MessageCircle, Moon, MoreHorizontal, Settings, Sun, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router'
import { useAuthStore } from '@/features/auth/store/authStore'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { toAbsoluteApiUrl } from '@/lib/apiConfig'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWSStore } from '@/store/wsStore'
import { SidebarMorePanel } from './SidebarMorePanel'
import { defaultLayout, loadLayout, moveAcrossZones, reorderWithinZone, saveLayout, type SidebarLayout } from './sidebarLayout'
import { SIDEBAR_TOOLS_BY_KEY, type SidebarTool, type SidebarToolKey } from './sidebarTools'

interface SidebarProps {
  activeTab: 'chat' | 'contacts' | 'settings'
}

/** APP .nav-btn：42px 圆角 12，hover 主色淡底，active 渐变底 */
const navBtn = 'flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-muted-foreground transition-all duration-200 hover:bg-[var(--primary-subtle)] hover:text-primary [&>svg]:h-[22px] [&>svg]:w-[22px]'
const navBtnActive = 'bg-[var(--primary-subtle)] text-[var(--primary-hover)]'

function Badge({ value, testId }: { value: string; testId: string }) {
  if (!value) return null
  return (
    <span data-testid={testId} className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-unread px-1 text-[10px] font-semibold text-[var(--unread-badge-text)]">
      {value}
    </span>
  )
}

/** 钉住区单项：useSortable 包一层 div，里面是真正的 NavLink（同 SidebarMorePanel 的理由） */
function PinnedTool({ tool, label }: { tool: SidebarTool; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tool.key })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...listeners} tabIndex={-1} className={cn(isDragging && 'opacity-40')}>
      <NavLink to={tool.to} title={label} aria-label={label} className={({ isActive }) => cn(navBtn, isActive && navBtnActive)}>
        <tool.icon />
      </NavLink>
    </div>
  )
}

/** 钉住区容器（useDroppable 'pinned' + 竖排 SortableContext）；拖拽中显示虚线落点 */
function PinZone({ pinned, dragActive, t }: { pinned: SidebarToolKey[]; dragActive: boolean; t: (key: string) => string }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pinned' })
  return (
    <div
      ref={setNodeRef}
      data-testid="pin-zone"
      className={cn(
        'flex flex-col items-center gap-2 rounded-[12px] transition-colors',
        dragActive && 'min-h-[42px] w-[42px] outline-dashed outline-1 outline-[var(--border-strong)]',
        dragActive && isOver && 'bg-[var(--primary-subtle)]',
      )}
    >
      <SortableContext items={pinned} strategy={verticalListSortingStrategy}>
        {pinned.map((key) => (
          <PinnedTool key={key} tool={SIDEBAR_TOOLS_BY_KEY[key]} label={t(SIDEBAR_TOOLS_BY_KEY[key].labelKey)} />
        ))}
      </SortableContext>
    </div>
  )
}

export function Sidebar({ activeTab }: SidebarProps) {
  const { t } = useI18n()
  const totalUnread = useChatStore((s) => s.totalUnreadCount)
  const pendingCount = useFriendsStore((s) => s.pendingRequests.length)
  const profile = useProfileStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const connected = useWSStore((s) => s.connected)
  const theme = useSettingsStore((s) => s.theme)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const isDark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  // 头像：profile 优先，回落到 authStore 的 user；空串当"没有头像"（裸 <img src=""> 会让 React 告警并重下整页）
  const avatarSrc = toAbsoluteApiUrl(profile?.user_avatar_url || user?.avatar_url) ?? null
  const avatarInitial = (profile?.user_nickname || user?.nickname || 'U')[0]?.toUpperCase() ?? 'U'

  // ---- 双区布局：SSR 先渲染默认布局，挂载后再读 localStorage（避免 hydration 不一致） ----
  const [layout, setLayout] = useState<SidebarLayout>(defaultLayout)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setLayout(loadLayout())
    setMounted(true)
  }, [])

  const [showMore, setShowMore] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const [activeKey, setActiveKey] = useState<SidebarToolKey | null>(null)
  const snapshotRef = useRef<SidebarLayout | null>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 仅 PointerSensor、6px 才算拖：点击不触发拖拽，链接照常导航。不加键盘 sensor（APP 同款理由）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const openMore = useCallback(() => {
    const rect = moreBtnRef.current?.getBoundingClientRect()
    if (rect) setPanelPos({ top: rect.top, left: rect.right + 10 })
    setShowMore(true)
  }, [])
  const toggleMore = () => (showMore ? setShowMore(false) : openMore())

  // 点面板外收起（拖拽中不收：拖出/拖回都需要面板在场）
  useEffect(() => {
    if (!showMore) return
    const onPointerDown = (event: PointerEvent) => {
      if (activeKey !== null) return
      const target = event.target as Node
      if (panelRef.current?.contains(target) || moreBtnRef.current?.contains(target)) return
      setShowMore(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [showMore, activeKey])

  // ---- dnd-kit 编排（APP Sidebar.tsx 的标准多容器模式；归约逻辑在 sidebarLayout.ts） ----
  const handleDragStart = (event: DragStartEvent) => {
    setActiveKey(event.active.id as SidebarToolKey)
    snapshotRef.current = layout
    if (!showMore) openMore()
  }
  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) return
    const activeId = event.active.id as SidebarToolKey
    const overId = String(event.over.id)
    setLayout((prev) => moveAcrossZones(prev, activeId, overId)) // 拖拽中不持久化
  }
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = event.active.id as SidebarToolKey
    // onDragOver 的跨区更新在 pointerup 前已 flush，闭包里的 layout 就是最新值；saveLayout 不放进 updater（StrictMode 双调用会双写）
    const next = event.over ? reorderWithinZone(layout, activeId, String(event.over.id)) : layout
    setLayout(next)
    saveLayout(next)
    setActiveKey(null)
    snapshotRef.current = null
  }
  const handleDragCancel = () => {
    if (snapshotRef.current) setLayout(snapshotRef.current)
    setActiveKey(null)
    snapshotRef.current = null
  }

  const activeTool = activeKey ? SIDEBAR_TOOLS_BY_KEY[activeKey] : null

  return (
    // pointerWithin：指针真正进入某 droppable 才算命中；measuring Always：钉住区空时不挂载、拖起才挂载，必须持续测量
    <DndContext sensors={sensors} collisionDetection={pointerWithin} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <aside data-testid="sidebar" className="glass-surface z-10 flex h-full w-[60px] flex-col items-center border-r border-[var(--glass-border)] py-4">
        {/* APP .sidebar-avatar + .online-indicator */}
        <NavLink to={ROUTES.app.profile} aria-label={t('shell.nav.profile')} title={t('shell.nav.profile')} className="relative mb-6 block h-10 w-10 overflow-hidden rounded-[10px] border-2 border-[var(--white-alpha-90)] bg-[linear-gradient(135deg,var(--white-alpha-80),var(--white-alpha-50))] shadow-[0_4px_12px_rgba(59,130,246,0.15)]">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-app-light">{avatarInitial}</span>
          )}
          <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--presence-dot-ring)]', connected ? 'bg-app-success' : 'bg-destructive')} />
        </NavLink>

        {/* APP .sidebar-nav */}
        <nav className="flex flex-1 flex-col items-center gap-2">
          <NavLink to={ROUTES.app.chat} title={t('shell.nav.chat')} aria-label={t('shell.nav.chat')} aria-current={activeTab === 'chat' ? 'page' : undefined} className={cn(navBtn, 'relative', activeTab === 'chat' && navBtnActive)}>
            <MessageCircle />
            <Badge value={formatUnreadCount(totalUnread)} testId="badge-chat" />
          </NavLink>
          <NavLink to={ROUTES.app.contacts} title={t('shell.nav.contacts')} aria-label={t('shell.nav.contacts')} aria-current={activeTab === 'contacts' ? 'page' : undefined} className={cn(navBtn, 'relative', activeTab === 'contacts' && navBtnActive)}>
            <Users />
            <Badge value={formatUnreadCount(pendingCount)} testId="badge-contacts" />
          </NavLink>

          {/* 钉住区：空且没在拖时不渲染（gap 会给 0 高度的空 div 也算间距） */}
          {(layout.pinned.length > 0 || activeKey !== null) && <PinZone pinned={layout.pinned} dragActive={activeKey !== null} t={t} />}

          <button ref={moreBtnRef} type="button" title={t('shell.nav.more')} aria-label={t('shell.nav.more')} aria-expanded={showMore} onClick={toggleMore} className={cn(navBtn, showMore && navBtnActive)}>
            <MoreHorizontal />
          </button>
        </nav>

        {/* APP .sidebar-bottom */}
        <div className="flex flex-col items-center gap-2">
          <NavLink to={ROUTES.app.settings} title={t('shell.nav.settings')} aria-label={t('shell.nav.settings')} className={({ isActive }) => cn(navBtn, isActive && navBtnActive)}>
            <Settings />
          </NavLink>
          <button type="button" title={t('shell.nav.theme')} aria-label={t('shell.nav.theme')} className={navBtn} onClick={() => setSetting('theme', isDark ? 'light' : 'dark')}>
            {isDark ? <Sun /> : <Moon />}
          </button>
        </div>
      </aside>

      {/* 面板与拖拽幽灵卡都 portal 到 body：不被 aside 的 overflow 裁切；SSR 没有 document，挂载后再渲染 */}
      {mounted && createPortal(
        <AnimatePresence>
          {showMore && <SidebarMorePanel ref={panelRef} moreKeys={layout.more} position={panelPos} onNavigate={() => setShowMore(false)} />}
        </AnimatePresence>,
        document.body,
      )}
      {mounted && createPortal(
        <DragOverlay zIndex={10001}>
          {activeTool ? (
            <div className="glass-surface flex items-center gap-2.5 rounded-[10px] border border-[var(--glass-border)] px-2.5 py-[7px] text-[13px] text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
              <activeTool.icon className="h-[18px] w-[18px] text-muted-foreground" />
              <span>{t(activeTool.labelKey)}</span>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}
```

`src/components/shell/AppShell.tsx`：`<Sidebar activeTab={activeTab} />` 不变（第 5 步没传 `pinnedTools`）。第 5 步 `Sidebar.test.tsx` 里「更多」面板那条用例照旧通过：默认布局五个都在面板里。

- [ ] **Step 4: 运行确认通过 + 冒烟**

Run: `bun run test src/components/shell src/lib/__tests__/sessionScope.test.ts 2>&1 | tail -8`；`bunx tsc --noEmit`。
冒烟（必须做，拖拽没有单测）：dev 里打开「更多」，把「我的文件」拖到侧栏（钉住区虚线框出现 → 松手 → 图标常驻侧栏）；刷新页面仍在；把它拖回面板；面板内上下拖动换序；登出再登录，布局还在。截图存入报告。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `normalizeLayout` 不做跨区去重 | 「跨区重复 pinned 优先」红 |
| `normalizeLayout` 不补缺 | 同上用例的 `more` 尾部断言红 |
| `moveAcrossZones` 同区也返回新对象 | 「返回同一引用」红 |
| `reorderWithinZone` 允许跨区 | 「跨区 … 返回同一引用」红 |
| `Sidebar` 不在挂载后 `loadLayout()` | 「钉住的工具出现在侧栏本体」红 |
| `sessionScope` 名单里删掉 `huanvae.sidebar-layout` | sessionScope 那条断言红 |
| 点面板外的监听删掉 | 「点面板外收起」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add package.json bun.lock src/components/shell/sidebarLayout.ts src/components/shell/SidebarMorePanel.tsx src/components/shell/sidebarTools.tsx src/components/shell/Sidebar.tsx src/components/shell/__tests__/sidebarLayout.test.ts src/components/shell/__tests__/Sidebar.test.tsx src/lib/sessionScope.ts src/lib/__tests__/sessionScope.test.ts src/i18n/messages.ts
git commit -m "$(cat <<'EOF'
feat(shell): 侧栏工具拖拽钉住——@dnd-kit 双区布局（APP sidebarLayout 移植）

sidebarLayout.ts 是纯模块：{ pinned, more } 模型、normalizeLayout（去重 + 补缺）、localStorage
持久化（huanvae.sidebar-layout，设备级、登出不清），以及两个拖拽归约函数 moveAcrossZones /
reorderWithinZone——dnd-kit 的 onDragOver / onDragEnd 只是把事件交给它们。Sidebar 换成
DndContext + 钉住区 + 自绘「更多」面板（portal 到 body），PointerSensor 6px 起拖，拖拽中
面板保持在场；DragOverlay 幽灵卡。SSR 先渲染默认布局，挂载后再读盘。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 响应式折叠——桌面三栏 / 平板二选一 / 手机底部条

**Files:**
- Create: `src/components/shell/useShellFold.ts`（`matchMedia` + `useSyncExternalStore`）
- Create: `src/components/shell/shellFold.ts`（纯函数：`isDetailPath`、`backTargetOf`）
- Create: `src/components/shell/MobileTabBar.tsx`
- Modify: `src/components/shell/AppShell.tsx`（持有折叠状态，三种布局）
- Modify: `src/app/routes/shell/settings.tsx`（折叠时索引不再自动跳 appearance）
- Create: `src/components/shell/__tests__/viewportStub.ts`（`matchMedia` 测试桩，不含用例）
- Test: `src/components/shell/__tests__/shellFold.test.ts`、`src/components/shell/__tests__/useShellFold.test.tsx`、`src/components/shell/__tests__/AppShell.test.tsx`、`src/app/routes/shell/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: Task 5 的 `AppShell({ activeTab, list, children })`、`Sidebar`、`EmptyContent`；Task 8 的 `ShellTab`（`'chat' | 'contacts'`）；`SIDEBAR_TOOLS`；`formatUnreadCount`；`useChatStore().{ totalUnreadCount, selectedConversation }`；`useFriendsStore().pendingRequests`；`usePathname`（`@/lib/navigation`）；shadcn `Popover / PopoverTrigger / PopoverContent`；i18n `shell.nav.*`（含第 5 步已加的 `backToList`）。
- Produces:
  - `type ShellFold = 'desktop' | 'tablet' | 'phone'`；`useShellFold(): ShellFold`（≥1024 desktop、768–1023 tablet、<768 phone；SSR 快照 `'desktop'`）
  - `isDetailPath(pathname: string): boolean`（`/app/chat/<id>`、`/app/contacts/friends|groups/<id>`、`/app/settings/<section>`、`/app/ai-chat` 为真；其余含模态框路由为假）
  - `backTargetOf(pathname: string, rememberedTab: ShellTab): string`（chat/contacts/settings 子路径回各自根；`/app/ai-chat` 回记住的 tab 根）
  - `MobileTabBar({ activeTab: 'chat' | 'contacts' | 'settings' })`（`data-testid="mobile-tab-bar"`：聊天 / 联系人 / 更多；「更多」是 Popover，列出五个工具 + 个人资料 + 设置）
  - `AppShell` 的 DOM 约定：`data-testid="sidebar"`（桌面/平板）、`list-column`、`content-column`、`fold-back-bar`（折叠且有选中项时的顶栏，里面是 `aria-label="返回列表"` 的链接）、`mobile-tab-bar`（手机）。折叠且**没有**选中项时 `children` 仍然挂载在一个 `hidden` 容器里（模态框路由的 Dialog 是 portal，照常弹出）。

- [ ] **Step 1: 写失败的测试**

`src/components/shell/__tests__/shellFold.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { backTargetOf, isDetailPath } from '../shellFold'

describe('isDetailPath：折叠时该显示内容区的 URL', () => {
  it.each([
    ['/app/chat/f-alice', true], ['/app/chat/g-g1', true],
    ['/app/contacts/friends/alice', true], ['/app/contacts/groups/g1', true],
    ['/app/settings/appearance', true], ['/app/ai-chat', true],
    ['/app/chat', false], ['/app/contacts', false], ['/app/settings', false],
    ['/app/files', false], ['/app/meeting', false], ['/app/bots', false], ['/app/miniapps', false], ['/app/profile', false],
  ])('%s → %s', (path, expected) => {
    expect(isDetailPath(path)).toBe(expected)
  })
})

describe('backTargetOf：「返回列表」去哪', () => {
  it('chat / contacts / settings 子路径回各自的根', () => {
    expect(backTargetOf('/app/chat/f-alice', 'contacts')).toBe('/app/chat')
    expect(backTargetOf('/app/contacts/friends/alice', 'chat')).toBe('/app/contacts')
    expect(backTargetOf('/app/settings/account', 'chat')).toBe('/app/settings')
  })
  it('AI 助手回记住的 tab 根（两种都试，证明确实读了参数）', () => {
    expect(backTargetOf('/app/ai-chat', 'chat')).toBe('/app/chat')
    expect(backTargetOf('/app/ai-chat', 'contacts')).toBe('/app/contacts')
  })
})
```

`src/components/shell/__tests__/viewportStub.ts`（测试桩，**不含用例**——放在单独文件里，因为 vitest 里 import 一个测试文件会把它的 `describe` 也注册一遍；happy-dom 自带的 `matchMedia` 不认断点，所以必须桩）：

```ts
import { vi } from 'vitest'

/** 可控的 matchMedia：按 `min-width` 数字和给定视口宽比较，并记录 change 监听器以便触发 */
export function stubViewport(initialWidth: number) {
  let width = initialWidth
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0)
    return {
      get matches() { return width >= min },
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => { listeners.add(cb) },
      removeEventListener: (_: string, cb: () => void) => { listeners.delete(cb) },
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList
  })
  return { resize(next: number) { width = next; for (const cb of listeners) cb() } }
}
```

`src/components/shell/__tests__/useShellFold.test.tsx`：

```tsx
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShellFold } from '../useShellFold'
import { stubViewport } from './viewportStub'

describe('useShellFold', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([[1440, 'desktop'], [1024, 'desktop'], [1023, 'tablet'], [768, 'tablet'], [767, 'phone'], [360, 'phone']] as const)('宽 %i → %s', (width, expected) => {
    stubViewport(width)
    expect(renderHook(() => useShellFold()).result.current).toBe(expected)
  })

  it('视口变化时跟着变（订阅了 change）', () => {
    const viewport = stubViewport(1440)
    const { result } = renderHook(() => useShellFold())
    expect(result.current).toBe('desktop')
    act(() => viewport.resize(500))
    expect(result.current).toBe('phone')
  })
})
```

`src/components/shell/__tests__/AppShell.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/features/chat/store/chatStore'
import { AppShell } from '../AppShell'
import { stubViewport } from './viewportStub'

const renderAt = (path: string, activeTab: 'chat' | 'contacts' | 'settings' = 'chat') =>
  render(<RouterProvider router={createMemoryRouter([{ path: '*', element: <AppShell activeTab={activeTab} list={<div>LIST</div>}><div>CONTENT</div></AppShell> }], { initialEntries: [path] })} />)

describe('AppShell 的折叠', () => {
  beforeEach(() => useChatStore.setState({ selectedConversation: { id: 'alice', type: 'friend', name: '小爱', unreadCount: 0 } }))
  afterEach(() => vi.unstubAllGlobals())

  it('桌面：三栏都在，没有返回条与底部条', () => {
    stubViewport(1440)
    renderAt('/app/chat/f-alice')
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('list-column')).toHaveTextContent('LIST')
    expect(screen.getByTestId('content-column')).toHaveTextContent('CONTENT')
    expect(screen.queryByTestId('fold-back-bar')).toBeNull()
    expect(screen.queryByTestId('mobile-tab-bar')).toBeNull()
  })

  it('平板无选中：侧栏 + 列表，内容停在 hidden 容器里', () => {
    stubViewport(900)
    renderAt('/app/chat')
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('list-column')).toHaveTextContent('LIST')
    expect(screen.queryByTestId('content-column')).toBeNull()
    expect(screen.getByText('CONTENT').closest('[hidden]')).not.toBeNull()
  })

  it('平板有选中：侧栏 + 内容，顶部返回条链接回 /app/chat 并带会话名；列表不渲染', () => {
    stubViewport(900)
    renderAt('/app/chat/f-alice')
    expect(screen.getByTestId('content-column')).toHaveTextContent('CONTENT')
    expect(screen.queryByTestId('list-column')).toBeNull()
    const bar = screen.getByTestId('fold-back-bar')
    expect(bar).toHaveTextContent('小爱')
    expect(screen.getByRole('link', { name: '返回列表' })).toHaveAttribute('href', '/app/chat')
  })

  it('手机：没有侧栏，有底部条（聊天 / 联系人 / 更多）；有选中时底部条让位给内容', () => {
    stubViewport(390)
    const first = renderAt('/app/contacts', 'contacts')
    expect(screen.queryByTestId('sidebar')).toBeNull()
    const bar = screen.getByTestId('mobile-tab-bar')
    expect(bar).toHaveTextContent('消息')
    expect(bar).toHaveTextContent('联系人')
    expect(screen.getByRole('link', { name: '联系人' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '消息' })).not.toHaveAttribute('aria-current')
    first.unmount()
    renderAt('/app/contacts/friends/alice', 'contacts')
    expect(screen.queryByTestId('mobile-tab-bar')).toBeNull()
    expect(screen.getByRole('link', { name: '返回列表' })).toHaveAttribute('href', '/app/contacts')
  })

  it('手机「更多」列出五个工具 + 个人资料 + 设置', async () => {
    stubViewport(390)
    renderAt('/app/chat')
    screen.getByRole('button', { name: '更多功能' }).click()
    expect(await screen.findByRole('link', { name: '我的文件' })).toHaveAttribute('href', '/app/files')
    expect(screen.getByRole('link', { name: 'AI 助手' })).toHaveAttribute('href', '/app/ai-chat')
    expect(screen.getByRole('link', { name: '个人资料' })).toHaveAttribute('href', '/app/profile')
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/app/settings')
  })
})
```

`src/app/routes/shell/__tests__/settings.test.tsx`：

```tsx
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewport } from '@/components/shell/__tests__/viewportStub'
import SettingsIndex from '../settings'

const mount = () => {
  const router = createMemoryRouter(
    [{ path: '/app/settings', element: <SettingsIndex />, children: [{ path: ':section', element: <div>SECTION</div> }] }],
    { initialEntries: ['/app/settings'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('/app/settings 索引', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('桌面：自动跳到 appearance', async () => {
    stubViewport(1440)
    const router = mount()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/app/settings/appearance'))
  })
  it('折叠：停在 /app/settings（列表栏显示分区列表），不跳', async () => {
    stubViewport(390)
    const router = mount()
    await new Promise((r) => setTimeout(r, 20))
    expect(router.state.location.pathname).toBe('/app/settings')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/components/shell/__tests__/shellFold.test.ts src/components/shell/__tests__/useShellFold.test.tsx src/components/shell/__tests__/AppShell.test.tsx src/app/routes/shell/__tests__/settings.test.tsx 2>&1 | tail -8`
Expected: FAIL。

- [ ] **Step 3: 写实现**

`src/components/shell/useShellFold.ts`：

```ts
import { useSyncExternalStore } from 'react'

export type ShellFold = 'desktop' | 'tablet' | 'phone'

const DESKTOP = '(min-width: 1024px)'
const TABLET = '(min-width: 768px)'

function read(): ShellFold {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop'
  if (window.matchMedia(DESKTOP).matches) return 'desktop'
  if (window.matchMedia(TABLET).matches) return 'tablet'
  return 'phone'
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const lists = [window.matchMedia(DESKTOP), window.matchMedia(TABLET)]
  for (const list of lists) list.addEventListener('change', onChange)
  return () => { for (const list of lists) list.removeEventListener('change', onChange) }
}

/** spec §3 的三档断点：≥1024 三栏；768–1023 侧栏 + 二选一；<768 底部条 + 二选一。SSR 快照恒为 desktop，水合后再按真实视口重渲染。 */
export function useShellFold(): ShellFold {
  return useSyncExternalStore(subscribe, read, () => 'desktop')
}
```

`src/components/shell/shellFold.ts`：

```ts
import { ROUTES } from '@/lib/routes'
import type { ShellTab } from './shellTab'

/** 折叠时内容区是否该显示：URL 里有选中项（会话 / 联系人 / 设置分区）或整栏工具页 */
export function isDetailPath(pathname: string): boolean {
  if (pathname.startsWith(`${ROUTES.app.chat}/`)) return true
  if (pathname.startsWith(`${ROUTES.app.contacts}/`)) return true
  if (pathname.startsWith(`${ROUTES.app.settings}/`)) return true
  return pathname === ROUTES.app.aiChat
}

/** 折叠时「返回列表」的目标 */
export function backTargetOf(pathname: string, rememberedTab: ShellTab): string {
  if (pathname.startsWith(ROUTES.app.contacts)) return ROUTES.app.contacts
  if (pathname.startsWith(ROUTES.app.settings)) return ROUTES.app.settings
  if (pathname.startsWith(ROUTES.app.chat)) return ROUTES.app.chat
  return rememberedTab === 'contacts' ? ROUTES.app.contacts : ROUTES.app.chat
}
```

`src/components/shell/MobileTabBar.tsx`：

```tsx
import { MessageCircle, MoreHorizontal, Settings, UserRound, Users, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatUnreadCount } from '@/features/chat/lib/formatUnreadCount'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { SIDEBAR_TOOLS } from './sidebarTools'

const tabBtn = 'relative flex h-full min-w-[64px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground [&>svg]:h-6 [&>svg]:w-6'
const tabActive = 'text-primary'
const row = 'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[14px] text-foreground transition-colors hover:bg-[var(--primary-subtle)] [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:text-muted-foreground'

function TabLink({ to, label, icon: Icon, active, badge, testId }: { to: string; label: string; icon: LucideIcon; active: boolean; badge: string; testId: string }) {
  return (
    <NavLink to={to} aria-label={label} aria-current={active ? 'page' : undefined} className={cn(tabBtn, active && tabActive)}>
      <span className="relative">
        <Icon />
        {badge && <span data-testid={testId} className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[8px] bg-unread px-1 text-[10px] font-semibold text-[var(--unread-badge-text)]">{badge}</span>}
      </span>
      <span>{label}</span>
    </NavLink>
  )
}

/** <768px 的底部条（spec §3）：聊天 / 联系人 / 更多。「更多」列出全部工具 + 个人资料 + 设置（手机上没有竖侧栏，这两项只能从这里进） */
export function MobileTabBar({ activeTab }: { activeTab: 'chat' | 'contacts' | 'settings' }) {
  const { t } = useI18n()
  const totalUnread = useChatStore((s) => s.totalUnreadCount)
  const pendingCount = useFriendsStore((s) => s.pendingRequests.length)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <nav data-testid="mobile-tab-bar" className="glass-surface flex h-[60px] shrink-0 items-stretch justify-around border-t border-[var(--glass-border)] pb-[env(safe-area-inset-bottom)]">
      <TabLink to={ROUTES.app.chat} label={t('shell.nav.chat')} icon={MessageCircle} active={activeTab === 'chat'} badge={formatUnreadCount(totalUnread)} testId="badge-chat" />
      <TabLink to={ROUTES.app.contacts} label={t('shell.nav.contacts')} icon={Users} active={activeTab === 'contacts'} badge={formatUnreadCount(pendingCount)} testId="badge-contacts" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={t('shell.nav.more')} className={cn(tabBtn, open && tabActive)}>
            <MoreHorizontal />
            <span>{t('shell.nav.more')}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="glass-surface w-[220px] rounded-[14px] border-[var(--glass-border)] p-2">
          <div className="flex flex-col gap-0.5">
            {SIDEBAR_TOOLS.map((tool) => (
              <NavLink key={tool.key} to={tool.to} onClick={close} className={row}><tool.icon /><span>{t(tool.labelKey)}</span></NavLink>
            ))}
            <div className="my-1 border-t border-[var(--border-subtle)]" />
            <NavLink to={ROUTES.app.profile} onClick={close} className={row}><UserRound /><span>{t('shell.nav.profile')}</span></NavLink>
            <NavLink to={ROUTES.app.settings} onClick={close} className={row}><Settings /><span>{t('shell.nav.settings')}</span></NavLink>
          </div>
        </PopoverContent>
      </Popover>
    </nav>
  )
}
```

`src/components/shell/AppShell.tsx`（整体替换）：

```tsx
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useI18n } from '@/i18n/I18nProvider'
import { usePathname } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { MobileTabBar } from './MobileTabBar'
import { Sidebar } from './Sidebar'
import { backTargetOf, isDetailPath } from './shellFold'
import { useShellFold } from './useShellFold'

interface AppShellProps {
  activeTab: 'chat' | 'contacts' | 'settings'
  list: ReactNode
  children: ReactNode
}

const bg = 'h-[100dvh] w-screen overflow-hidden bg-[var(--gradient-bg-page)] text-foreground'

/**
 * APP Main.tsx 的三栏 + spec §3 的折叠：
 * - desktop：Sidebar 60 ｜ 列表 320 ｜ 内容
 * - tablet：Sidebar 60 ｜（列表｜内容）二选一，内容顶部有「返回列表」
 * - phone：（列表｜内容）二选一 + 底部条；内容态底部条让位
 * 折叠且无选中项时 children 仍挂在 hidden 容器里：模态框路由的 Dialog 是 portal，照常弹出。
 */
export function AppShell({ activeTab, list, children }: AppShellProps) {
  const { t } = useI18n()
  const fold = useShellFold()
  const pathname = usePathname()
  const detail = isDetailPath(pathname)
  const conversationName = useChatStore((s) => s.selectedConversation?.name)

  if (fold === 'desktop') {
    return (
      <div className={`grid grid-cols-[60px_320px_1fr] ${bg}`}>
        <Sidebar activeTab={activeTab} />
        <section data-testid="list-column" className="glass-surface flex min-h-0 flex-col border-r border-[var(--glass-border)]">{list}</section>
        <main data-testid="content-column" className="relative flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</main>
      </div>
    )
  }

  const back = backTargetOf(pathname, activeTab === 'contacts' ? 'contacts' : 'chat')
  const title = pathname.startsWith(`${ROUTES.app.chat}/`) ? (conversationName ?? '') : ''
  const pane = detail ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div data-testid="fold-back-bar" className="glass-surface flex h-12 shrink-0 items-center gap-1 border-b border-[var(--glass-border)] px-1">
        <NavLink to={back} aria-label={t('shell.nav.backToList')} title={t('shell.nav.backToList')} className="flex h-10 w-10 items-center justify-center rounded-[12px] text-muted-foreground hover:bg-[var(--primary-subtle)] hover:text-primary">
          <ChevronLeft className="h-6 w-6" />
        </NavLink>
        <span className="truncate text-[15px] font-semibold text-foreground">{title}</span>
      </div>
      <main data-testid="content-column" className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  ) : (
    <>
      <section data-testid="list-column" className="glass-surface flex min-h-0 min-w-0 flex-1 flex-col">{list}</section>
      <div hidden>{children}</div>
    </>
  )

  if (fold === 'tablet') {
    return (
      <div className={`grid grid-cols-[60px_1fr] ${bg}`}>
        <Sidebar activeTab={activeTab} />
        <div className="flex min-h-0 min-w-0 flex-col">{pane}</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${bg}`}>
      {pane}
      {!detail && <MobileTabBar activeTab={activeTab} />}
    </div>
  )
}
```

`src/app/routes/shell/settings.tsx`：

```tsx
import { Navigate, useOutlet } from 'react-router'
import { useShellFold } from '@/components/shell/useShellFold'
import { settingsPath } from '@/lib/routes'

/** 桌面：没有分区就跳 appearance；折叠：停在索引，让列表栏显示分区列表（跳了会把「返回列表」变成死循环） */
export default function SettingsIndex() {
  const outlet = useOutlet()
  const fold = useShellFold()
  if (outlet) return outlet
  return fold === 'desktop' ? <Navigate to={settingsPath('appearance')} replace /> : null
}
```

（`ChatWindow hideMobileHeader` 在 <768 隐藏自己的头部，会话名由折叠顶栏显示；768–1023 两者都在——本期只保证可用，APP 的移动端页面组是第 7 期。通话/群信息按钮在手机上因此不可达，记账本。）

- [ ] **Step 4: 运行确认通过 + 冒烟**

Run: `bun run test src/components/shell src/app/routes/shell 2>&1 | tail -8`；`bunx tsc --noEmit`。
冒烟：应用内浏览器分别按 1440 / 900 / 390 宽打开 `/app/chat`：三栏 → 侧栏 + 列表（点一条 → 内容 + 返回条 → 返回回列表）→ 底部条（更多里能进设置；进 `/app/settings` 看到分区列表，点一个分区 → 内容 + 返回，返回回列表不循环）。三档都不得出现横向滚动条。截图存入报告。

- [ ] **Step 5: 变异验证**

| 变异 | 期望 |
|---|---|
| `useShellFold` 的 `TABLET` 改成 `(min-width: 700px)` | 「宽 767 → phone」红 |
| `subscribe` 不注册 change | 「视口变化时跟着变」红 |
| `isDetailPath` 对 `/app/files` 返回 true | shellFold 表格用例红 |
| `AppShell` 折叠无选中时不渲染 `children` | 「内容停在 hidden 容器里」红 |
| 手机有选中时仍渲染底部条 | 「底部条让位给内容」红 |
| `settings.tsx` 折叠也 `Navigate` | 「折叠：停在 /app/settings」红 |

- [ ] **Step 6: 门禁 + 提交**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`

```bash
git add src/components/shell/useShellFold.ts src/components/shell/shellFold.ts src/components/shell/MobileTabBar.tsx src/components/shell/AppShell.tsx src/components/shell/__tests__/viewportStub.ts src/components/shell/__tests__/shellFold.test.ts src/components/shell/__tests__/useShellFold.test.tsx src/components/shell/__tests__/AppShell.test.tsx src/app/routes/shell/settings.tsx src/app/routes/shell/__tests__/settings.test.tsx
git commit -m "$(cat <<'EOF'
feat(shell): 响应式折叠——≥1024 三栏、768–1023 侧栏加二选一、<768 底部条

useShellFold 用 matchMedia + useSyncExternalStore 给出三档（SSR 快照 desktop）；isDetailPath /
backTargetOf 是纯函数：URL 里有选中项就显示内容并给「返回列表」，否则显示列表并把内容停在
hidden 容器（模态框路由的 Dialog 是 portal，照常弹出）。手机底部条：聊天 / 联系人 / 更多
（工具 + 个人资料 + 设置）。设置索引在折叠时不再自动跳 appearance，否则返回会死循环。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 收口——旧 URL 重定向、删除旧壳与旧页面、`ROUTES` 清理、e2e 改到新 URL、跑一次全部门禁

**Files:**
- Create: `src/app/routes/shell/legacy-redirect.tsx`
- Modify: `src/app/routes.ts`（删 `legacy-layout` 整段；加五条重定向）
- Modify: `src/lib/routes.ts`（删 `@deprecated` 旧键、`legacy`、`ChatTabRouteKey`、`CHAT_TAB_ROUTE_MAP`、`getChatTabFromPath`、`isRouteActive`、`SEGMENT_LABELS`、`getRouteBreadcrumbs`；`LEGACY_REDIRECTS` 最后一条改成字面量）
- Modify: `src/lib/__tests__/routes.test.ts`（钉 `ROUTES.app` 的键集合）
- Modify: `src/features/chat/store/chatStore.ts`（删 `TabType / activeTab / setActiveTab`）
- Modify: `src/features/webrtc/components/VideoMeeting.tsx:838`（`leaveMeeting` 回 `ROUTES.app.meeting`）
- Modify: `src/features/auth/store/__tests__/sessionHandoff.test.tsx`（`DesktopSidebar` → `Sidebar`）
- Modify: `src/components/shell/__tests__/Sidebar.test.tsx`（搬入 `Navigation.test.tsx` 的四条头像用例）
- Modify: `src/app/routes/__tests__/appShellRoutes.test.tsx`
- Modify: `tests/chat.spec.ts`（整份重写）、`tests/migration-regression.spec.ts`（路由清单 + 重定向用例）、`tests/device-matrix.spec.js`（加 `/app/contacts`）
- Delete: `src/components/layout/MainLayout.tsx`、`src/components/layout/app-shell/Navigation.tsx`、`src/components/layout/app-shell/__tests__/Navigation.test.tsx`、`src/features/chat/components/ChatPage.tsx`、`src/features/settings/components/SettingsPage.tsx`、`src/features/profile/components/ProfilePage.tsx`、`src/features/profile/components/__tests__/ProfilePage.test.tsx`、`src/app/routes/legacy-layout.tsx`、`src/app/routes/{chat,friends,groups,files,webrtc,devices,settings,profile,ai-chat}.tsx`
- Test: `src/app/routes/shell/__tests__/legacy-redirect.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `LEGACY_REDIRECTS / legacyRedirectTarget`；react-router 的 `redirect` 与 `LoaderFunctionArgs`（同 `src/app/routes/api.session.ts` 的写法）；Task 5/9 的 `Sidebar`；Task 10 的 DOM 约定（`sidebar / mobile-tab-bar / list-column / fold-back-bar`）；e2e 现有的登录方式（`page.request.post('/api/auth/login', { data: { user_id: 'e2e', password: 'correct-horse' } })`）与假后端（`tests/fixtures/fake-backend.ts`，未实现的路径回 404——`/api/bots`、`/api/miniapps/my` 就是这样，所以 e2e 不进这两个模态框）。
- Produces: `legacy-redirect.tsx` 的 `loader({ request }): Response`（命中表 → `redirect(target)`，302；没命中 → `throw new Response('Not Found', { status: 404 })`）；`ROUTES.app` 只剩 `chat / contacts / settings / profile / files / meeting / bots / miniapps / aiChat / videoMeeting` 十个键。

- [ ] **Step 1: 写失败的测试**

`src/app/routes/shell/__tests__/legacy-redirect.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { loader } from '../legacy-redirect'

const args = (path: string) => {
  const request = new Request(`http://localhost${path}`)
  return { request, params: {}, context: {} as never, url: new URL(request.url), pattern: '' }
}

describe('旧 URL 重定向 loader（spec §3 的表，逐条字面量）', () => {
  it.each([
    ['/app/friends', '/app/contacts'],
    ['/app/groups', '/app/contacts'],
    ['/app/webrtc', '/app/meeting'],
    ['/app/devices', '/app/settings/account'],
    ['/app/group-chat', '/app/chat'],
    ['/app/friends/anything', '/app/contacts'],
  ])('%s → 302 %s', (from, to) => {
    const res = loader(args(from))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(to)
  })

  it('不在表里的路径不重定向（抛 404），证明上面不是"什么都 302"', () => {
    expect(() => loader(args('/app/chat'))).toThrow()
    try { loader(args('/app/nope')) } catch (e) { expect((e as Response).status).toBe(404) }
  })
})
```

`src/lib/__tests__/routes.test.ts` 追加：

```ts
  it('旧键已删：ROUTES.app 只剩壳的十个键（字面量，不从 ROUTES 自己拼）', () => {
    expect(Object.keys(ROUTES.app).sort()).toEqual(['aiChat', 'bots', 'chat', 'contacts', 'files', 'meeting', 'miniapps', 'profile', 'settings', 'videoMeeting'])
    expect('legacy' in ROUTES).toBe(false)
  })
```

`src/app/routes/__tests__/appShellRoutes.test.tsx`：把第 5 步那条「正对照：旧页面这一步还在」的断言（`routes/friends.tsx@/app/friends`）改成新的正对照 `expect(flat).toContain('routes/video-meeting.tsx@/app/video-meeting')`，并追加：

```tsx
  it('legacy-layout 与九个旧路由模块都不再注册；五条旧 URL 指向 legacy-redirect', () => {
    const flat = flatten(routes as unknown as RouteEntry[])
    for (const old of ['routes/legacy-layout.tsx', 'routes/chat.tsx', 'routes/friends.tsx', 'routes/groups.tsx', 'routes/files.tsx', 'routes/webrtc.tsx', 'routes/devices.tsx', 'routes/settings.tsx', 'routes/profile.tsx', 'routes/ai-chat.tsx']) {
      expect(flat.some((x) => x.startsWith(`${old}@`))).toBe(false)
    }
    for (const path of ['/app/friends', '/app/groups', '/app/webrtc', '/app/devices', '/app/group-chat']) {
      expect(flat).toContain(`routes/shell/legacy-redirect.tsx@${path}`)
    }
  })
```

`src/components/shell/__tests__/Sidebar.test.tsx` 追加（`Navigation.test.tsx` 的四条头像用例搬家；文件顶部补 `import { vi } from 'vitest'`（并入既有那行）与 `import { useAuthStore } from '@/features/auth/store/authStore'`；`useAuthStore.setState({ user })` 的 `user` 至少给 `user_id / nickname / avatar_url`，其余字段按 `authStore` 的 `User` 类型补 `null`）：

```tsx
describe('Sidebar 的头像来源（原 Navigation.test.tsx）', () => {
  const avatar = () => screen.getByTestId('sidebar').querySelector('img')

  it('正对照：裸 <img src=""> 确实会让 React 打出空 src 警告', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<img src="" alt="" />)
    expect(err.mock.calls.some((c) => String(c[0]).includes('empty string'))).toBe(true)
    err.mockRestore()
  })

  it('profile 的头像是空串时不渲染 <img>，也不触发那句警告；首字母来自 profile 昵称', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    useProfileStore.setState({ profile: makeProfile({ user_nickname: '爱丽丝', user_avatar_url: '' }) })
    renderAt('/app/chat', 'chat')
    expect(avatar()).toBeNull()
    expect(screen.getByText('爱')).toBeInTheDocument()
    expect(err.mock.calls.some((c) => String(c[0]).includes('empty string'))).toBe(false)
    err.mockRestore()
  })

  it('profile 没有头像时回落到 authStore.user（相对路径补基址）', () => {
    useProfileStore.setState({ profile: null })
    useAuthStore.setState({ user: { user_id: 'bob', nickname: 'Bob', avatar_url: 'avatars/bob.png' } as never })
    renderAt('/app/chat', 'chat')
    expect(avatar()?.getAttribute('src')).toBe(`${window.location.origin}/avatars/bob.png`)
  })

  it('两个来源都没有头像时用 user 昵称首字母', () => {
    useProfileStore.setState({ profile: null })
    useAuthStore.setState({ user: { user_id: 'bob', nickname: 'bob', avatar_url: null } as never })
    renderAt('/app/chat', 'chat')
    expect(avatar()).toBeNull()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
```

`src/features/auth/store/__tests__/sessionHandoff.test.tsx`：`import { DesktopSidebar } from '@/components/layout/app-shell/Navigation'` 改成 `import { Sidebar } from '@/components/shell/Sidebar'`；`renderSidebar` 里的 `element: <DesktopSidebar />` 改成 `element: <Sidebar activeTab="chat" />`；`avatarImg` 改成 `() => document.querySelector('[data-testid="sidebar"] img')`；注释里的「Navigation」改成「Sidebar」（`last_visited_path` 现在由 `app-shell.tsx` 写）。断言一条不改。

- [ ] **Step 2: 运行确认失败**

Run: `bun run test src/app/routes src/lib/__tests__/routes.test.ts src/components/shell/__tests__/Sidebar.test.tsx src/features/auth/store/__tests__/sessionHandoff.test.tsx 2>&1 | tail -8`
Expected: FAIL（legacy-redirect 不存在；`ROUTES.app` 还有旧键；旧模块仍注册）。

- [ ] **Step 3: 重定向落地**

`src/app/routes/shell/legacy-redirect.tsx`：

```tsx
import { type LoaderFunctionArgs, redirect } from 'react-router'
import { legacyRedirectTarget } from '@/lib/routes'

/**
 * 旧 URL → 新 URL（spec §3 重定向表）。框架模式下 loader 在整页请求（服务端）与客户端导航（.data 请求）
 * 都会跑，两边都拿到 302；浏览器历史里是 replace 语义。表里没有的路径 404——这个模块只按表办事。
 */
export function loader({ request }: LoaderFunctionArgs): Response {
  const target = legacyRedirectTarget(new URL(request.url).pathname)
  if (!target) throw new Response('Not Found', { status: 404 })
  return redirect(target)
}

export default function LegacyRedirect() {
  return null
}
```

`src/app/routes.ts`：受保护段改成最终形态，并在它之后加五条重定向（不在 `protected-layout` 之下——目标页自己会做鉴权）：

```ts
  layout('routes/protected-layout.tsx', [
    layout('routes/app-shell.tsx', [
      route('app/chat', 'routes/shell/chat.tsx', [route(':conversationId', 'routes/shell/chat.$conversationId.tsx')]),
      route('app/contacts', 'routes/shell/contacts.tsx', [
        route('friends/:userId', 'routes/shell/contacts.friends.$userId.tsx'),
        route('groups/:groupId', 'routes/shell/contacts.groups.$groupId.tsx'),
      ]),
      route('app/settings', 'routes/shell/settings.tsx', [route(':section', 'routes/shell/settings.$section.tsx')]),
      route('app/profile', 'routes/shell/profile.tsx'),
      route('app/files', 'routes/shell/files.tsx'),
      route('app/meeting', 'routes/shell/meeting.tsx'),
      route('app/bots', 'routes/shell/bots.tsx'),
      route('app/miniapps', 'routes/shell/miniapps.tsx'),
      route('app/ai-chat', 'routes/shell/ai-chat.tsx'),
    ]),
    route('app/video-meeting', 'routes/video-meeting.tsx'),
  ]),
  // 旧 URL 重定向（spec §3）。同一模块注册五次必须各给 id（同 passthrough 的理由）
  route('app/friends', 'routes/shell/legacy-redirect.tsx', { id: 'legacy-friends' }),
  route('app/groups', 'routes/shell/legacy-redirect.tsx', { id: 'legacy-groups' }),
  route('app/webrtc', 'routes/shell/legacy-redirect.tsx', { id: 'legacy-webrtc' }),
  route('app/devices', 'routes/shell/legacy-redirect.tsx', { id: 'legacy-devices' }),
  route('app/group-chat', 'routes/shell/legacy-redirect.tsx', { id: 'legacy-group-chat' }),
```

Run: `bunx react-router typegen && bun run test src/app/routes 2>&1 | tail -6`（重定向用例绿；路由表用例里"旧模块不再注册"此时也绿，因为上面已把它们从表里拿掉——文件本身下一步删）。

```bash
git add src/app/routes/shell/legacy-redirect.tsx src/app/routes/shell/__tests__/legacy-redirect.test.ts src/app/routes.ts src/app/routes/__tests__/appShellRoutes.test.tsx
git commit -m "$(cat <<'EOF'
feat(routes): 旧 URL 重定向表落地——/app/friends|groups|webrtc|devices|group-chat 302 到新壳

legacy-redirect.tsx 的 loader 按 LEGACY_REDIRECTS 查表 redirect()，服务端整页请求与客户端
导航都拿 302；不在表里的路径 404。路由表收成最终形态：壳之下十条，legacy-layout 整段移除。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 删除旧壳、旧页面、旧键**

```bash
git rm -q src/components/layout/MainLayout.tsx src/components/layout/app-shell/Navigation.tsx src/components/layout/app-shell/__tests__/Navigation.test.tsx src/features/chat/components/ChatPage.tsx src/features/settings/components/SettingsPage.tsx src/features/profile/components/ProfilePage.tsx src/features/profile/components/__tests__/ProfilePage.test.tsx src/app/routes/legacy-layout.tsx src/app/routes/chat.tsx src/app/routes/friends.tsx src/app/routes/groups.tsx src/app/routes/files.tsx src/app/routes/webrtc.tsx src/app/routes/devices.tsx src/app/routes/settings.tsx src/app/routes/profile.tsx src/app/routes/ai-chat.tsx
```

`src/lib/routes.ts`：删掉 `ROUTES.app` 里六个 `@deprecated` 键与整个 `legacy: { groupChat }`；删掉 `ChatTabRouteKey`、`CHAT_TAB_ROUTE_MAP`、`getChatTabFromPath`、`isRouteActive`、`SEGMENT_LABELS`、`BreadcrumbLabelResolver`、`getRouteBreadcrumbs`（`grep -rn "getRouteBreadcrumbs\|isRouteActive\|getChatTabFromPath\|CHAT_TAB_ROUTE_MAP" src` 必须为空——它们的消费者只有刚删的 `Navigation.tsx` / `ChatPage.tsx`）；`LEGACY_REDIRECTS` 最后一条改成 `['/app/group-chat', ROUTES.app.chat]`。`DEFAULT_UNAUTHENTICATED_ROUTE` **保留**（`ProtectedRoute` / `DevicesPage` 在用）。

`src/features/chat/store/chatStore.ts`：删 `export type TabType`、接口里的 `activeTab / setActiveTab`、初始值里的两行（消费者只有刚删的 `ChatPage`；`SettingsModal / ProfileModal / GroupManagement / DownloadsPage` 里的 `activeTab` 是各自的本地 state，不动）。

`src/features/webrtc/components/VideoMeeting.tsx:838`：`router.push(ROUTES.app.chatWebrtc)` → `router.push(ROUTES.app.meeting)`（离开会议回到会议模态框，与旧行为"回 webrtc 面板"同义）。

`src/app/routes/shell/legacy-redirect.tsx` 不依赖旧键；`src/i18n/messages.ts` 里只剩旧页面在用的文案 key（`settings.*`、`nav.*` 等）**不删**——无害，第 2 期改设置时一起清。

Run: `bunx tsc --noEmit`（此时应只剩 `sessionHandoff.test.tsx` 与 `Sidebar.test.tsx` 那两处；按 Step 1 改完再跑一次到 0）；`bun run test 2>&1 | grep -E "Test Files|Tests "`。

```bash
git add -u src/lib/routes.ts src/lib/__tests__/routes.test.ts src/features/chat/store/chatStore.ts src/features/webrtc/components/VideoMeeting.tsx src/features/auth/store/__tests__/sessionHandoff.test.tsx src/components/shell/__tests__/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
refactor(shell): 删除 MainLayout / Navigation / ChatPage / SettingsPage / ProfilePage 与九个旧路由模块

旧壳与旧分页路由的最后消费者已全部搬进新壳，整段删除；ROUTES 旧键、CHAT_TAB_ROUTE_MAP、
getChatTabFromPath、面包屑与 isRouteActive 随之删除，chatStore 的 activeTab 删除。Navigation
的头像用例搬到 Sidebar.test，sessionHandoff 用例改渲染 Sidebar。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: e2e 改到新 URL**

`tests/chat.spec.ts` 整份替换（`beforeEach` 登录段与 `/api/friends|requests|groups` 的 `page.route` 数据段原样保留——下面用 `…` 标出的就是原文件里那几段，逐字复制）：

```ts
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

// 新壳（spec §3/§5）：/app/chat 的列表栏是统一会话列表，一个好友一张卡片；点击 → /app/chat/f-<id>。
// 桌面（chromium）三栏；mobile 项目（Pixel 7，412px）是底部条 + 二选一（spec §3 折叠）。
const mockListEndpoints = async (page: import('@playwright/test').Page, friends: unknown[], groups: unknown[]) => {
  await page.route('**/api/friends', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 200, data: friends }) }))
  await page.route('**/api/friends/requests/pending', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) }))
  await page.route('**/api/friends/requests/sent', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) }))
  await page.route('**/api/groups/my', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: groups }) }))
  await page.route('**/api/groups/invites/my', (route) => route.fulfill({ status: 200, body: JSON.stringify({ success: true, code: 200, data: [] }) }))
}

const ALICE_BOB = [
  … 原文件 'should load chat page' 用例里 /api/friends 的两条 FriendDto（friend_1 Alice、friend_2 Bob）原样 …
]
const TEST_GROUP = [
  … 原文件 'should switch between tabs' 用例里 /api/groups/my 的那条 MyGroup（g1 Test Group）原样 …
]

test.describe('Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    … 原文件的 beforeEach 原样（page.request.post 登录 + expect(login.ok())）…
  })

  test('统一会话列表：好友成卡片，点击进入 /app/chat/f-<id>', async ({ page }, testInfo) => {
    await mockListEndpoints(page, ALICE_BOB, [])
    const friendsPromise = page.waitForResponse((r) => r.url().includes('/api/friends') && r.status() === 200)
    await page.goto(`${BASE_URL}/app/chat`)
    await friendsPromise
    await expect(page).toHaveURL(/\/app\/chat$/)

    const list = page.getByTestId('list-column')
    await expect(list.getByText('Alice')).toBeVisible()
    await expect(list.getByText('Bob')).toBeVisible()

    const isMobile = testInfo.project.name === 'mobile'
    if (!isMobile) await expect(page.getByText('选择一个会话开始聊天')).toBeVisible()

    await list.getByText('Alice').click()
    await expect(page).toHaveURL(/\/app\/chat\/f-friend_1$/)

    if (isMobile) {
      // 折叠：列表让位给内容，顶部返回条带会话名，返回回到列表
      await expect(page.getByTestId('list-column')).toHaveCount(0)
      await expect(page.getByTestId('fold-back-bar')).toContainText('Alice')
      await page.getByRole('link', { name: '返回列表' }).click()
      await expect(page).toHaveURL(/\/app\/chat$/)
      await expect(page.getByTestId('list-column').getByText('Alice')).toBeVisible()
    } else {
      await expect(page.getByText('选择一个会话开始聊天')).not.toBeVisible()
      // 聊天窗口头部出现 Alice（列表卡片里也有一个，取可见的第二处：内容区）
      await expect(page.getByTestId('content-column').getByText('Alice').first()).toBeVisible()
    }
  })

  test('空列表：后端真的回了空数组，界面给空态而不是解析失败', async ({ page }) => {
    … 原文件 'should handle empty friends list' 里 shapeErrors 的 page.on('console') 段原样 …
    await mockListEndpoints(page, [], [])
    const friendsPromise = page.waitForResponse((r) => r.url().includes('/api/friends') && r.status() === 200)
    await page.goto(`${BASE_URL}/app/chat`)
    await friendsPromise
    await expect(page.getByText(/还没有会话/)).toBeVisible()
    expect(shapeErrors).toEqual([])
  })

  test('联系人栏的群 tab 与「更多」里的我的文件模态框', async ({ page }, testInfo) => {
    await mockListEndpoints(page, [], TEST_GROUP)
    const groupsPromise = page.waitForResponse((r) => r.url().includes('/api/groups/my') && r.status() === 200)
    await page.goto(`${BASE_URL}/app/chat`)
    await groupsPromise

    const isMobile = testInfo.project.name === 'mobile'
    const nav = page.getByTestId(isMobile ? 'mobile-tab-bar' : 'sidebar')
    await nav.getByRole('link', { name: '联系人' }).click()
    await expect(page).toHaveURL(/\/app\/contacts$/)
    await page.getByRole('button', { name: '群', exact: true }).click()
    await expect(page.getByTestId('list-column').getByText('Test Group')).toBeVisible()

    await nav.getByRole('button', { name: '更多功能' }).click()
    await page.getByRole('link', { name: '我的文件' }).click()
    await expect(page).toHaveURL(/\/app\/files$/)
    // 按可访问名取：桌面上侧栏「更多」面板也是 role=dialog（aria-label 更多功能），退场动画期间会短暂并存
    await expect(page.getByRole('dialog', { name: '我的文件' })).toBeVisible()
  })
})
```

`tests/migration-regression.spec.ts`：`PROTECTED_ROUTES` 换成

```ts
const PROTECTED_ROUTES = [
  ROUTES.app.chat, ROUTES.app.contacts, ROUTES.app.settings, ROUTES.app.profile, ROUTES.app.files,
  ROUTES.app.meeting, ROUTES.app.bots, ROUTES.app.miniapps, ROUTES.app.aiChat, ROUTES.app.videoMeeting,
]
```

顶部注释里关于 `chatFriends/friends 重复别名`、`ROUTES.legacy.groupChat 不可达` 的两段删掉，并追加一个 describe（字面量表——这条钉的是"旧 URL 到底去了哪"，不从 `LEGACY_REDIRECTS` 拼）：

```ts
test.describe('旧 URL 重定向（spec §3）', () => {
  for (const [from, to] of [
    ['/app/friends', '/app/contacts'],
    ['/app/groups', '/app/contacts'],
    ['/app/webrtc', '/app/meeting'],
    ['/app/devices', '/app/settings/account'],
    ['/app/group-chat', '/app/chat'],
  ] as const) {
    test(`${from} → 302 ${to}`, async ({ request }) => {
      const res = await request.get(from, { maxRedirects: 0 })
      expect(res.status()).toBe(302)
      expect(res.headers().location).toBe(to)
    })
  }
})
```

`tests/device-matrix.spec.js` 的 `pages` 里加 `{ name: 'Contacts', path: '/app/contacts', requiresAuth: true }`。

`tests/bff-session.spec.ts` 不改：它只看 URL 与请求头，`/app/chat`、`/app/profile` 都还在。

- [ ] **Step 6: 全部门禁 + e2e（本期唯一一次）**

Run: `bunx tsc --noEmit && bun run lint 2>&1 | tail -3 && bun run test 2>&1 | grep -E "Test Files|Tests " && bun --bun run build 2>&1 | tail -3`
Run: `bun run test:e2e 2>&1 | tail -30`（chromium + mobile + production 三个 project 全绿；`device-matrix` 8 台 × 5 页；结果原样贴进报告，红了先修再重跑，两次结果都记）。

冒烟（生产构建）：`bun run start` 起生产服务，`curl -sI http://localhost:3000/app/friends | grep -i "^HTTP\|^location"` 看到 `302` 与 `/app/contacts`；浏览器访问 `/app/devices` 落到 `/app/settings/account`。

- [ ] **Step 7: 变异验证**

| 变异 | 期望 |
|---|---|
| `legacy-redirect.loader` 恒 `redirect('/app/chat')` | 「/app/friends → /app/contacts」红 |
| `legacy-redirect.loader` 没命中也 302 | 「不在表里的路径不重定向」红 |
| `routes.ts` 忘删 `legacy-layout` 段 | 路由表用例「不再注册」红 |
| `ROUTES.app` 留一个 `devices` | routes.test 键集合红 |
| `Sidebar` 头像不回落 `user.avatar_url` | 「回落到 authStore.user」红 |
| e2e：`ConversationCard` 点击不导航 | chat.spec 第一条红 |

- [ ] **Step 8: 提交**

```bash
git add tests/chat.spec.ts tests/migration-regression.spec.ts tests/device-matrix.spec.js
git commit -m "$(cat <<'EOF'
test(e2e): 三份 e2e 改到新壳——统一会话列表、联系人栏、模态框、旧 URL 302

chat.spec：好友成卡片、点击进 /app/chat/f-<id>（mobile 项目验折叠的返回条）、空态、联系人群 tab
与「更多 → 我的文件」模态框；migration-regression：受保护路由清单换成壳的十条，加五条旧 URL
302 断言；device-matrix 加 /app/contacts。

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
)"
```

---

## 自检记录（writing-plans self-review）

- **Spec 覆盖**：§3 URL 表（Task 5/6/7/8）、重定向（Task 11）、折叠三档（Task 10）；§4 token（Task 1）；§5 壳组件（Task 4/5）、拖拽钉住（Task 9）；§6 数据（Task 3）；§7 联系人（Task 6）；§8 设置（Task 7，`ai` 第五分区为裁决）；§9 模态框与 AI 工具页（Task 8）；§10 删除（Task 11）；§11 测试纪律贯穿每个任务；§13 后续期接口——`SIDEBAR_TOOLS` 注册表、`SETTINGS_SECTION_META` 注册表、`RouteDialog`、`UnifiedConversation` 类型都是可加条目的形状。
- **偏离 spec 的裁决**（执行时记账本）：设置多一个 `ai` 分区（Task 2/7）；`DevicesPage` 以 `embedded` 模式保留而不是删除（Task 7/11）；手机端有选中项时底部条让位（Task 10）；`ChatWindow` 在 <768 隐藏自身头部，通话/群信息按钮手机上暂不可达（Task 10，第 7 期补）；离开会议回 `/app/meeting`（Task 11）。
- **占位扫描**：Task 11 的 `tests/chat.spec.ts` 里三处 `…` 是"逐字复制原文件对应段落"的指令（数据 fixture 与登录段），不是待填内容。
- **类型一致性**：`Sidebar({ activeTab })` 的联合类型在 Task 7 扩成三值、Task 9 去掉 `pinnedTools`；`AppShell` 同步；`ShellTab` 定义在 Task 8 的 `shellTab.ts`，Task 10 消费；`SIDEBAR_TOOLS_BY_KEY` 在 Task 9 定义、Task 9/10 消费；`ListLoading / ListError / ListEmpty` 的 props 与 Task 4 一致；`legacyRedirectTarget` 与 Task 2 一致。

## 上线记录

**2026-09-11 上线，写实测数字，不写「通过」。**

- **执行**：subagent-driven，11 个任务各 1 轮修复后评审通过；整分支终审（opus）9 条 Important 一次修复波（`c38578a`）全部解决，复审无新问题。计划原文被评审推翻并裁决改写的地方：`pinnedStore` 改走 `sessionScopedLocalStorage`；`friendsStore/groupStore` 加 `hasLoaded`（深链冷启动原逻辑立刻 replace 回列表）；侧栏与底部条的 tab 从 `NavLink` 改 `Link`、`aria-current` 由 `activeTab` 决定；`useShellTab` 用 `useHydrated` 门控；`ChatHeader` 隐藏断点 `md → lg`；音量滑块按 0..1 写入；主题三选一改原生 radio（仓内不再有 `biome-ignore`）；圆角有精确 token 别名必须用别名。
- **门禁（最终版本 `c38578a`）**：`tsc` 0 错；lint 158 warnings / 22 infos（基线 163 / 22）；vitest **79 文件 / 1037 用例**全绿（起点 48 / 912）；`bun --bun run build` 通过；e2e **200 passed（chromium 81 / mobile 81 / production 38）**，5.9 分钟。e2e 首跑 6 败——沙箱浏览器 `navigator.language=en-US` 渲染英文，`chat.spec.ts` 改成双语正则后全绿。
- **合入**：origin/main 与 origin/dev 从 `be4b40f` 快进到 `c38578a`（24 个提交，131 文件，+10127 / −3181）；分支线性，未做合并提交。
- **部署**：alice `git -C huanvae-frontend pull --ff-only`（`fb5fc7b → c38578a`），`docker compose --project-directory huanvae-frontend build app`（host 网络 override 仍在，`bun install` / `bun run build` 均正常），`up -d app` 后 `huanvae-frontend-app-1` 2 分钟内 `healthy`，edge 容器未动。
- **线上 curl（从 Mac）**：
  1. `GET /app/friends` → **302** `location: /app/contacts`；`GET /app/devices` → **302** `location: /app/settings/account`
  2. `GET /app/chat` → **200**；`GET /app/contacts` → **200**
  3. 线上 CSS `assets/globals-Bt0cW5UI.css` 含 `--primary:#0956c6`（浅）/ `--primary:#3c83f7`（深）/ `--bg-primary:#06080c`（深）——APP token 已生效
  4. `/app/login` 页面里 `api.huanvae.cn` 出现次数 **0**
- **未做 / 遗留**：owner 浏览器验证（登录后三栏、拖拽钉住、折叠）待 owner；spec §8 的「开源许可」与「修改密码进账户分区」计划未纳入，排第 2 期；28 条延后 Minor 与 12 条裁决在 `.superpowers/sdd/2026-09-10-app-shell-alignment/progress.md`（git 忽略，看完可删）；`?add=create-group` 已改成只弹建群对话框，第 2 期抽 `CreateGroupDialog`；群会话经 URL 进入未复刻成员 / 公告加载，第 3 期开群信息 UI 前必须补；本机主检出的 `main` 仍在旧位置，需 `git pull`。
