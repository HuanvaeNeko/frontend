# 阶段 1：Next.js → React Router 8 + Vite 8 + Bun 构建迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `huanvae/frontend` 从 Next.js 16 静态导出迁移到 React Router 8 framework mode + Vite 8 + Bun，部署形态从 Cloudflare Pages 改为 VPS 上的 Docker Compose + Cloudflare Tunnel，业务逻辑与视觉零改动。

**Architecture:** 保留 `src/` 目录布局，把 RR8 的 `appDirectory` 指向现有 `src/app/`，使 145 个非路由文件目录结构零改动。`next/navigation`、`next/link`、`next/dynamic` 三个 API 用 shim 适配，34 个调用文件只做机械 import 替换。渲染采用 `ssr: true` + 全客户端取数（SSR 只出 HTML 外壳）。

**Tech Stack:** React Router 8.3.1（framework mode）、Vite 8.2.2（Rolldown 内核）、Bun 1.3.14、Biome 2.5.12、Vitest 5.0.0、Serwist 9.5.12、Sentry 10.73、Docker Compose + cloudflared

**Spec:** [`docs/superpowers/specs/2026-09-04-rr8-vite-bun-migration-design.md`](../specs/2026-09-04-rr8-vite-bun-migration-design.md)

## Global Constraints

以下约束适用于**每一个** task，不再逐条重复：

- **版本下限**（已逐条核实 peer 兼容性，不得降级）：`react-router` `^8.3.1`、`@react-router/dev` `^8.3.1`、`@react-router/node` `^8.3.1`、`vite` `^8.2.2`、`@vitejs/plugin-react` `^6.1.1`（其 peer 只接受 `vite ^8`，用 4.x/5.x 会冲突）、`@tailwindcss/vite` `^4.3.3`、`@biomejs/biome` `^2.5.12`、`vitest` `^5.0.0`、`@serwist/vite` `^9.5.12`
- **URL 不得变化**：`src/lib/routes.ts` 是迁移正确性的锚点，其中每一个 URL 字符串在迁移前后必须完全一致。该文件本身不得修改。
- **业务逻辑零改动**：`src/features/`、`src/components/`、`src/store/`、`src/hooks/`、`src/api/`、`src/i18n/`、`src/styles/` 下的文件，除机械替换 import 路径外不得有任何逻辑变更。唯一例外是 `src/components/ui/sonner.tsx`（Task 6 Step 12，修既存缺陷）。
- **`console.error` / `console.warn` 必须在生产产物中保留**，只剥离 `console.log`。它们是线上排障的唯一手段。
- **`src/lib/` 下的 shim 不得命名为 `next-compat` 或任何暗示"仍是 Next"的名字。**
- **Biome formatter 全程保持禁用。** 格式化是阶段 1 之后的独立 commit。
- **提交信息用中文，遵循 Conventional Commits**（与现有 git history 一致，参考 `fix(service-worker): ...`）。
- 每个 task 结束时 `bun run typecheck` 必须零错误（Task 1、2 除外，那时尚未切换）。

---

## 文件结构

**新建：**

| 文件 | 职责 |
|---|---|
| `playwright.config.ts` | Playwright 配置（当前缺失，e2e 跑不起来） |
| `biome.json` | Lint 配置，取代 `eslint.config.mjs` |
| `vitest.config.ts` | 单测配置（仅覆盖 shim） |
| `vitest.setup.ts` | 单测 DOM 环境注册 |
| `react-router.config.ts` | RR8 配置：`appDirectory: 'src/app'`、`ssr: true` |
| `vite.config.ts` | Vite 8 配置：RR8 插件、React 插件、Tailwind 插件、Serwist、console 剥离 |
| `src/lib/useHydrated.ts` | 水合守卫 hook，`dynamic` 与 `ClientOnly` 的基础 |
| `src/lib/navigation.ts` | `next/navigation` 的 RR8 适配（`useRouter`/`usePathname`/`useSearchParams`/`useParams`） |
| `src/lib/dynamic.tsx` | `next/dynamic` 的 RR8 适配（`React.lazy` + 水合守卫） |
| `src/components/common/AppLink.tsx` | `next/link` 的 RR8 适配（接受 `href` 而非 `to`） |
| `src/app/root.tsx` | HTML 外壳、meta、links、providers、ErrorBoundary（含 404） |
| `src/app/routes.ts` | RR8 路由配置（20 条路由的显式声明） |
| `src/app/entry.client.tsx` | 客户端 hydration 入口 + Sentry 客户端初始化 |
| `src/app/entry.server.tsx` | 服务端渲染入口 |
| `src/app/routes/*.tsx` | 20 个路由模块（见 Task 6） |
| `src/data/index.ts` | 数据访问抽象层（阶段 2 接缝） |
| `server/index.ts` | Bun HTTP server：静态资源、响应头、尾斜杠重定向、`/healthz` |
| `Dockerfile` | 多阶段构建（oven/bun） |
| `docker-compose.yml` | app + cloudflared，预留 pg/redis |
| `.env.example` | 环境变量模板（不含真实值） |

**修改：**

| 文件 | 改动 |
|---|---|
| `package.json` | 依赖增删、scripts 重写、overrides 迁移 |
| `tsconfig.json` | 移除 Next plugin 与 `.next/types`，加入 RR8 typegen 产物 |
| `src/app/sw.ts` | Serwist import 路径、预缓存过滤模式 |
| `src/lib/apiConfig.ts` | `process.env.NEXT_PUBLIC_*` → `import.meta.env.VITE_*` |
| `src/lib/version.ts` | 同上 |
| `src/config/sentry.ts` | `@sentry/nextjs` → `@sentry/react-router` |
| `src/components/ui/sonner.tsx` | 去 `next-themes`，改读 `settingsStore`（修既存缺陷） |
| 34 个文件 | 仅 import 路径机械替换（`next/navigation` → `@/lib/navigation` 等） |
| `.gitignore` | 移除 `next-env.d.ts`，加入 `.react-router/` |

**删除：** `next.config.js`、`next-env.d.ts`、`serwist.config.js`、`eslint.config.mjs`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`public/_headers`、`src/app/providers.tsx`（并入 `root.tsx`）、`src/app/serwist.tsx`、`src/app/layout.tsx`、`src/app/not-found.tsx`、所有 `src/app/**/page.tsx` 与 `layout.tsx`、`.next/`、`out/`、`.pnpm-store/`

---

## Task 1: Playwright 基线

**为什么第一个做**：现有 `tests/` 有两个 spec 文件、`@playwright/test` 也在 devDependencies 里，但**仓库根目录没有 `playwright.config.ts`** —— e2e 当前根本跑不起来。不先建立这张安全网，后面 169 个文件的迁移就没有行为等价性的判据。

**Files:**
- Create: `playwright.config.ts`
- Test: `tests/chat.spec.ts`（现有）、`tests/device-matrix.spec.js`（现有）

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `bun run test:e2e` / `npx playwright test`；基线测试结果记录，供 Task 6 之后比对

- [ ] **Step 1: 检查现有测试内容，确认它们期望的 baseURL 与启动方式**

```bash
cat tests/chat.spec.ts
cat tests/device-matrix.spec.js
grep -rn "goto\|baseURL\|localhost" tests/
```

记录：测试访问哪些路径、是否假设某个端口。

- [ ] **Step 2: 写 playwright.config.ts**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

> `webServer.command` 现在是 `npm run dev`（Next）。Task 3 换 Bun 后改成 `bun run dev`，Task 6 之后仍是 `bun run dev`（届时是 Vite）。命令名不变，所以这里只需改一次。

- [ ] **Step 3: 运行基线测试**

Run: `npx playwright test`
Expected: 全部通过。**若有失败，先修到全绿再继续** —— 基线不绿则后续无从比对。若某个用例本身是坏的（依赖已删除的页面等），删掉它并在 commit message 中说明原因。

- [ ] **Step 4: 把基线结果存档**

```bash
npx playwright test --reporter=json > /tmp/baseline-e2e.json 2>&1 || true
grep -c '"status":"passed"' /tmp/baseline-e2e.json
```

把通过数量记在 commit message 里，Task 6 之后要对上同一个数字。

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts tests/
git commit -m "test: 补充 playwright 配置，建立迁移前 e2e 基线

仓库此前有 tests/ 与 @playwright/test 依赖但缺 playwright.config.ts，
e2e 实际无法运行。补齐配置作为框架迁移的行为等价性判据。

基线通过用例数：<填入实际数字>"
```

---

## Task 2: 技术骨架验证（spike，产物抛弃）

**为什么必须独立存在**：Vite 8 是 Rolldown 换代版本。`@serwist/vite` 对它的兼容性只有一个开放区间 peer（`vite: ">=5.0.0"`）作依据 —— 声明兼容不等于测过 Rolldown。`@sentry/react-router` 对 RR **8** 的支持同样未经确证（其文档主要针对 v7）。在动 169 个文件**之前**花半天验证，换的是不会在迁移做到 80% 时被迫推倒重来。

**这个 task 的产物是一份决策记录，不是代码。** 骨架建在仓库外的临时目录，验证完删除。

**Files:**
- Create: `/tmp/rr8-spike/`（临时，验证后删除）
- Create: `docs/superpowers/specs/2026-09-04-spike-findings.md`（决策记录，保留）

**Interfaces:**
- Consumes: 无
- Produces: 三个决策 —— ①Serwist 是否可用（否则改 `vite-plugin-pwa@1.3.0`）②Sentry 用哪个包 ③console 剥离用哪种写法。Task 6/8/9 依赖这三个结论。

- [ ] **Step 1: 建最小 RR8 + Vite 8 骨架**

```bash
mkdir -p /tmp/rr8-spike && cd /tmp/rr8-spike
bun init -y
bun add react@^19.2.4 react-dom@^19.2.4 react-router@^8.3.1
bun add -d @react-router/dev@^8.3.1 @react-router/node@^8.3.1 vite@^8.2.2 @vitejs/plugin-react@^6.1.1 typescript@^5.9.3
```

- [ ] **Step 2: 验证①—— Vite 8 + RR8 + plugin-react@6 能起 dev server 并 SSR 出页面**

写最小 `react-router.config.ts`（`ssr: true`）、`vite.config.ts`、`app/root.tsx`、`app/routes.ts`、一个 index 路由，然后：

```bash
bun run react-router dev
curl -s http://localhost:5173/ | grep -q "<div id=\"root\"\|data-reactroot\|<!DOCTYPE" && echo "SSR OK" || echo "SSR FAIL"
```

Expected: dev server 启动无 peer 警告；`curl` 返回的 HTML 中含服务端渲染的内容（不是空壳）。

- [ ] **Step 3: 验证②—— `@serwist/vite` 能在 Vite 8 下构建出可注册的 SW**

```bash
bun add -d @serwist/vite@^9.5.12 serwist@^9.5.6
```

在 `vite.config.ts` 挂上 Serwist 插件，写一个最小 `app/sw.ts`，然后：

```bash
bun run react-router build
ls -la build/client/sw.js && echo "SW 构建 OK" || echo "SW 构建 FAIL"
```

Expected: 产出 `sw.js`。**若构建报错或插件与 Rolldown 不兼容，记录错误信息，结论改为 `vite-plugin-pwa@1.3.0`（`injectManifest` 模式）**，并在决策记录中写明 `sw.ts` 需要如何调整。

- [ ] **Step 4: 验证③—— `@sentry/react-router` 能在 RR8 下初始化**

```bash
bun add @sentry/react-router@^10.73
```

在 `app/entry.client.tsx` 里 `Sentry.init({ dsn: '' })`，启动 dev server，确认无运行时报错、无 peer 冲突。

Expected: 初始化成功。**若报 RR8 不兼容，结论改为 `@sentry/react`（浏览器）+ `@sentry/node`（服务端）手工接线**，功能等价，只是少了自动路由 instrumentation。

- [ ] **Step 5: 验证④—— console 剥离的可行写法**

目标行为：生产构建移除 `console.log`，**保留 `console.error` 和 `console.warn`**。

在骨架里放一段同时含三种调用的代码，依次尝试并 grep 产物：

```bash
# 方案 A：Vite 8 的 oxc 配置项（查 rolldown TransformOptions 当前签名）
# 方案 B（保底）：terser
bun add -d terser
# vite.config.ts: build: { minify: 'terser', terserOptions: { compress: { pure_funcs: ['console.log'] } } }
bun run react-router build
grep -c "console.log" build/client/assets/*.js   # 期望 0
grep -c "console.error" build/client/assets/*.js # 期望 >0
```

Expected: 找到一种能**精确**保留 error/warn 的写法。若方案 A 做不到精确保留，直接采用方案 B —— 不要为了少一个依赖而牺牲 error/warn。

- [ ] **Step 6: 写决策记录**

创建 `docs/superpowers/specs/2026-09-04-spike-findings.md`，逐条写明四个验证的结论、实际用的版本号、遇到的错误原文（如有）、以及对 Task 6/8/9 的具体影响。**不要写"基本可用"这类模糊结论 —— 写明"用 X 包 + Y 配置，已验证产出 Z"。**

- [ ] **Step 7: 删除骨架，提交决策记录**

```bash
rm -rf /tmp/rr8-spike
git add docs/superpowers/specs/2026-09-04-spike-findings.md
git commit -m "docs: 记录 Vite 8 技术栈骨架验证结论

验证 Vite 8 + RR8 + plugin-react@6 / @serwist/vite / @sentry/react-router
/ console 剥离四项，为迁移锁定具体方案。骨架产物已丢弃。"
```

---

## Task 3: pnpm → Bun

**为什么在切框架之前做**：包管理器切换与框架无关，此时 Next 仍在，`bun run dev` / `build` / `test:e2e` 都能验证。单独做一次，Task 6 的 diff 里就不会混入 lockfile 噪音。

**Files:**
- Modify: `package.json`
- Create: `bun.lock`（`bun install` 生成）
- Delete: `pnpm-lock.yaml`、`pnpm-workspace.yaml`、`.pnpm-store/`

**Interfaces:**
- Consumes: 无
- Produces: `bun run <script>` 可用；`overrides` 安全约束已迁移

- [ ] **Step 1: 确认现有 pnpm overrides 的内容**

```bash
node -e "console.log(JSON.stringify(require('./package.json').pnpm, null, 2))"
```

Expected 输出：
```json
{
  "overrides": {
    "minimatch": "^10.2.1",
    "ajv@^6": "^6.14.0",
    "ajv@^8": "^8.18.0"
  }
}
```

**这三条是有意的安全升级，绝对不能丢。**

- [ ] **Step 2: 把 overrides 迁到 Bun 的等价字段**

Bun 读 `package.json` 顶层的 `overrides`（npm 兼容格式）。pnpm 的 `pkg@range` 选择器语法 Bun 不支持，需要降级为无条件覆盖：

编辑 `package.json`：删除 `packageManager` 与 `pnpm` 字段，新增：

```json
"overrides": {
  "minimatch": "^10.2.1",
  "ajv": "^8.18.0"
}
```

> `ajv@^6` → `^6.14.0` 和 `ajv@^8` → `^8.18.0` 两条合并为单条 `ajv: ^8.18.0`。**这是行为变化**：原本 ajv 6.x 的依赖方会被升到 6.14.0，现在会被强制升到 8.x。Step 4 必须验证没有依赖因此报错；若有，改为只保留 `minimatch` 并在 commit message 中记录 ajv 覆盖已失效、需另行处理。

- [ ] **Step 3: 删旧 lockfile，用 Bun 重装**

```bash
rm -rf pnpm-lock.yaml pnpm-workspace.yaml .pnpm-store node_modules
bun install
```

Expected: 生成 `bun.lock`，无 unmet peer 报错。

- [ ] **Step 4: 验证三条命令仍工作**

```bash
bun run lint
bun run build
bun run dev &  # 另开终端
sleep 15 && curl -sI http://localhost:3000/ | head -1
```

Expected: lint 通过；`next build && serwist build` 成功；dev server 返回 `HTTP/1.1 200`。

- [ ] **Step 5: 跑 e2e 确认基线未被破坏**

Run: `npx playwright test`
Expected: 通过数量与 Task 1 Step 4 记录的一致。

- [ ] **Step 6: 更新 playwright.config.ts 的 webServer 命令**

把 `command: 'npm run dev'` 改为 `command: 'bun run dev'`。

- [ ] **Step 7: 提交**

```bash
git add package.json bun.lock playwright.config.ts
git rm --cached pnpm-lock.yaml pnpm-workspace.yaml 2>/dev/null || true
git add -A
git commit -m "build: 包管理器从 pnpm 切换到 bun

- pnpm.overrides 迁移到顶层 overrides；pnpm 的 pkg@range 选择器语法
  Bun 不支持，ajv 两条合并为单条 ^8.18.0
- 删除 pnpm-lock.yaml / pnpm-workspace.yaml / .pnpm-store
- e2e 基线通过数不变

此时仍在 Next.js 上，仅换包管理器。"
```

---

## Task 4: ESLint → Biome

**为什么在切框架之前做**：与框架无关，此时可独立验证 lint 行为等价。放在 Task 6 里会让那个已经很大的 diff 更难评审。

**Files:**
- Create: `biome.json`
- Modify: `package.json`（scripts + devDependencies）
- Delete: `eslint.config.mjs`

**Interfaces:**
- Consumes: 无
- Produces: `bun run lint` 由 Biome 驱动；4 条规则映射生效

- [ ] **Step 1: 记录 ESLint 当前的告警基线**

```bash
bun run lint 2>&1 | tail -30
bun run lint 2>&1 | grep -c "warning" || echo 0
```

记下 warning 数量与主要类型，Step 5 要比对。

- [ ] **Step 2: 装 Biome，卸 ESLint 全栈**

```bash
bun add -d @biomejs/biome@^2.5.12
bun remove eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals
rm eslint.config.mjs
```

- [ ] **Step 3: 写 biome.json**

四条规则映射已比对 Biome `configuration_schema.json` 核实：`useHookAtTopLevel`、`useExhaustiveDependencies`、`noUnusedVariables` + `noUnusedFunctionParameters` 在 `correctness`；`noExplicitAny` 在 `suspicious`。

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.12/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": [
      "**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs",
      "!**/node_modules/**", "!.next/**", "!out/**", "!build/**",
      "!.history/**", "!public/**", "!scripts/**", "!.react-router/**"
    ]
  },
  "formatter": { "enabled": false },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "useHookAtTopLevel": "error",
        "useExhaustiveDependencies": "warn",
        "noUnusedVariables": "warn",
        "noUnusedFunctionParameters": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  }
}
```

> **`formatter.enabled` 必须是 `false`。** 本项目没有 Prettier，风格是历史自然形成的；开启格式化会重排 169 个文件，把迁移的真实改动彻底淹没。格式化是阶段 1 合并之后的独立 commit。

- [ ] **Step 4: 更新 package.json scripts**

```json
"lint": "biome lint .",
"lint:fix": "biome lint --write ."
```

- [ ] **Step 5: 跑 lint 并比对基线**

Run: `bun run lint`
Expected: 零 error。warning 数量可能与 ESLint 不同（Biome 的 `recommended` 集合更大），这是正常的 —— **但必须逐条看一遍新增的 warning，确认没有真实缺陷被暴露又被忽略**。若某类 warning 噪音过大且无价值，在 `biome.json` 里显式关掉并注明原因。

- [ ] **Step 6: 验证 `_` 前缀忽略行为**

原 ESLint 配置用 `argsIgnorePattern: "^_"` / `varsIgnorePattern: "^_"`。Biome 的 `ignore` 取标识符名数组而非正则，**不是自动等价**。写一个临时文件验证：

```bash
cat > /tmp/biome-probe.ts <<'EOF'
export function f(_unused: string, used: number) { return used }
const _alsoUnused = 1
export const x = 2
EOF
bunx biome lint /tmp/biome-probe.ts
```

Expected: `_unused` 与 `_alsoUnused` **不报** unused。若报了，在 `biome.json` 的 `noUnusedVariables` 上加 `options.ignore`，把实际用到的下划线标识符列进去（先 `grep -rn "\b_[a-zA-Z]" src/` 收集）。清理探针：`rm /tmp/biome-probe.ts`

- [ ] **Step 7: 提交**

```bash
git add biome.json package.json bun.lock
git rm eslint.config.mjs
git commit -m "build: lint 从 ESLint 全栈换到 Biome

5 个包（eslint / @eslint/js / typescript-eslint /
eslint-plugin-react-hooks / globals）换成 1 个 Rust 二进制。

4 条现有规则映射已核实：
- react-hooks/rules-of-hooks    → correctness/useHookAtTopLevel
- react-hooks/exhaustive-deps   → correctness/useExhaustiveDependencies
- @typescript-eslint/no-unused-vars → correctness/noUnusedVariables
                                     + noUnusedFunctionParameters
- @typescript-eslint/no-explicit-any → suspicious/noExplicitAny

formatter 保持禁用，格式化留作独立 commit 避免淹没迁移 diff。"
```

---

## Task 5: 导航 shim + 单测栈

**为什么单独一个 task**：三个 shim 是纯新增文件，此时**没有任何文件 import 它们**，所以可以在不破坏 Next 的前提下独立开发和测试。30 处 `useRouter` 调用点的正确性全押在这几十行上，值得有真正的单元测试。

**关于新增 Vitest**：spec §9 只定义了 Playwright 策略，本项目当前**没有任何单元测试能力**。为 shim 补一个最小单测栈是本 task 的必要设施 —— e2e 无法定位"`usePathname` 返回值少了 query string"这类错误。Vitest 5.0.0 的 peer 显式支持 `vite ^8`，与后续技术栈一致。范围严格限制在 shim，不为其他代码补测。

**Files:**
- Create: `vitest.config.ts`、`vitest.setup.ts`
- Create: `src/lib/useHydrated.ts`、`src/lib/navigation.ts`、`src/lib/dynamic.tsx`、`src/components/common/AppLink.tsx`
- Test: `src/lib/__tests__/navigation.test.tsx`、`src/lib/__tests__/dynamic.test.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: 无
- Produces: Task 6 的 34 个文件将 import 这些：
  - `useRouter(): { push(href: string): void; replace(href: string): void; back(): void; forward(): void; refresh(): void; prefetch(): void }`
  - `usePathname(): string`
  - `useSearchParams(): URLSearchParams`
  - `useParams<T extends Record<string, string | undefined>>(): T`
  - `dynamic<P>(loader: () => Promise<{ default: ComponentType<P> }>, opts?: { loading?: () => ReactNode }): ComponentType<P>`
  - `AppLink(props: Omit<LinkProps, 'to'> & { href: string })`
  - `useHydrated(): boolean`

- [ ] **Step 1: 装单测依赖**

```bash
bun add -d vitest@^5.0.0 happy-dom@^20.14.0 @testing-library/react@^16.3.3 @testing-library/jest-dom@^6.9.1
bun add react-router@^8.3.1
```

> `react-router` 装到 dependencies —— shim 直接依赖它。此时 Next 仍在，两者共存无冲突（RR8 只是个库，不接管构建）。

- [ ] **Step 2: 写 vitest 配置**

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
  },
})
```

> 需要 `@vitejs/plugin-react`：`bun add -d @vitejs/plugin-react@^6.1.1 vite@^8.2.2`

`vitest.setup.ts`：

```ts
import '@testing-library/jest-dom/vitest'
```

package.json scripts 加：`"test": "vitest run"`、`"test:watch": "vitest"`

- [ ] **Step 3: 写失败的测试 —— navigation shim**

`src/lib/__tests__/navigation.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { useRouter, usePathname, useSearchParams, useParams } from '../navigation'

function renderAt(path: string, ui: React.ReactNode, routePath = '*') {
  const router = createMemoryRouter(
    [{ path: routePath, element: ui }],
    { initialEntries: [path] }
  )
  return render(<RouterProvider router={router} />)
}

describe('usePathname', () => {
  it('返回不含 query string 的路径', () => {
    function Probe() { return <span data-testid="p">{usePathname()}</span> }
    renderAt('/app/chat?tab=1', <Probe />)
    expect(screen.getByTestId('p')).toHaveTextContent('/app/chat')
  })
})

describe('useSearchParams', () => {
  it('可以用 .get() 读取参数', () => {
    function Probe() {
      return <span data-testid="q">{useSearchParams().get('next') ?? 'none'}</span>
    }
    renderAt('/app/login?next=%2Fapp%2Fchat', <Probe />)
    expect(screen.getByTestId('q')).toHaveTextContent('/app/chat')
  })
})

describe('useParams', () => {
  it('返回动态段', () => {
    function Probe() {
      const p = useParams<{ id?: string }>()
      return <span data-testid="id">{p.id ?? 'none'}</span>
    }
    renderAt('/room/abc', <Probe />, '/room/:id')
    expect(screen.getByTestId('id')).toHaveTextContent('abc')
  })
})

describe('useRouter', () => {
  it('push 会改变当前路径', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.push('/app/friends')}>go</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/friends')
  })

  it('replace 也会改变当前路径', async () => {
    function Probe() {
      const router = useRouter()
      return (
        <>
          <span data-testid="p">{usePathname()}</span>
          <button onClick={() => router.replace('/app/groups')}>go</button>
        </>
      )
    }
    renderAt('/app/chat', <Probe />)
    await userEvent.click(screen.getByText('go'))
    expect(screen.getByTestId('p')).toHaveTextContent('/app/groups')
  })

  it('暴露 back / forward / refresh / prefetch 且调用不抛错', () => {
    function Probe() {
      const r = useRouter()
      const ok = ['back', 'forward', 'refresh', 'prefetch']
        .every((k) => typeof (r as Record<string, unknown>)[k] === 'function')
      return <span data-testid="ok">{String(ok)}</span>
    }
    renderAt('/app/chat', <Probe />)
    expect(screen.getByTestId('ok')).toHaveTextContent('true')
  })
})
```

> 需要 `bun add -d @testing-library/user-event@^14.6.1`

- [ ] **Step 4: 运行测试确认失败**

Run: `bun run test`
Expected: FAIL —— `Cannot find module '../navigation'`

- [ ] **Step 5: 写 useHydrated**

`src/lib/useHydrated.ts`：

```ts
import { useSyncExternalStore } from 'react'

function subscribe() {
  return () => {}
}

/**
 * 水合守卫：服务端与首次客户端渲染返回 false，水合完成后返回 true。
 * 用 useSyncExternalStore 保证 SSR 与 hydration 的首帧一致，避免 mismatch。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,   // 客户端快照
    () => false,  // 服务端快照
  )
}
```

- [ ] **Step 6: 写 navigation shim**

`src/lib/navigation.ts`：

```ts
import {
  useNavigate,
  useLocation,
  useSearchParams as useRouterSearchParams,
  useParams as useRouterParams,
} from 'react-router'

/**
 * 导航适配层：向调用方保持 Next.js App Router 的签名，内部由 React Router 实现。
 *
 * 这是一层有意保留的适配，用于把框架迁移的改动面收敛到 import 路径。
 * 已核实全仓库无 router.refresh() / router.prefetch() 调用点，
 * 这两个方法仅为签名完整性保留。
 */
export function useRouter() {
  const navigate = useNavigate()
  return {
    push: (href: string) => { void navigate(href) },
    replace: (href: string) => { void navigate(href, { replace: true }) },
    back: () => { void navigate(-1) },
    forward: () => { void navigate(1) },
    refresh: () => { void navigate('.', { replace: true }) },
    prefetch: () => {},
  }
}

/** 当前路径，不含 query string 与 hash（与 Next 的 usePathname 一致）。 */
export function usePathname(): string {
  return useLocation().pathname
}

/**
 * 只读取当前 query string。
 * Next 返回 ReadonlyURLSearchParams，此处返回 URLSearchParams —— 已核实
 * 全部 4 处调用点仅用 .get()，不做写操作。
 */
export function useSearchParams(): URLSearchParams {
  return useRouterSearchParams()[0]
}

export function useParams<
  T extends Record<string, string | undefined> = Record<string, string | undefined>,
>(): T {
  return useRouterParams() as T
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `bun run test`
Expected: PASS，6 个用例全绿

- [ ] **Step 8: 写失败的测试 —— dynamic shim**

`src/lib/__tests__/dynamic.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { dynamic } from '../dynamic'

function Hello() { return <span data-testid="hello">hello</span> }

describe('dynamic', () => {
  it('最终渲染出被懒加载的组件', async () => {
    const Lazy = dynamic(() => Promise.resolve({ default: Hello }))
    render(<Lazy />)
    await waitFor(() => expect(screen.getByTestId('hello')).toBeInTheDocument())
  })

  it('支持 loading 占位（与 next/dynamic 的 loading 选项等价）', async () => {
    const Lazy = dynamic(
      () => new Promise<{ default: typeof Hello }>((r) => setTimeout(() => r({ default: Hello }), 50)),
      { loading: () => <span data-testid="loading">loading</span> },
    )
    render(<Lazy />)
    await waitFor(() => expect(screen.getByTestId('hello')).toBeInTheDocument())
  })

  it('把 props 透传给目标组件', async () => {
    function Greet({ name }: { name: string }) { return <span data-testid="g">{name}</span> }
    const Lazy = dynamic<{ name: string }>(() => Promise.resolve({ default: Greet }))
    render(<Lazy name="huanvae" />)
    await waitFor(() => expect(screen.getByTestId('g')).toHaveTextContent('huanvae'))
  })
})
```

- [ ] **Step 9: 运行测试确认失败**

Run: `bun run test`
Expected: FAIL —— `Cannot find module '../dynamic'`

- [ ] **Step 10: 写 dynamic shim**

`src/lib/dynamic.tsx`：

```tsx
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { useHydrated } from './useHydrated'

interface DynamicOptions {
  /** 加载期间的占位内容，等价于 next/dynamic 的 loading 选项。 */
  loading?: () => ReactNode
}

/**
 * 懒加载适配层，等价于 next/dynamic(loader, { ssr: false })。
 *
 * 全仓库 13 处 dynamic 调用都是 ssr: false，所以此处统一用水合守卫
 * 在服务端与首次客户端渲染时返回占位，避免 hydration mismatch。
 */
export function dynamic<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const Lazy = lazy(loader)
  const fallback = options.loading ? options.loading() : null

  return function DynamicComponent(props: P) {
    const hydrated = useHydrated()
    if (!hydrated) return <>{fallback}</>
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    )
  }
}
```

- [ ] **Step 11: 运行测试确认通过**

Run: `bun run test`
Expected: PASS，9 个用例全绿

- [ ] **Step 12: 写 AppLink**

`src/components/common/AppLink.tsx`：

```tsx
import { Link, type LinkProps } from 'react-router'

/**
 * 链接适配层：接受 href（Next 风格），内部转成 React Router 的 to。
 * 仅为收敛 5 处 next/link 调用点的改动面而存在。
 */
export type AppLinkProps = Omit<LinkProps, 'to'> & { href: string }

export function AppLink({ href, ...rest }: AppLinkProps) {
  return <Link to={href} {...rest} />
}

export default AppLink
```

- [ ] **Step 13: typecheck + lint**

```bash
bunx tsc --noEmit
bun run lint
```

Expected: 均零错误。

- [ ] **Step 14: 提交**

```bash
git add vitest.config.ts vitest.setup.ts src/lib/useHydrated.ts src/lib/navigation.ts src/lib/dynamic.tsx src/lib/__tests__ src/components/common/AppLink.tsx package.json bun.lock
git commit -m "feat: 新增 React Router 导航适配层与单测栈

三个适配模块（navigation / dynamic / AppLink）向调用方保持 Next 的签名，
把框架迁移的改动面收敛到 import 路径替换。

同时引入 Vitest + happy-dom + testing-library 作为最小单测能力
（项目此前无任何单元测试），范围严格限定在这三个适配模块 ——
30 处 useRouter 调用点的正确性押在这几十行上，e2e 无法定位其内部错误。

此时无任何文件 import 这些模块，Next 仍正常工作。"
```

---

## Task 6: 切换到 React Router 8（原子变更）

**为什么这个 task 必须是原子的**：`src/app/` 同时是 Next 的 App Router 目录和 RR8 的 `appDirectory`，两个框架无法在此共存。中途任何一个分割点都会让仓库处于"路由一半是 Next 一半是 RR8"的不可运行状态。所以本 task 内部步骤很多，但只有一个提交点。

**Files:**
- Create: `react-router.config.ts`、`vite.config.ts`
- Create: `src/app/root.tsx`、`src/app/routes.ts`、`src/app/entry.client.tsx`、`src/app/entry.server.tsx`
- Create: `src/app/routes/` 下 20 个路由模块
- Modify: `package.json`、`tsconfig.json`、`.gitignore`、`src/lib/apiConfig.ts`、`src/lib/version.ts`、`src/components/ui/sonner.tsx`、34 个 import 替换文件
- Delete: `next.config.js`、`next-env.d.ts`、`src/app/layout.tsx`、`src/app/providers.tsx`、`src/app/serwist.tsx`、`src/app/not-found.tsx`、所有 `src/app/**/page.tsx` 与 `layout.tsx`、`src/app/app/(protected)/ProtectedLayoutClient.tsx`

**Interfaces:**
- Consumes: Task 5 的 `useRouter`/`usePathname`/`useSearchParams`/`useParams`/`dynamic`/`AppLink`/`useHydrated`；Task 2 的三个决策
- Produces: `bun run dev` 启动 Vite；20 条路由可达；`bun run build` 产出 SSR 构建。Task 7 的 `server/index.ts` 依赖构建产物路径 `build/server/index.js` 与 `build/client/`

- [ ] **Step 1: 装 RR8 + Vite 依赖，卸 Next**

```bash
bun add react-router@^8.3.1
bun add -d @react-router/dev@^8.3.1 @react-router/node@^8.3.1 vite@^8.2.2 @vitejs/plugin-react@^6.1.1 @tailwindcss/vite@^4.3.3
bun remove next @sentry/nextjs @serwist/next @serwist/cli autoprefixer postcss @tailwindcss/postcss esbuild next-themes
```

> `@sentry/nextjs` 现在卸掉，`src/config/sentry.ts` 会临时编译不过 —— Step 13 修。`next-themes` 同理，Step 12 修。

- [ ] **Step 2: 写 react-router.config.ts**

```ts
import type { Config } from '@react-router/dev/config'

export default {
  appDirectory: 'src/app',
  // SSR 只渲染 HTML 外壳；业务数据全部客户端拉取（见 spec §1.3）
  ssr: true,
} satisfies Config
```

- [ ] **Step 3: 写 vite.config.ts**

console 剥离部分按 Task 2 Step 5 的结论填写。以下用保底的 terser 方案；若 spike 确认 oxc 方案可行，替换该段。

```ts
import { reactRouter } from '@react-router/dev/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    sourcemap: false,
    // 生产剥离 console.log，保留 error / warn（原 next.config.js 的 compiler.removeConsole）
    minify: 'terser',
    terserOptions: {
      compress: { pure_funcs: ['console.log'] },
    },
  },
  server: { port: 3000 },
})
```

> 若采用 terser：`bun add -d terser`。端口固定 3000，与 `playwright.config.ts` 的 `baseURL` 一致。

- [ ] **Step 4: 写 entry.client.tsx**

```tsx
import { HydratedRouter } from 'react-router/dom'
import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  )
})
```

- [ ] **Step 5: 写 entry.server.tsx**

```tsx
import { PassThrough } from 'node:stream'
import { createReadableStreamFromReadable } from '@react-router/node'
import { ServerRouter, type EntryContext } from 'react-router'
import { renderToPipeableStream } from 'react-dom/server'

const ABORT_DELAY = 5_000

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} abortDelay={ABORT_DELAY} />,
      {
        onShellReady() {
          shellRendered = true
          const body = new PassThrough()
          responseHeaders.set('Content-Type', 'text/html')
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          )
          pipe(body)
        },
        onShellError(error: unknown) {
          reject(error)
        },
        onError(error: unknown) {
          responseStatusCode = 500
          if (shellRendered) console.error(error)
        },
      },
    )
    setTimeout(abort, ABORT_DELAY)
  })
}
```

- [ ] **Step 6: 写 root.tsx**

把原 `src/app/layout.tsx` 的 metadata / viewport 拆成 `meta` + `links`，把 `src/app/providers.tsx` 的 provider 树内联进来，并把 `not-found.tsx` 的 UI 搬进 `ErrorBoundary`。

**注意四件事**：①主题防闪脚本必须原样保留在 `<head>`；②`isRouteErrorResponse(error) && error.status === 404` 分支渲染 404 UI；③`import '@/styles/globals.css'` 改为 `links` 导出（Vite 需要 `?url`）；④原 `providers.tsx` 里的 `UpdatePrompt` 用的是 Task 5 的 `dynamic`。

```tsx
import {
  Links, Meta, Outlet, Scripts, ScrollRestoration,
  isRouteErrorResponse, useRouteError,
} from 'react-router'
import type { LinksFunction, MetaFunction } from 'react-router'
import { useEffect } from 'react'
import Cookies from 'js-cookie'
import globalsHref from '@/styles/globals.css?url'
import SoundProvider from '@/components/providers/SoundProvider'
import GlobalThreeBackdrop from '@/components/three/GlobalThreeBackdrop'
import { Toaster } from '@/components/ui/toaster'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { setSoundEnabled, setSoundVolume } from '@/hooks/useSound'
import { I18nProvider } from '@/i18n/I18nProvider'
import { dynamic } from '@/lib/dynamic'
import NotFoundView from '@/components/common/NotFoundView'

const APP_NAME = 'Huanvae Chat'
const APP_DEFAULT_TITLE = 'Huanvae Chat - AI聊天、群聊与视频会议'
const APP_DESCRIPTION = '智能通讯平台 - AI聊天、群组协作、视频会议，支持实时消息、文件共享、视频通话'
const APP_URL = 'https://huanvae.cn'

const UpdatePrompt = dynamic(() =>
  import('@/components/common/UpdatePrompt').then((mod) => ({ default: mod.UpdatePrompt })),
)

const themeInitScript = `
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
  } catch {}
})();
`

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: globalsHref },
  { rel: 'manifest', href: '/manifest.json' },
  { rel: 'icon', href: '/logo.svg' },
  { rel: 'apple-touch-icon', href: '/logo.svg' },
  { rel: 'canonical', href: `${APP_URL}/` },
  { rel: 'alternate', hrefLang: 'zh-CN', href: `${APP_URL}/` },
  { rel: 'alternate', hrefLang: 'x-default', href: `${APP_URL}/` },
]

export const meta: MetaFunction = () => [
  { title: APP_DEFAULT_TITLE },
  { name: 'application-name', content: APP_NAME },
  { name: 'description', content: APP_DESCRIPTION },
  { name: 'keywords', content: 'Huanvae Chat,聊天,AI,AI聊天,即时通讯,视频会议,群聊,WebRTC,PWA,instant messaging,video meeting,team collaboration' },
  { name: 'author', content: 'Huanvae Team' },
  { name: 'creator', content: 'Huanvae' },
  { name: 'publisher', content: 'Huanvae' },
  { name: 'referrer', content: 'origin-when-cross-origin' },
  { name: 'format-detection', content: 'telephone=no' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
  { name: 'apple-mobile-web-app-title', content: APP_NAME },
  { name: 'robots', content: 'index, follow' },
  { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover' },
  { name: 'theme-color', content: '#4285f4' },
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: APP_NAME },
  { property: 'og:title', content: APP_DEFAULT_TITLE },
  { property: 'og:description', content: APP_DESCRIPTION },
  { property: 'og:url', content: APP_URL },
  { property: 'og:locale', content: 'zh_CN' },
  { property: 'og:image', content: `${APP_URL}/logo.svg` },
  { property: 'og:image:width', content: '512' },
  { property: 'og:image:height', content: '512' },
  { property: 'og:image:alt', content: APP_NAME },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: APP_DEFAULT_TITLE },
  { name: 'twitter:description', content: APP_DESCRIPTION },
  { name: 'twitter:image', content: `${APP_URL}/logo.svg` },
]

/** 同步设置到 DOM（原 providers.tsx 的 SettingsSync，逻辑逐行保持不变）。 */
function SettingsSync() {
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)

  useEffect(() => {
    const root = document.documentElement
    const setThemeCookie = (value: 'light' | 'dark') => {
      Cookies.set('app-theme', value, { expires: 365, sameSite: 'Lax', path: '/' })
      root.style.colorScheme = value
    }
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      root.classList.toggle('dark', mediaQuery.matches)
      setThemeCookie(mediaQuery.matches ? 'dark' : 'light')
    } else {
      root.classList.toggle('dark', theme === 'dark')
      setThemeCookie(theme === 'dark' ? 'dark' : 'light')
    }
  }, [theme])

  useEffect(() => {
    if (theme !== 'auto') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const root = document.documentElement
      root.classList.toggle('dark', e.matches)
      Cookies.set('app-theme', e.matches ? 'dark' : 'light', { expires: 365, sameSite: 'Lax', path: '/' })
      root.style.colorScheme = e.matches ? 'dark' : 'light'
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => { setSoundEnabled(soundEnabled) }, [soundEnabled])
  useEffect(() => { setSoundVolume(soundVolume) }, [soundVolume])

  useEffect(() => {
    const root = document.documentElement
    if (animationsEnabled) {
      root.classList.remove('reduce-motion')
      root.style.setProperty('--animation-duration', '1')
    } else {
      root.classList.add('reduce-motion')
      root.style.setProperty('--animation-duration', '0')
    }
  }, [animationsEnabled])

  useEffect(() => {
    if (!language || language === 'auto') {
      document.documentElement.lang = navigator.language || 'zh-CN'
      return
    }
    document.documentElement.lang = language
  }, [language])

  return null
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <head>
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">
        <I18nProvider>
          <SoundProvider>
            <GlobalThreeBackdrop />
            <SettingsSync />
            <div className="relative z-10 h-full">{children}</div>
            <Toaster />
            <UpdatePrompt autoUpdateDelay={3000} />
          </SoundProvider>
        </I18nProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundView />
  }
  console.error(error)
  return <NotFoundView />
}
```

> **`DevServiceWorkerCleanup` 去哪了**：原 `providers.tsx` 里那个组件只在 `NODE_ENV === 'development'` 下注销 SW。Vite dev 不生成 SW，该逻辑失去意义，本 task 一并删除。若 Task 8 之后发现 dev 环境仍有 SW 残留，再单独恢复。

- [ ] **Step 7: 把 404 UI 抽成组件**

原 `src/app/not-found.tsx` 是个完整的 404 页面（含 framer-motion 动画、i18n 文案、返回/回首页按钮）。把它整体搬到 `src/components/common/NotFoundView.tsx`，**UI 与动画一行不改**，只改两处 import：

- `import Link from 'next/link'` → `import { AppLink as Link } from '@/components/common/AppLink'`
- `import { useRouter } from 'next/navigation'` → `import { useRouter } from '@/lib/navigation'`

并删掉文件顶部的 `'use client'`（RR8 不需要）。**保持默认导出**，组件名从 `NotFound` 改为 `NotFoundView` —— root.tsx 的 `import NotFoundView from '@/components/common/NotFoundView'` 与此对应。

- [ ] **Step 8: 写 routes.ts**

```ts
import { type RouteConfig, index, route, layout } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('downloads', 'routes/downloads.tsx'),
  route('~offline', 'routes/offline.tsx'),

  route('app', 'routes/app-index.tsx'),

  layout('routes/auth-layout.tsx', [
    route('app/login', 'routes/login.tsx'),
    route('app/register', 'routes/register.tsx'),
  ]),

  layout('routes/protected-layout.tsx', [
    route('app/chat', 'routes/chat.tsx'),
    route('app/friends', 'routes/friends.tsx'),
    route('app/groups', 'routes/groups.tsx'),
    route('app/files', 'routes/files.tsx'),
    route('app/webrtc', 'routes/webrtc.tsx'),
    route('app/ai-chat', 'routes/ai-chat.tsx'),
    route('app/video-meeting', 'routes/video-meeting.tsx'),
    route('app/devices', 'routes/devices.tsx'),
    route('app/settings', 'routes/settings.tsx'),
    route('app/profile', 'routes/profile.tsx'),
  ]),
] satisfies RouteConfig
```

**核对**：这 20 条路径必须与 `src/lib/routes.ts` 的 `ROUTES` 常量逐字一致。用以下命令交叉验证：

```bash
grep -oE "'/[a-z~/-]*'" src/lib/routes.ts | sort -u
grep -oE "route\('[a-z~/-]*'" src/app/routes.ts | sort -u
```

- [ ] **Step 9: 写 10 个 dynamic 包装型路由模块**

这些原本是 `page.tsx`，形态完全统一。以 `src/app/routes/chat.tsx` 为例：

```tsx
import { dynamic } from '@/lib/dynamic'

const ChatPage = dynamic(() => import('@/features/chat/components/ChatPage'))

export default function Chat() {
  return <ChatPage />
}
```

按下表逐个创建，**目标组件路径必须与原 page.tsx 完全一致**：

| 路由模块 | 懒加载目标 |
|---|---|
| `routes/chat.tsx` | `@/features/chat/components/ChatPage` |
| `routes/friends.tsx` | `@/features/chat/components/ChatPage` |
| `routes/groups.tsx` | `@/features/chat/components/ChatPage` |
| `routes/files.tsx` | `@/features/chat/components/ChatPage` |
| `routes/webrtc.tsx` | `@/features/chat/components/ChatPage` |
| `routes/ai-chat.tsx` | `@/features/ai/components/AiChatPage` |
| `routes/video-meeting.tsx` | `@/features/webrtc/components/VideoMeeting` |
| `routes/devices.tsx` | `@/features/settings/components/DevicesPage` |
| `routes/settings.tsx` | `@/features/settings/components/SettingsPage` |
| `routes/profile.tsx` | `@/features/profile/components/ProfilePage` |
| `routes/register.tsx` | `@/features/auth/components/RegisterForm` |

`routes/login.tsx` 多一个 loading 占位（原 page.tsx 有 `loading: () => <SimpleLoading />`）：

```tsx
import { dynamic } from '@/lib/dynamic'
import SimpleLoading from '@/components/common/SimpleLoading'

const LoginPage = dynamic(
  () => import('@/features/auth/components/LoginForm'),
  { loading: () => <SimpleLoading /> },
)

export default function Login() {
  return <LoginPage />
}
```

- [ ] **Step 10: 写 home / downloads / offline / app-index 四个路由模块**

`routes/home.tsx`（原 `src/app/page.tsx`，含两段 JSON-LD 与页面级 meta）：

```tsx
import type { MetaFunction } from 'react-router'
import LandingPage from '@/features/landing/components/LandingPage'

const APP_URL = 'https://huanvae.cn'
const TITLE = 'Huanvae Chat - AI聊天、群聊与视频会议'
const DESCRIPTION = 'Huanvae Chat 是一个面向团队与个人的智能通讯平台，提供 AI 聊天、群组协作、实时消息、文件共享与视频会议。'

export const meta: MetaFunction = () => [
  { title: TITLE },
  { name: 'description', content: DESCRIPTION },
  { property: 'og:title', content: TITLE },
  { property: 'og:description', content: DESCRIPTION },
  { property: 'og:url', content: APP_URL },
  { property: 'og:type', content: 'website' },
  { property: 'og:locale', content: 'zh_CN' },
  { property: 'og:site_name', content: 'Huanvae Chat' },
  { property: 'og:image', content: `${APP_URL}/logo.svg` },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: TITLE },
  { name: 'twitter:description', content: DESCRIPTION },
  { name: 'twitter:image', content: `${APP_URL}/logo.svg` },
]

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Huanvae Chat',
  url: APP_URL,
  description: DESCRIPTION,
  inLanguage: 'zh-CN',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${APP_URL}/?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Huanvae Chat',
  applicationCategory: 'CommunicationApplication',
  operatingSystem: 'Web',
  url: APP_URL,
  description: DESCRIPTION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
}

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
      <LandingPage />
    </>
  )
}
```

`routes/downloads.tsx`：

```tsx
import type { MetaFunction } from 'react-router'
import DownloadsPage from '@/features/downloads/components/DownloadsPage'

export const meta: MetaFunction = () => [
  { title: 'Downloads - Huanvae' },
  { name: 'description', content: 'Download Huanvae for Windows, macOS, Linux, and Android.' },
]

export default function Downloads() {
  return <DownloadsPage />
}
```

`routes/offline.tsx`：把原 `src/app/~offline/page.tsx` 的 JSX 原样搬过来，只改 `import Link from 'next/link'` → `import { AppLink as Link } from '@/components/common/AppLink'`，并删掉 `'use client'`。

`routes/app-index.tsx`（原 `src/app/app/page.tsx`，恢复上次访问路径的重定向逻辑，**逻辑一行不改**）：

```tsx
import { useEffect } from 'react'
import { useRouter } from '@/lib/navigation'
import { DEFAULT_AUTHENTICATED_ROUTE } from '@/lib/routes'

export default function WebAppEntry() {
  const router = useRouter()

  useEffect(() => {
    const lastPath = localStorage.getItem('last_visited_path')
    if (lastPath && lastPath.startsWith('/app') && !lastPath.includes('/app/home')) {
      router.replace(lastPath)
    } else {
      router.replace(DEFAULT_AUTHENTICATED_ROUTE)
    }
  }, [router])

  return null
}
```

- [ ] **Step 11: 写两个 layout 路由模块**

`routes/auth-layout.tsx`（原 `(auth)/layout.tsx`，只有 noindex 的 robots meta）：

```tsx
import { Outlet } from 'react-router'
import type { MetaFunction } from 'react-router'

export const meta: MetaFunction = () => [
  { name: 'robots', content: 'noindex, nofollow, noarchive' },
  { name: 'googlebot', content: 'noindex, nofollow, noimageindex' },
]

export default function AuthLayout() {
  return <Outlet />
}
```

`routes/protected-layout.tsx`（合并原 `(protected)/layout.tsx` 与 `ProtectedLayoutClient.tsx`，**逻辑一行不改**）：

```tsx
import { Outlet } from 'react-router'
import type { MetaFunction } from 'react-router'
import ProfileModal from '@/features/profile/components/ProfileModal'
import ProtectedRoute from '@/features/auth/components/ProtectedRoute'
import MainLayout from '@/components/layout/MainLayout'
import { ROUTES } from '@/lib/routes'
import { useUIStore } from '@/store/uiStore'
import { usePathname } from '@/lib/navigation'

export const meta: MetaFunction = () => [
  { name: 'robots', content: 'noindex, nofollow, noarchive' },
  { name: 'googlebot', content: 'noindex, nofollow, noimageindex' },
]

export default function ProtectedLayout() {
  const pathname = usePathname()
  const { profileModalOpen, closeProfileModal } = useUIStore()

  // 只有视频会议需要全屏独立布局
  const isVideoMeeting = !!pathname && pathname.startsWith(ROUTES.app.videoMeeting)

  return (
    <ProtectedRoute>
      {isVideoMeeting ? <Outlet /> : <MainLayout><Outlet /></MainLayout>}
      <ProfileModal isOpen={profileModalOpen} onClose={closeProfileModal} />
    </ProtectedRoute>
  )
}
```

- [ ] **Step 12: 机械替换 34 个文件的 import**

```bash
# next/navigation → @/lib/navigation
grep -rl "from 'next/navigation'" src --include='*.ts' --include='*.tsx' \
  | xargs sed -i '' "s|from 'next/navigation'|from '@/lib/navigation'|g"

# next/link → AppLink
grep -rl "from 'next/link'" src --include='*.tsx' \
  | xargs sed -i '' "s|import Link from 'next/link'|import { AppLink as Link } from '@/components/common/AppLink'|g"

# next/dynamic → @/lib/dynamic（注意：默认导入变具名导入）
grep -rl "from 'next/dynamic'" src --include='*.tsx' \
  | xargs sed -i '' "s|import dynamic from 'next/dynamic'|import { dynamic } from '@/lib/dynamic'|g"

# 验证无残留
grep -rn "from 'next/" src --include='*.ts' --include='*.tsx' || echo "✓ 无 next/* 残留"
```

**逐个人工核对 `dynamic` 调用点**：sed 只改了 import，但调用处仍带 `{ ssr: false }` 第二参数。Task 5 的 `dynamic` 第二参数只认 `loading`，多余的 `ssr: false` 会被 TypeScript 拒绝。逐个删掉 `, { ssr: false }`，把 `{ ssr: false, loading: ... }` 改成 `{ loading: ... }`。

```bash
grep -rn "ssr: false" src --include='*.tsx'
```

Expected: 处理完后无输出。

同时修 `src/components/ui/sonner.tsx`（既存缺陷：`next-themes` 的 `useTheme()` 因无 Provider 永远返回 `"system"`，Toaster 主题从未跟随过应用）：

```tsx
// 删除：import { useTheme } from "next-themes"
import { useSettingsStore } from "@/features/settings/store/settingsStore"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSettingsStore((s) => s.theme)
  return (
    <Sonner
      theme={(theme === 'auto' ? 'system' : theme) as ToasterProps["theme"]}
      // ...其余不变
```

- [ ] **Step 13: 环境变量迁移**

```bash
grep -rn "process.env" src --include='*.ts' --include='*.tsx'
```

逐个替换：

| 原 | 新 | 文件 |
|---|---|---|
| `process.env.NEXT_PUBLIC_API_URL` | `import.meta.env.VITE_API_URL` | `src/lib/apiConfig.ts` |
| `process.env.NEXT_PUBLIC_WS_URL` | `import.meta.env.VITE_WS_URL` | `src/lib/apiConfig.ts` |
| `process.env.NEXT_PUBLIC_SENTRY_DSN` | `import.meta.env.VITE_SENTRY_DSN` | `src/config/sentry.ts` |
| `process.env.NEXT_PUBLIC_APP_VERSION` | `import.meta.env.VITE_APP_VERSION` | `src/lib/version.ts` |
| `process.env.NODE_ENV === 'production'` | `import.meta.env.PROD` | 各处 |
| `process.env.NODE_ENV === 'development'` | `import.meta.env.DEV` | 各处 |

`src/config/sentry.ts` 同时把 `import * as Sentry from '@sentry/nextjs'` 改为 `'@sentry/react-router'`（或 Task 2 决定的替代包）。**`beforeSend` 的敏感信息过滤、`ignoreErrors` 列表、采样率配置全部保持不变。**

创建 `.env.example`：

```
VITE_API_URL=https://api.huanvae.cn
VITE_WS_URL=wss://api.huanvae.cn
VITE_SENTRY_DSN=
VITE_APP_VERSION=1.0.1
```

- [ ] **Step 14: 更新 tsconfig / package.json / .gitignore**

`tsconfig.json`：删除 `plugins: [{ name: 'next' }]`、`include` 里的 `next-env.d.ts` 与 `.next/types/**/*.ts` 与 `.next/dev/types/**/*.ts`；新增 `.react-router/types/**/*.ts` 到 include；`exclude` 里 `src/app/sw.ts` 保留。加 `"types": ["vite/client"]` 让 `import.meta.env` 有类型。

`package.json` scripts：

```json
"dev": "react-router dev",
"build": "react-router build",
"start": "bun run server/index.ts",
"typecheck": "react-router typegen && tsc --noEmit",
"lint": "biome lint .",
"lint:fix": "biome lint --write .",
"test": "vitest run",
"test:e2e": "playwright test"
```

`.gitignore`：删掉 `next-env.d.ts` 一行，新增 `.react-router/` 和 `build/`。

- [ ] **Step 15: 删除 Next 文件**

```bash
rm -f next.config.js next-env.d.ts
rm -f src/app/layout.tsx src/app/providers.tsx src/app/serwist.tsx src/app/not-found.tsx src/app/page.tsx
rm -rf "src/app/app" src/app/downloads "src/app/~offline" src/app/download
rm -rf .next out
```

**保留 `src/app/sw.ts`** —— Task 8 处理。

- [ ] **Step 16: typegen + typecheck**

```bash
bun run typecheck
```

Expected: 零错误。常见问题：`import.meta.env` 无类型（加 `vite/client` 到 tsconfig types）、`dynamic` 第二参数残留 `ssr: false`（回 Step 12）。

- [ ] **Step 17: 起 dev server，逐条访问 20 个路由**

```bash
bun run dev &
sleep 10
for p in / /downloads /~offline /app /app/login /app/register /app/chat /app/friends /app/groups /app/files /app/webrtc /app/ai-chat /app/video-meeting /app/devices /app/settings /app/profile; do
  printf '%-24s ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3000$p"
done
```

Expected: 全部 200。未登录时受保护路由由客户端 `ProtectedRoute` 跳转，服务端仍应返回 200（外壳）。

- [ ] **Step 18: 检查浏览器控制台无 hydration 警告**

手动打开 `http://localhost:3000/`、`/app/login`、`/app/chat`，打开 DevTools Console。

Expected: 无 `Warning: Text content did not match`、无 `Hydration failed`。若有，定位到具体组件 —— 通常是漏了水合守卫的 `localStorage`/`window` 访问。

- [ ] **Step 19: 单测 + lint + 生产构建**

```bash
bun run test
bun run lint
bun run build
ls -la build/client build/server
```

Expected: 测试全绿；lint 零 error；构建产出 `build/client/` 与 `build/server/index.js`。

- [ ] **Step 20: 验证 console 剥离行为**

```bash
grep -c "console\.log" build/client/assets/*.js | awk -F: '{s+=$2} END {print "console.log:", s}'
grep -c "console\.error" build/client/assets/*.js | awk -F: '{s+=$2} END {print "console.error:", s}'
```

Expected: `console.log` 为 0，`console.error` 大于 0。**若 error 也是 0，说明剥离过头了，回 Step 3 改配置。**

- [ ] **Step 21: 跑 e2e 比对基线**

Run: `bun run test:e2e`
Expected: 通过数量与 Task 1 Step 4 记录的数字一致。

- [ ] **Step 22: 提交**

```bash
git add -A
git commit -m "feat!: 从 Next.js 迁移到 React Router 8 + Vite 8

框架切换是原子变更 —— src/app/ 同时是 Next 的 App Router 目录和 RR8 的
appDirectory，两者无法共存，故单次提交。

- appDirectory 指向现有 src/app/，145 个非路由文件目录结构零改动
- 20 条路由用 config-based routing 显式声明，URL 与 src/lib/routes.ts 逐字一致
- 34 个文件仅机械替换 import 到 Task 5 的适配层
- metadata/viewport 导出转为 RR8 的 meta/links；404 走 ErrorBoundary
- NEXT_PUBLIC_* → VITE_*，process.env → import.meta.env
- 顺带修复 sonner.tsx 的既存缺陷：next-themes 无 Provider 导致
  Toaster 主题永远是 system，改读 settingsStore

e2e 基线通过数不变。"
```

---

## Task 7: Bun 服务端与响应头

**Files:**
- Create: `server/index.ts`
- Delete: `public/_headers`

**Interfaces:**
- Consumes: Task 6 的构建产物 `build/server/index.js`、`build/client/`
- Produces: `bun run start` 起服务；`GET /healthz` 返回 200；Task 11 的 Dockerfile 与 compose healthcheck 依赖它

- [ ] **Step 1: 记录 `public/_headers` 的全部内容**

```bash
cat public/_headers
```

八条响应头（HSTS / X-Content-Type-Options / X-Frame-Options / X-XSS-Protection / Referrer-Policy / Permissions-Policy / sw.js 不缓存 / 静态资源长缓存）**一条都不能丢**。Cloudflare Pages 的 `_headers` 格式在 Docker 部署下完全失效，必须在服务端重新实现。

- [ ] **Step 2: 写 server/index.ts**

```ts
import { createRequestHandler } from '@react-router/node'

const PORT = Number(process.env.PORT ?? 3000)

// 原 public/_headers 的安全头，Cloudflare Pages 格式在 Docker 下失效，此处重新实现。
// Permissions-Policy 的 camera/microphone 必须允许 self —— 漏掉会静默破坏视频会议。
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
}

// @ts-expect-error 构建产物，仅在 build 后存在
const build = await import('../build/server/index.js')
const handler = createRequestHandler(build, 'production')

function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200 })
    }

    // 尾斜杠 301：原 Next 配置是 trailingSlash: true，迁移后不带尾斜杠。
    // 只改路径、绝不碰协议 —— origin 在 Cloudflare Tunnel 后面收到的是 HTTP，
    // 任何 http→https 重定向都会与 CF 边缘形成无限循环。
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '')
      return Response.redirect(url.toString(), 301)
    }

    // Service Worker：绝不缓存
    if (url.pathname === '/sw.js') {
      const file = Bun.file('build/client/sw.js')
      if (await file.exists()) {
        return withSecurityHeaders(new Response(file, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        }))
      }
    }

    // 构建产物：长缓存。注意路径是 /assets/*（Vite），不是 /_next/static/*（Next）。
    if (url.pathname.startsWith('/assets/')) {
      const file = Bun.file(`build/client${url.pathname}`)
      if (await file.exists()) {
        return withSecurityHeaders(new Response(file, {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        }))
      }
    }

    // public/ 下的其余静态文件
    const publicFile = Bun.file(`build/client${url.pathname}`)
    if (url.pathname !== '/' && (await publicFile.exists())) {
      return withSecurityHeaders(new Response(publicFile))
    }

    return withSecurityHeaders(await handler(request))
  },
})

console.warn(`server listening on :${PORT}`)
```

> **真实客户端 IP 在 `CF-Connecting-IP` 头**，socket 远端地址是 cloudflared 的容器 IP。阶段 1 尚无限流/日志需求，故未读取；**阶段 2 的 Redis 限流必须读它**，否则会把所有用户当成同一个 IP。此处留注释即可。

- [ ] **Step 3: 构建并启动**

```bash
bun run build
bun run start &
sleep 3
```

- [ ] **Step 4: 逐条验证八个响应头**

```bash
curl -sI http://localhost:3000/ | grep -iE "strict-transport|x-content-type|x-frame|x-xss|referrer-policy|permissions-policy"
```

Expected: 六条全部出现，且 `Permissions-Policy` 含 `camera=(self), microphone=(self)`。

```bash
curl -sI http://localhost:3000/sw.js | grep -i cache-control
```
Expected: `no-cache, no-store, must-revalidate`（Task 8 之前 sw.js 可能不存在，此步可留到 Task 8 后复验）

```bash
ASSET=$(ls build/client/assets/*.js | head -1 | sed 's|build/client||')
curl -sI "http://localhost:3000$ASSET" | grep -i cache-control
```
Expected: `public, max-age=31536000, immutable`

- [ ] **Step 5: 验证尾斜杠重定向且无循环**

```bash
curl -sI http://localhost:3000/app/chat/ | head -3
curl -sIL http://localhost:3000/app/chat/ | grep -c "^HTTP"
```

Expected: 第一条返回 `301` 且 `Location: /app/chat`；第二条计数为 2（一次 301 + 一次 200），**不能大于 2** —— 大于说明有循环。

- [ ] **Step 6: 验证健康检查**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/healthz
```
Expected: `200`

- [ ] **Step 7: 删除 `public/_headers` 并提交**

```bash
git rm public/_headers
git add server/index.ts
git commit -m "feat(server): 新增 Bun HTTP server 并迁移安全响应头

public/_headers 是 Cloudflare Pages 专用格式，换 Docker 部署后完全失效，
八条头逐条在服务端重新实现。其中 Permissions-Policy 的 camera/microphone
必须允许 self —— 漏掉会静默破坏视频会议且无报错。

静态资源长缓存路径从 /_next/static/* 改为 /assets/*（Vite 产物）。
尾斜杠 301 只改路径不碰协议，避免与 Cloudflare Tunnel 形成重定向循环。"
```

---

## Task 8: Serwist PWA 迁移

**注意**：本 task 的具体方案取决于 Task 2 Step 3 的结论。若 spike 证明 `@serwist/vite` 在 Vite 8 下不可用，改用 `vite-plugin-pwa@1.3.0` 的 `injectManifest` 模式，`sw.ts` 的预缓存过滤需按其 API 调整。以下按 Serwist 可用的路径书写。

**Files:**
- Modify: `src/app/sw.ts`、`vite.config.ts`、`package.json`
- Delete: `serwist.config.js`

**Interfaces:**
- Consumes: Task 6 的 `vite.config.ts`、Task 7 的 `/sw.js` 路由
- Produces: `build/client/sw.js`；Task 12 的 PWA 更新链路回归依赖它

- [ ] **Step 1: 装 Serwist Vite 集成，删旧配置**

```bash
bun add -d @serwist/vite@^9.5.12
rm serwist.config.js
```

- [ ] **Step 2: 改 sw.ts 的 import 与预缓存过滤**

`src/app/sw.ts` 现在的 `PRECACHE_SKIP_PATTERNS` 里有四条 Next 专属条目，Vite 产物里根本不存在，留着是死代码：

```ts
// 删除：'_buildManifest.js', '_ssgManifest.js', '_clientMiddlewareManifest.json', '/_global-error'
// 保留：'/_headers'（虽然文件已删，但保留无害）、'/version.json'
const PRECACHE_SKIP_PATTERNS = [
  '/version.json',
]
```

import 改为：`import { defaultCache } from '@serwist/vite/worker'`（具体路径以 Task 2 验证结果为准）。

- [ ] **Step 3: 在 vite.config.ts 挂载 Serwist 插件**

按 `@serwist/vite` 的 API 配置 `swSrc: 'src/app/sw.ts'`、`swDest: 'sw.js'`，并确保只在生产构建启用（dev 下不生成 SW）。

- [ ] **Step 4: 构建并确认产物**

```bash
bun run build
ls -la build/client/sw.js
```
Expected: 文件存在。

- [ ] **Step 5: 验证 SW 能注册且不被缓存**

```bash
bun run start &
sleep 3
curl -sI http://localhost:3000/sw.js | grep -iE "content-type|cache-control"
```
Expected: `Content-Type: application/javascript`、`Cache-Control: no-cache, no-store, must-revalidate`

- [ ] **Step 6: 手动验证更新链路**

这是本次迁移最脆弱的一环 —— 最近两个 commit（`12025f6`、`1d1498b`）都在修 SW 的接管与更新重载逻辑。

1. 浏览器打开 `http://localhost:3000/`，DevTools → Application → Service Workers，确认已注册
2. 改一处可见文案，`bun run build` 重新构建
3. 刷新页面，确认出现更新提示（`UpdatePrompt` 组件）
4. 点击更新，确认页面重载且新文案生效

Expected: 四步全通。任一步失败都要定位到 `sw.ts` 的 `SKIP_WAITING` 消息处理或 `UpdatePrompt` 的逻辑。

- [ ] **Step 7: 验证离线 fallback**

DevTools → Network → Offline，访问一个未缓存的路径。
Expected: 显示 `/~offline` 页面而非浏览器默认错误页。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(pwa): Serwist 从 Next 集成迁移到 Vite 集成

- @serwist/next → @serwist/vite，serwist.config.js 配置并入 vite.config.ts
- 清理 PRECACHE_SKIP_PATTERNS 里四条 Next 专属条目（Vite 产物中不存在）
- 已验证：SW 注册、更新提示、点击重载、离线 fallback 四条链路"
```

---

## Task 9: Sentry 迁移

**注意**：包的选择取决于 Task 2 Step 4 的结论 —— `@sentry/react-router`（若支持 RR8）或 `@sentry/react` + `@sentry/node`（回退方案）。

**Files:**
- Modify: `src/config/sentry.ts`、`src/app/entry.client.tsx`、`server/index.ts`

**Interfaces:**
- Consumes: Task 6 的 entry 文件、Task 2 的决策
- Produces: 客户端与服务端的错误上报

- [ ] **Step 1: 确认 sentry.ts 当前保留了哪些配置**

```bash
cat src/config/sentry.ts
```

以下四项**必须原样保留**：`beforeSend` 的 password/token 过滤、`ignoreErrors` 列表（浏览器扩展、网络错误、AbortError）、采样率（`tracesSampleRate: 0.1`、`replaysSessionSampleRate: 0.1`、`replaysOnErrorSampleRate: 1.0`）、只在生产启用的判断。

- [ ] **Step 2: 改 import 与初始化位置**

`src/config/sentry.ts`：`@sentry/nextjs` → Task 2 决定的包。`process.env.NEXT_PUBLIC_SENTRY_DSN` 已在 Task 6 改为 `import.meta.env.VITE_SENTRY_DSN`，`process.env.NODE_ENV === 'production'` 改为 `import.meta.env.PROD`。

`src/app/entry.client.tsx` 顶部调用 `initSentry()`。

- [ ] **Step 3: 服务端初始化**

在 `server/index.ts` 顶部加服务端 Sentry 初始化（若用回退方案则是 `@sentry/node`）。DSN 从 `process.env.VITE_SENTRY_DSN` 读（服务端不走 `import.meta.env`）。

- [ ] **Step 4: 验证初始化不报错**

```bash
bun run build && bun run start &
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```
Expected: 200，且服务端日志无 Sentry 相关报错。

- [ ] **Step 5: 验证敏感信息过滤仍生效**

写一个临时脚本调用 `captureError` 传入含 `password` 与 `token` 的对象，确认 `beforeSend` 把它们替换成 `[Filtered]`。可用单测：

```ts
// src/config/__tests__/sentry.test.ts
import { describe, it, expect } from 'vitest'
// 直接测 beforeSend 纯函数：把它从 sentry.ts 导出后测试
```

若 `beforeSend` 是内联匿名函数，先把它提取为具名导出 `export function filterSensitiveData(event)`，再对它写单测。**这是让既有安全逻辑可测的必要重构，不是范围扩张。**

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(sentry): 从 @sentry/nextjs 迁移到 React Router SDK

beforeSend 的 password/token 过滤、ignoreErrors 列表、采样率配置
全部原样保留；把 beforeSend 提取为具名函数以便单测覆盖。"
```

---

## Task 10: `src/data/` 抽象层接缝

**为什么现在做**：spec §2.2 —— 阶段 2 要把取数下沉到服务端 loader + Drizzle。若页面组件直接调 `src/api/*`，阶段 2 就得再改一遍页面。先立这层抽象，阶段 2 只换函数体，**页面组件一行不改**。

**范围严格限制**：只为阶段 2 确定要下沉到 BFF 的数据建抽象（用户偏好、主题、已读位置、草稿、会话列表）。其余保持现状直接调 `src/api/*`，**不为了抽象而抽象**。

**这个项目没有"conversation"这个概念** —— 会话列表由**好友列表**和**群聊列表**两部分构成。已核实的真实入口：

- `friendsApi.getFriendsList(): Promise<Friend[]>` — `@/features/chat/api/friends`
- `groupsApi.getMyGroups(): Promise<MyGroup[]>` — `@/features/chat/api/groups`
- `useSettingsStore` — `@/features/settings/store/settingsStore`，含 `theme: 'light' | 'dark' | 'auto'`、`language: LanguagePreference`

**Files:**
- Create: `src/data/conversations.ts`、`src/data/preferences.ts`、`src/data/index.ts`
- Test: `src/data/__tests__/conversations.test.ts`

**Interfaces:**
- Consumes: `friendsApi.getFriendsList`、`groupsApi.getMyGroups`、`useSettingsStore`
- Produces: 阶段 2 将替换这些函数的实现（签名不变）：
  - `loadFriends(): Promise<Friend[]>`
  - `loadGroups(): Promise<MyGroup[]>`
  - `getPreferences(): UserPreferences`
  - `type UserPreferences = { theme: 'light' | 'dark' | 'auto'; language: LanguagePreference }`

- [ ] **Step 1: 写失败的测试**

`src/data/__tests__/conversations.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadFriends, loadGroups } from '../conversations'

vi.mock('@/features/chat/api/friends', () => ({
  friendsApi: {
    getFriendsList: vi.fn(async () => [
      { user_id: 'u1', nickname: '张三' },
    ]),
  },
}))

vi.mock('@/features/chat/api/groups', () => ({
  groupsApi: {
    getMyGroups: vi.fn(async () => [
      { group_id: 'g1', name: '测试群' },
    ]),
  },
}))

describe('loadFriends', () => {
  beforeEach(() => vi.clearAllMocks())

  it('阶段 1 直接透传 friendsApi 的结果', async () => {
    const result = await loadFriends()
    expect(result).toEqual([{ user_id: 'u1', nickname: '张三' }])
  })
})

describe('loadGroups', () => {
  beforeEach(() => vi.clearAllMocks())

  it('阶段 1 直接透传 groupsApi 的结果', async () => {
    const result = await loadGroups()
    expect(result).toEqual([{ group_id: 'g1', name: '测试群' }])
  })
})
```

> `MyGroup` 的实际字段以 `src/features/chat/api/groups.ts` 的接口定义为准，mock 里只需给出被断言的那几个字段。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun run test`
Expected: FAIL —— `Cannot find module '../conversations'`

- [ ] **Step 3: 写抽象层**

`src/data/conversations.ts`：

```ts
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
```

`src/data/preferences.ts`：

```ts
import { useSettingsStore } from '@/features/settings/store/settingsStore'

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: ReturnType<typeof useSettingsStore.getState>['language']
}

/**
 * 用户偏好的数据访问入口。
 *
 * 阶段 1：读本地 zustand store（背后是 localStorage 持久化）。
 * 阶段 2：改为服务端 loader 读 Postgres，实现跨设备同步。
 */
export function getPreferences(): UserPreferences {
  const { theme, language } = useSettingsStore.getState()
  return { theme, language }
}
```

`src/data/index.ts`：

```ts
export { loadFriends, loadGroups } from './conversations'
export { getPreferences, type UserPreferences } from './preferences'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun run test`
Expected: PASS，2 个新用例绿

- [ ] **Step 5: 把消费方改为调抽象层**

```bash
grep -rn "friendsApi.getFriendsList\|groupsApi.getMyGroups" src --include='*.ts' --include='*.tsx'
```

把这些调用点改为 `import { loadFriends, loadGroups } from '@/data'`。**只改调用入口，不改任何渲染逻辑、不改 store 的写入路径。**

> 若某个调用点在 zustand store 内部（而非组件里），同样改 —— store 也是抽象层的消费方。

- [ ] **Step 6: typecheck + e2e**

```bash
bun run typecheck && bun run test && bun run test:e2e
```
Expected: 全绿，e2e 通过数不变。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "refactor: 引入 src/data 数据访问抽象层

阶段 2 要把取数下沉到服务端 loader + Drizzle。先立这层接缝，
届时只需替换函数体，页面组件一行不改。

范围限制在阶段 2 确定要下沉的数据（会话列表、用户偏好），
其余保持直接调 src/api/*，不为抽象而抽象。"
```

---

## Task 11: Docker + Compose + Cloudflare Tunnel

**关于 spec §13 的开放问题（镜像在哪构建）**：本 task 按"在 VPS 上 `docker compose build`"实现 —— 这是 spec 推荐的起步方案，活动部件最少，`.env` 就在机器上，不需要镜像仓库也不需要往 CI 传 secret。**阶段 1 不建 CI。** 若日后改成 CI 构建 + 推镜像仓库，`Dockerfile` 与 `docker-compose.yml` 完全不用改，区别只在谁执行 `build`。

**Files:**
- Create: `Dockerfile`、`.dockerignore`、`docker-compose.yml`
- Modify: `.gitignore`（确认 `.env` 已覆盖）

**Interfaces:**
- Consumes: Task 7 的 `server/index.ts`、`/healthz`
- Produces: `docker compose up` 起 app + cloudflared

- [ ] **Step 1: 写 .dockerignore**

```
node_modules
.git
.history
.next
out
build
tests
test-results
docs
*.md
.env
.env.*
playwright-report
```

- [ ] **Step 2: 写 Dockerfile**

`VITE_*` 是**构建时内联**进 JS 产物的，不是运行时读取 —— 所以必须是 build args，不能只放 environment。

```dockerfile
# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* 在构建时被内联进产物：改这些值必须重建镜像，重启容器无效
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SENTRY_DSN
ARG VITE_APP_VERSION
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_APP_VERSION=$VITE_APP_VERSION
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
USER bun
EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]
```

- [ ] **Step 3: 写 docker-compose.yml**

```yaml
services:
  app:
    build:
      context: .
      args:
        VITE_API_URL: ${VITE_API_URL}
        VITE_WS_URL: ${VITE_WS_URL}
        VITE_SENTRY_DSN: ${VITE_SENTRY_DSN}
        VITE_APP_VERSION: ${VITE_APP_VERSION}
    # 只对 docker 网络暴露，不 publish 到宿主机 —— 流量只经 cloudflared 进出
    expose: ["3000"]
    environment:
      NODE_ENV: production
      PORT: 3000
    healthcheck:
      test: ["CMD", "bun", "-e", "const r = await fetch('http://localhost:3000/healthz'); process.exit(r.ok ? 0 : 1)"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${CF_TUNNEL_TOKEN}
    depends_on:
      app:
        condition: service_healthy
    restart: unless-stopped

# 阶段 2 启用
# volumes:
#   pgdata:
#   redisdata:
```

- [ ] **Step 4: 确认 .env 未被跟踪**

```bash
git check-ignore -v .env && echo "✓ .env 已忽略"
git ls-files | grep -E "^\.env" && echo "✗ 有 .env 被跟踪！" || echo "✓ 无 .env 被跟踪"
grep -rn "CF_TUNNEL_TOKEN" docker-compose.yml
```

Expected: `.env` 被 `.gitignore` 覆盖（已验证在第 30 行）；compose 里只有 `${CF_TUNNEL_TOKEN}` 变量引用，**没有任何硬编码的 token**。

- [ ] **Step 5: 本地构建镜像并起 app（不含 cloudflared）**

```bash
cat > .env <<'EOF'
VITE_API_URL=https://api.huanvae.cn
VITE_WS_URL=wss://api.huanvae.cn
VITE_SENTRY_DSN=
VITE_APP_VERSION=1.0.1
CF_TUNNEL_TOKEN=dummy-for-local-test
EOF
docker compose build app
docker compose up -d app
sleep 15
docker compose ps
```

Expected: app 容器状态为 `healthy`。

- [ ] **Step 6: 从容器内验证服务**

```bash
docker compose exec app bun -e "const r = await fetch('http://localhost:3000/healthz'); console.log(r.status)"
docker compose exec app bun -e "const r = await fetch('http://localhost:3000/'); console.log(r.status, r.headers.get('permissions-policy'))"
```

Expected: `200`；`Permissions-Policy` 含 `camera=(self), microphone=(self)`。

- [ ] **Step 7: 清理并提交**

```bash
docker compose down
rm .env
git add Dockerfile .dockerignore docker-compose.yml .env.example
git commit -m "feat(deploy): 新增 Docker Compose 部署（VPS + Cloudflare Tunnel）

- app 容器只 expose 不 publish，VPS 防火墙可对公网关闭 80/443
- TLS 终止在 Cloudflare 边缘，服务端只跑明文 HTTP，不需要 Caddy/certbot
- cloudflared 用 depends_on: service_healthy，避免部署瞬间 502
- VITE_* 走 build args：这些值构建时内联进产物，改它们必须重建镜像

CF_TUNNEL_TOKEN 走 .env（已被 .gitignore 覆盖），compose 里只有变量引用。"
```

---

## Task 12: 迁移专项回归

现有 e2e 用例覆盖不到、但迁移风险高的点（spec §9.3）。

**Files:**
- Create: `tests/migration-regression.spec.ts`

**Interfaces:**
- Consumes: 前 11 个 task 的全部产出
- Produces: 阶段 1 的验收证据

- [ ] **Step 1: 写路由可达性与 URL 一致性测试**

```ts
import { test, expect } from '@playwright/test'

const PUBLIC_ROUTES = ['/', '/downloads', '/~offline']
const AUTH_ROUTES = ['/app/login', '/app/register']
const PROTECTED_ROUTES = [
  '/app/chat', '/app/friends', '/app/groups', '/app/files', '/app/webrtc',
  '/app/ai-chat', '/app/video-meeting', '/app/devices', '/app/settings', '/app/profile',
]

test.describe('路由可达性', () => {
  for (const path of [...PUBLIC_ROUTES, ...AUTH_ROUTES, ...PROTECTED_ROUTES]) {
    test(`${path} 返回 200`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(200)
    })
  }
})

test.describe('尾斜杠重定向', () => {
  test('/app/chat/ 单次 301 到 /app/chat，无循环', async ({ request }) => {
    const res = await request.get('/app/chat/', { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    expect(res.headers()['location']).toContain('/app/chat')
    expect(res.headers()['location']).not.toMatch(/\/$/)
  })
})

test.describe('认证守卫', () => {
  test('未登录访问受保护路由会跳到登录页', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/app/chat')
    await page.waitForURL(/\/app\/login/, { timeout: 10_000 })
    expect(page.url()).toContain('/app/login')
  })
})

test.describe('无 hydration 警告', () => {
  for (const path of ['/', '/app/login', '/app/chat']) {
    test(`${path} 控制台无 hydration 报错`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        const text = msg.text()
        if (/hydrat|did not match|Minified React error #(418|423|425)/i.test(text)) {
          errors.push(text)
        }
      })
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      expect(errors).toEqual([])
    })
  }
})
```

- [ ] **Step 2: 写响应头测试**

```ts
test.describe('安全响应头', () => {
  const EXPECTED: Record<string, string | RegExp> = {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'x-xss-protection': '1; mode=block',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': /camera=\(self\).*microphone=\(self\).*geolocation=\(\)/,
  }

  for (const [header, expected] of Object.entries(EXPECTED)) {
    test(`${header} 存在且正确`, async ({ request }) => {
      const res = await request.get('/')
      const actual = res.headers()[header]
      expect(actual, `${header} 缺失 —— _headers 迁移遗漏`).toBeDefined()
      if (expected instanceof RegExp) expect(actual).toMatch(expected)
      else expect(actual).toBe(expected)
    })
  }

  test('sw.js 不被缓存', async ({ request }) => {
    const res = await request.get('/sw.js')
    expect(res.headers()['cache-control']).toContain('no-store')
  })
})
```

- [ ] **Step 3: 起生产服务并运行专项回归**

```bash
bun run build
bun run start &
sleep 3
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/migration-regression.spec.ts
```

Expected: 全绿。

> 这套测试打的是**生产服务**（`bun run start`），不是 dev server —— 响应头与尾斜杠重定向只在 `server/index.ts` 里存在。`playwright.config.ts` 的 `webServer` 指向 dev，所以这里用 `E2E_BASE_URL` 覆盖 `baseURL` 并手工起服务。

- [ ] **Step 4: 跑完整 e2e 套件比对基线**

```bash
bun run test:e2e
```
Expected: 原有用例通过数与 Task 1 Step 4 记录一致，加上本 task 新增的用例。

- [ ] **Step 5: 逐条走 spec §12 验收清单**

对照 spec 第 12 节，逐项打勾。**WebSocket / WebRTC 建连**和**PWA 更新链路**需要手工验证（e2e 覆盖不到）：

- 打开 `/app/chat`，DevTools → Network → WS，确认连上 `wss://api.huanvae.cn`
- 打开 `/app/video-meeting`，确认浏览器弹出摄像头/麦克风权限请求（验证 `Permissions-Policy` 正确）
- SW 更新链路按 Task 8 Step 6 复验一次

- [ ] **Step 6: 提交**

```bash
git add tests/migration-regression.spec.ts
git commit -m "test: 补充迁移专项回归

覆盖现有 e2e 触及不到但迁移风险高的点：20 条路由可达性与 URL 一致性、
尾斜杠 301 无循环、认证守卫跳转、hydration 零警告、八条安全响应头、
sw.js 不缓存。

响应头与重定向只在 server/index.ts 存在，故本套测试打生产服务而非 dev。"
```

---

## 阶段 1 完成检查

全部 12 个 task 完成后，对照 spec §12 逐项确认：

- [ ] `bun install` 生成 `bun.lock`，pnpm 文件已删除，overrides 安全约束已迁移
- [ ] `bun run dev` 启动 Vite，20 条路由可访问
- [ ] `bun run build` 产出 SSR 构建，`bun run start` 起服务
- [ ] `bun run typecheck` 零错误
- [ ] `bun run lint`（Biome）零 error，4 条规则映射生效
- [ ] `biome.json` 的 formatter 处于禁用状态
- [ ] `bun run test`（Vitest）全绿
- [ ] `docker compose up` 起 app + cloudflared，`/healthz` 200，cloudflared 在 app healthy 后才接流量
- [ ] VPS 防火墙对公网关闭 80/443，站点仍可访问
- [ ] `curl -IL .../app/chat/` 单次 301，无循环
- [ ] Playwright 全套 + 专项回归全绿
- [ ] 控制台无 hydration 警告
- [ ] 八条响应头逐条验证生效，`Permissions-Policy` 允许 camera/microphone self
- [ ] 静态资源长缓存路径已改为 `/assets/*` 并命中
- [ ] 生产产物 `console.log` 已剥离，`console.error`/`warn` 保留
- [ ] `sonner.tsx` 的 Toaster 主题跟随应用主题
- [ ] `grep -r "next/" src/` 无结果
- [ ] `CF_TUNNEL_TOKEN` 在 `.env` 且已被 `.gitignore` 覆盖
- [ ] 已删除：`next.config.js`、`next-env.d.ts`、`serwist.config.js`、`eslint.config.mjs`、`public/_headers`、`.next/`、`out/`

**收尾**：更新 `DEVELOPMENT_ROADMAP.md` 的技术栈表格（当前写的是 Next.js 16 / Turbopack / ESLint），以及 `README.md`、`docs/DEPLOY.md` 里所有 pnpm / Next / Cloudflare Pages 的表述。
