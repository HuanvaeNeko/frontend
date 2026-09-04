# Spike 验证结论：Vite 8 + React Router 8 技术骨架

**状态**：四项验证全部完成，结论明确，可指导 Task 6 / 8 / 9 实现。
**骨架位置**：会话 scratchpad 下的临时目录，验证完毕已删除（未落入仓库，仓库内只新增本文件）。
**验证方式**：真实 `bun install` + `bun run react-router dev` / `build`，逐项 grep/检查产物；不是纸面调研。

## 0. 验证环境与最终锁定版本

Bun 1.3.14，Node v25.1.0（Bun runtime 内建），darwin-arm64。

以下版本为 `bun add` 后**实际解析安装**的版本（已锁定进 spike 骨架的 lockfile，供 Task 6/8/9 对照;仓库正式迁移时以此为准，除非另有说明）：

| 包 | 声明范围（本次验证用） | 实际解析版本 | 说明 |
|---|---|---|---|
| react | `^19.2.4` | **19.2.8** | 见 §5 footnote：必须用 caret range，不能精确锁 19.2.4 |
| react-dom | `^19.2.4` | **19.2.8** | 同上 |
| react-router | `^8.3.1` | **8.3.1** | peer 要求 `react: ">=19.2.7"` |
| @react-router/dev | `^8.3.1` | **8.3.1** | peer `vite: "^7.0.0 \|\| ^8.0.0"`（已验证过的事实，非本次新发现） |
| @react-router/node | `^8.3.1` | **8.3.1** | |
| vite | `^8.2.2` | **8.2.2** | 依赖 `rolldown@~1.2.4`、`lightningcss`；**不依赖 `rollup`** |
| @vitejs/plugin-react | `^6.1.1` | **6.1.1** | peer `vite: "^8.0.0"`；三个 exotic peer 均 optional（已验证过的事实） |
| typescript | `^5.9.3` | **5.9.3** | |
| @serwist/vite | `^9.5.12` | **9.5.12** | 见 §2，**默认不可用，有具体原因** |
| serwist | `^9.5.6` | **9.5.12** | |
| vite-plugin-pwa | `1.3.0`（本次新增，非原始清单版本，见 §2 结论） | **1.3.0** | peer `vite: "... \|\| ^8.0.0"`，显式包含 Vite 8 |
| @sentry/react-router | `^10.73` | **10.73.0** | peer `react-router: "7.x \|\| ^8.x"`，**显式**声明 8.x，不是开放区间 |
| isbot | 由 `@react-router/dev` 自动加入 | **5.2.2** | dev server 首次启动时自动写入 package.json，属正常行为 |

**全量联合安装无 peer 警告**：把上表全部包放进同一个 `package.json` 后执行 `rm -rf node_modules bun.lock && bun install`（425 packages），输出中**没有任何一行 peer 相关警告**。唯一提示是：

```
Blocked 1 postinstall. Run `bun pm untrusted` for details.
```

`bun pm untrusted` 显示这是 `@sentry/cli@2.58.6` 的 `postinstall`（下载 sentry-cli 二进制，用于 source map 上传），与框架兼容性无关，是 Bun 对未知 postinstall 脚本的默认安全拦截。**Task 9（或负责 CI/构建的任务）需要注意**：正式仓库里如果要在构建时自动上传 source map，需要 `bun pm trust @sentry/cli`（或在 `bunfig.toml` 里加信任项），否则 sentry-cli 二进制不会被下载,`@sentry/vite-plugin` 的上传步骤会失败或跳过。这不影响 SDK 本身的初始化和运行时行为（见 §3）。

---

## 1. 验证①：Vite 8 + RR8 + plugin-react@6 dev server / SSR

**结论：通过，无保留。** 用以下四个文件即可跑通:

`react-router.config.ts`：
```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
```

`vite.config.ts`（最小形态）：
```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
});
```

`app/routes.ts`：
```ts
import { type RouteConfig, index } from "@react-router/dev/routes";

export default [index("routes/home.tsx")] satisfies RouteConfig;
```

`app/root.tsx` 用标准 RR `Layout` + `Outlet` 写法（`Links`/`Meta`/`Scripts`/`ScrollRestoration` 均从 `react-router` 顶层导出，签名与 RR7 一致）。

**验证命令与结果**：
```
$ bun run react-router dev
[restart] Relaunching with NODE_OPTIONS: --conditions=development
adding `isbot@5` to your package.json, you should commit this change
  ➜  Local:   http://localhost:5173/

$ curl -s http://localhost:5173/ | grep -o '<div id="spike-marker">.*</div>'
<div id="spike-marker"><h1>RR8 + Vite 8 SSR spike</h1><p>...</p></div>
```

`curl` 拿到的 HTML 里含真实渲染内容（route 组件里的文字），不是空壳 `<div id="root"></div>` —— 证明是服务端渲染出来的，不是纯客户端注水。dev server 启动日志和终端全程**没有任何 peer 警告或 error**。

**额外验证**：生产构建（`bun run react-router build`）同样零警告零错误，产出标准的 `build/client/`（客户端资源 + `.vite/manifest.json`）与 `build/server/index.js`（SSR 入口，内联了自己的 manifest，见 §2 的重要副作用说明）。

**对 Task 6/8/9 的影响**：这一层是地基，其余三项都是在此基础上叠加验证的，不需要额外动作。

---

## 2. 验证②：`@serwist/vite` 能否在 Vite 8 下构建出可注册的 SW

**结论：`@serwist/vite@9.5.12` 默认配置下产出物路径是错的，不能直接用。存在一个可用的规避写法，但它依赖未公开的内部行为且有副作用。综合评估后，推荐 Task 8 改用 `vite-plugin-pwa@1.3.0`（`injectManifest` 模式）—— 已在本 spike 中验证跑通，用的是插件自己文档化的公开配置项，没有任何 hack。**

### 2.1 `@serwist/vite` 默认行为：产物路径错误（不是构建报错）

用文档里最直觉的写法：

```ts
import { reactRouter } from "@react-router/dev/vite";
import { serwist } from "@serwist/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    reactRouter(),
    serwist({
      swSrc: "app/sw.ts",
      swDest: "sw.js",
      globDirectory: "build/client",
    }),
  ],
});
```

`bun run react-router build` **退出码是 0，没有报错**，但产物落在了错误的位置：

```
$ ls -la build/client/sw.js
ls: build/client/sw.js: No such file or directory

$ find dist -type f
dist/sw.js          # 实际落点，在项目根目录的 dist/，不在 build/client/ 下
```

**根因（已读源码确认，不是猜测）**：`@serwist/vite@9.5.12` 的 `dist/index.mjs` 里，SW 输出路径的计算方式是：

```js
swDest: path.resolve(viteConfig.root, viteConfig.build.outDir, swDest)
```

它读的是 Vite **单一顶层** `build.outDir`。而 `@react-router/dev@8.3.1` 的 Vite 插件用的是 Vite 8 的 **Environment API**，client 和 ssr 各自有独立的 `outDir`（`environments.client.build.outDir` = `build/client`，`environments.ssr.build.outDir` = `build/server`），**不写顶层 `build.outDir`**——所以顶层 `build.outDir` 保持 Vite 的默认值 `"dist"`，`@serwist/vite` 读到的就是这个默认值。这不是 Rolldown 内核本身的问题，是 `@serwist/vite` 还没适配 RR8/Vite 8 这套按 environment 分别配置 outDir 的新模型。

### 2.2 存在的规避写法（记录在案，但不建议作为长期方案）

在 `vite.config.ts` 顶层显式加一个 `build.outDir`：

```ts
export default defineConfig({
  build: { outDir: "build/client" },   // 强制顶层 outDir，供 @serwist/vite 读取
  plugins: [reactRouter(), serwist({ swSrc: "app/sw.ts", swDest: "sw.js", globDirectory: "build/client" })],
});
```

验证结果：`build/client/sw.js` 确实正确生成了（46KB，内容含真实 precache manifest）。**但有一个确认的副作用**：完整构建跑完后，`build/client/.vite/manifest.json` 不再落盘（构建日志里声称写了 `1.20 kB`，但实际文件系统里没有）——推测是 `@serwist/vite` 在共享的 `build/client` 目录里又跑了一次内部 `vite.build()`（每次 `react-router build` 会看到它跑两次，一次挂在 client 环境的构建钩子，一次挂在 ssr 环境的构建钩子），这个嵌套构建把之前生成的 `.vite/manifest.json` 冲掉了。

**已验证这个副作用目前不影响 RR8 的 SSR 渲染**：`build/server/index.js` 并不在运行时读取磁盘上的 `.vite/manifest.json`，而是在构建期把 manifest 内联进了一个虚拟模块（`server_manifest_default`），SSR 渲染时用的是这份内联数据。但这依然是一个没有文档支撑、只能靠读源码验证的行为组合，且额外让每次 `build` 多跑两次 SW 子构建（增加构建时间）。**不建议把 169 个文件的迁移建立在这种未公开行为上**——尤其 `@serwist/vite`/`@react-router/dev` 任一方后续小版本调整内部实现，这个 workaround 随时可能失效或产生新的副作用。

### 2.3 推荐方案：`vite-plugin-pwa@1.3.0`（`injectManifest` 模式），已验证跑通

```
$ bun add -d vite-plugin-pwa@1.3.0
installed vite-plugin-pwa@1.3.0
# peerDependencies: { "vite": "^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0", ... }
# 显式包含 ^8.0.0，不是开放区间
```

`vite.config.ts`：
```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    reactRouter(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "app",
      filename: "sw.ts",        // 建议直接用 sw.ts，与现有文件同名；spike 里用 sw-pwa.ts 是为了和 §2.1/2.2 的产物区分
      outDir: "build/client",   // 公开、文档化的配置项，不依赖内部行为
      injectRegister: false,    // 项目自己手动注册 SW（沿用现有注册逻辑），不用插件生成的注册脚本
      manifest: false,          // 项目已有自己的 web manifest 处理方式，不用插件生成
      injectManifest: {
        globDirectory: "build/client",
      },
    }),
  ],
});
```

`app/sw.ts`（workbox 版本的最小骨架，precache 部分，不含仓库现有的过滤逻辑；含过滤逻辑的完整版本见 §2.4 "改动后完整代码"）：
```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
```

验证结果：
```
PWA v1.3.0
mode      injectManifest
format:   es
precache  5 entries (307.81 KiB)
files generated
  build/client/sw-pwa.js

$ ls -la build/client/sw-pwa.js
-rw-r--r-- 1 ... 15839 ... build/client/sw-pwa.js   # SW 构建 OK

$ grep -o "entry.client-[A-Za-z0-9]*\.js" build/client/sw-pwa.js
entry.client-CZKaGQzE.js   # 证明 precache manifest 真的注入了构建产物的哈希文件名，不是空壳
```

正确落在 `build/client/` 下，用的是插件自己文档化的 `outDir` 选项，**没有用任何未公开行为**。

**唯一观察到的告警**（不影响构建结果，`build/client/sw-pwa.js` 仍正确生成）：
```
WARN  inlineDynamicImports option is deprecated, please use codeSplitting: false instead.
```
这是 `vite-plugin-pwa@1.3.0` 内部给它自己的 SW 子构建传的 Rollup 风格选项名（`inlineDynamicImports`），Rolldown 认得这个名字但标记为过时,建议改用 `codeSplitting: false`。这是 Rolldown 内核切换后真实存在的一处生态摩擦，**但只是 warning，不阻塞构建**，Task 8 实现时可以先忽略，如果 `vite-plugin-pwa` 后续版本修掉这个警告更好。

同样确认了 `build/client/.vite/manifest.json` 磁盘持久化的副作用（§2.2 描述的现象）在 `vite-plugin-pwa` 下**同样存在**——说明这不是某个插件独有的 bug,而是"任何在 RR8 Environment API 的同一个 `outDir` 下再跑一次嵌套 Vite 构建"的插件都会触发的通用现象。同样已确认对 RR8 SSR 无实际影响（原因见 §2.2）。

### 2.4 `sw.ts` 从 Serwist 迁移到 Workbox(`injectManifest`) 的具体改动点

已读过仓库现有的 `src/app/sw.ts`（184 行），逐项对照：

| 现有写法（Serwist） | 需要改成的写法（vite-plugin-pwa / Workbox） | 改动量 |
|---|---|---|
| `import { defaultCache } from '@serwist/next/worker'` | 无直接等价物；`workbox` 没有现成的"默认缓存策略集合"。需要用 `workbox-routing` 的 `registerRoute()` + `workbox-strategies`（`StaleWhileRevalidate`/`NetworkFirst` 等）手写等价的运行时缓存规则，或先跳过运行时缓存只做 precache（现有 `defaultCache` 具体策略需要在 Task 8 里对照 Serwist 源码手工搬） | 中，需要新写代码 |
| `new Serwist({ precacheEntries, skipWaiting: false, clientsClaim: false, navigationPreload: true, runtimeCaching: defaultCache, fallbacks: {...} })` + `serwist.addEventListeners()` | 拆成：`precacheAndRoute(precacheEntries)`（workbox-precaching）+ 按需 `enable()`（workbox-navigation-preload）+ 手写的 `registerRoute` 规则 + `setCatchHandler()`（workbox-routing，替代 `fallbacks.entries` 里 `/~offline` 的逻辑） | 中，逻辑等价但 API 形状不同 |
| `import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'`（第 6 行）+ `declare global { interface WorkerGlobalScope extends SerwistGlobalConfig { __SW_MANIFEST: (PrecacheEntry \| string)[] \| undefined } }`（第 10-14 行） | **整个 `declare global` 块直接删除，不需要任何替代物**。`import` 改成 `import type { PrecacheEntry } from 'workbox-precaching'`（`PrecacheEntry` 由 `workbox-precaching` 定义并从包入口导出，结构等价：`{ url: string; revision?: string \| null; integrity?: string }`）。`SerwistGlobalConfig` 没有等价物需要引入——`workbox-precaching` 自带的类型声明已经用 `declare global` 把 `ServiceWorkerGlobalScope.__WB_MANIFEST: Array<PrecacheEntry \| string>` 挂到全局了，文件里只要有一处 `import ... from 'workbox-precaching'`，`self.__WB_MANIFEST` 就自动类型正确，不需要手写扩展（已与 `vite-plugin-pwa` 官方 injectManifest 示例代码交叉核对：示例里 `self.__WB_MANIFEST` 直接可用，没有任何手写的全局类型声明）。 | 删除，不替换 |
| `const precacheEntries = (self.__SW_MANIFEST ?? []).filter(...)`（第 43-45 行）里的 `self.__SW_MANIFEST` | **必须重命名为 `self.__WB_MANIFEST`**——这是整个迁移里最容易被漏改、后果最隐蔽的一处。`self.__SW_MANIFEST` 是 Serwist 专有全局变量名；`vite-plugin-pwa` 的 `injectManifest` 策略只注入 `self.__WB_MANIFEST`，与本文档 §2.3 骨架示例 `precacheAndRoute(self.__WB_MANIFEST)` 用的是同一个变量。**如果只替换了 API（`new Serwist` → `precacheAndRoute`）却漏改这个变量名**：`self.__WB_MANIFEST` 从未被读取，`self.__SW_MANIFEST` 是 `undefined`，`?? []` 把它静默换成空数组，`shouldSkipPrecache` 在空数组上跑不会报错，`precacheAndRoute([])` 同样不报错、SW 照常 install/activate——**没有构建错误、没有 console 错误，只有生产环境离线缓存 0 个文件生效**，代码走查也很难肉眼发现。改动后的完整代码见本节末尾"改动后完整代码"。 | **改动小但风险高**：漏改 = 静默清零 precache |
| `PRECACHE_SKIP_PATTERNS` 数组的内容（第 20-27 行，6 个字符串常量） | 过滤**机制**（`filter()` + `path.includes(pattern)`）原样保留，但**列表内容不能原样保留**。现有 6 项里 `_buildManifest.js`、`_ssgManifest.js`、`_clientMiddlewareManifest.json`、`/_global-error` 这 4 项是 Next.js 构建产物 / App Router 保留路由的命名（`_buildManifest.js`/`_ssgManifest.js` 是 Next.js webpack/turbopack 产物，`_clientMiddlewareManifest.json` 是 Next.js middleware 产物，`/_global-error` 是 Next.js App Router 保留路由名），RR8 + Vite 构建不会产生任何一个同名文件，必须删除。剩下 `/_headers`（部署平台 headers 配置约定）和 `/version.json`（项目自定义版本文件）跟 Next.js↔RR8 框架切换本身无关，是否保留取决于项目当前部署流程是否仍产出这两个文件，需要 Task 8 单独确认，不能假定跟着 Next.js 一起淘汰。**Task 8 必须实际跑一次 `bun run react-router build`，检查 `build/client/` 目录的真实产物文件名（尤其是任何构建期生成、可能在部署后 404 的文件），据此重新列出这个数组，不能直接照抄现有 6 项。** | 机制不变，**列表内容必须重新调研** |
| `skipWaiting: false` + 自定义 `message` 监听器里的 `SKIP_WAITING` 分支 | **原样保留**——这是标准 `self.addEventListener('message', ...)`，与 Serwist/Workbox 无关（注意：这部分是最近两次 commit 刚改过的逻辑，见仓库 log，属于脆弱区，Task 8 要单独回归测试） | 不变 |
| `event.ports[0]?.postMessage({ version: 'serwist' })`（第 163-165 行，`GET_VERSION` 消息分支）和 `console.log('[SW] Serwist Service Worker 已加载')`（第 184 行，文件末尾顶层语句） | 两处都是残留的 Serwist 字面量字符串，逻辑结构本身不受迁移影响，但内容需要同步改掉，否则迁移完成后这两处仍然自称"serwist"，误导后续调试排查。建议：`version: 'serwist'` → `version: 'workbox'`（或项目约定的其他版本标识，只要不再是 `'serwist'`）；`'[SW] Serwist Service Worker 已加载'` → `'[SW] Service Worker 已加载'`（去掉 Serwist 字样即可；不建议改成 "Workbox Service Worker"，因为文件里除了 precache 部分还有大量与 Workbox 无关的自定义逻辑）。 | 极小，纯文案，但必须记得改 |
| `push` / `notificationclick` / `notificationclose` / `sync` 事件监听器（约占文件一半篇幅） | **原样保留**，全部是标准 Service Worker API，不依赖 Serwist | 不变 |

**改动后完整代码（precache 过滤部分，对应现有 `src/app/sw.ts` 第 1-45 行，含上表前四行的改动）**：

```ts
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { precacheAndRoute, type PrecacheEntry } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// 过滤掉部署后可能 404 的 URL，避免 bad-precaching-response 导致 SW 安装失败
// （/~offline 有对应页面且需被 fallback 使用，故不排除）
// 以下列表是占位示例，Task 8 必须对照 RR8 实际构建产物重新调研
// （见上表 "PRECACHE_SKIP_PATTERNS 数组的内容" 一行，不能直接照抄）
const PRECACHE_SKIP_PATTERNS = [
  "/_headers",
  "/version.json",
];

function getPath(entry: PrecacheEntry | string): string {
  const url = typeof entry === "string" ? entry : entry.url;
  try {
    return url.startsWith("http") ? new URL(url).pathname : url;
  } catch {
    return url;
  }
}

function shouldSkipPrecache(entry: PrecacheEntry | string): boolean {
  const path = getPath(entry);
  return PRECACHE_SKIP_PATTERNS.some((p) => path.includes(p));
}

// 关键改动：self.__SW_MANIFEST（Serwist 专有全局变量）→ self.__WB_MANIFEST
// （vite-plugin-pwa / Workbox 注入的全局变量，与本文档 §2.3 骨架一致）
const precacheEntries = (self.__WB_MANIFEST ?? []).filter(
  (e) => !shouldSkipPrecache(e)
);

precacheAndRoute(precacheEntries);
```

这段代码与 §2.3 的最小骨架（`precacheAndRoute(self.__WB_MANIFEST)`）是同一件事的两个粒度：§2.3 演示"最小配置能否跑通"，本节演示"仓库现有的 45 行过滤逻辑套进 vite-plugin-pwa 之后长什么样"——两者读取的是同一个全局变量 `self.__WB_MANIFEST`，不存在冲突，也不要在两处使用不同的变量名。

**结论对 Task 8 的具体指导**：`sw.ts` 里大约一半的代码（推送通知、通知点击、后台同步、自定义 message 处理）完全不用动。需要改动的地方有五处，缺一不可：

1. 文件开头 Serwist 实例化那一段（约 20-30 行）——`defaultCache` 的运行时缓存策略用 `workbox-strategies`/`workbox-routing` 手工重建，`fallbacks.entries` 的离线兜底页逻辑用 `setCatchHandler` 重写。
2. `self.__SW_MANIFEST` → `self.__WB_MANIFEST` 的重命名（见上表"`self.__SW_MANIFEST`"一行）——**这是最容易被漏改、失败方式最隐蔽的一处，务必单独检查**，漏改不会报错，只会让生产环境 precache 静默清零。
3. 类型导入：删除 `import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'` 和 `declare global {...}` 块，改成 `import type { PrecacheEntry } from 'workbox-precaching'`（见上表"类型声明"一行）。
4. `PRECACHE_SKIP_PATTERNS` 列表内容按 RR8 真实构建产物重新调研，不能照抄现有 6 项（见上表"`PRECACHE_SKIP_PATTERNS` 数组的内容"一行）。
5. 两处残留的 `'serwist'` 字面量文案改掉（见上表最后一行）。

需要新增的 devDependencies：`workbox-precaching`、`workbox-routing`、`workbox-strategies`、`workbox-navigation-preload`(按实际用到的模块显式加,不要依赖 `vite-plugin-pwa` 传递依赖里恰好带了 `workbox-build`/`workbox-window` 这件事——那两个是构建期工具包，不保证暴露 `workbox-precaching` 这类运行时子包作为可直接 import 的直接依赖)。

---

## 3. 验证③：`@sentry/react-router` 能否在 RR8 下初始化

**结论：通过,无保留。`@sentry/react-router@10.73.0` 的 `package.json` 明确写着 `peerDependencies: { "react-router": "7.x || ^8.x" }`——是显式支持 RR8,不是开放区间,brief 里"文档主要针对 v7"的担忧在这个版本上不成立。**

**验证方式**：`app/entry.client.tsx` 覆盖 RR8 默认的客户端入口（RR8 不写这个文件时会用 `@react-router/dev` 内置的默认入口，写法是标准的 `hydrateRoot` + `HydratedRouter`）：

```tsx
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import * as Sentry from "@sentry/react-router";

Sentry.init({
  dsn: "",
  integrations: [Sentry.reactRouterTracingIntegration()],
  tracesSampleRate: 1.0,
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
```

**验证结果**：
- `bun add @sentry/react-router@^10.73` 解析安装 10.73.0，**无 peer 警告**（只有前述 `@sentry/cli` postinstall 被 Bun 拦截的提示，与兼容性无关）。
- dev server 启动无报错;用浏览器打开页面,`read_console_messages` 确认只有 debug/info/log 级别输出,`Sentry.init` 调用后紧跟的自定义日志正常打印,**没有任何 error 级别的控制台输出**,没有 React hydration mismatch。
- 生产构建（`bun run react-router build`，走的是 Rolldown 而不是 dev 时的 esbuild 预打包）同样零错误，`build/client/assets/entry.client-*.js` 从不含 Sentry 时的 186KB 增长到 338KB，`grep -l "Sentry"` 命中，证明 SDK 被正确打包进最终产物，不只是 dev 模式能跑。

**API 确认**（读的是实际安装包的类型声明，不是记忆）：`@sentry/react-router` 用条件导出区分浏览器端（`index.client.js`，`export * from '@sentry/browser'` + `@sentry/react` 的 `ErrorBoundary`/`Profiler` 等）和 Node 端（`index.server.js`），同一个 `import * as Sentry from "@sentry/react-router"` 语句在两端解析到不同实现——与目前 `@sentry/nextjs` 的使用心智模型一致，不需要额外条件判断。

**对 Task 6 的具体指导**：现有 `src/config/sentry.ts` 的 `initSentry()` 用到的 `Sentry.browserTracingIntegration()`、`Sentry.replayIntegration()`、`beforeSend`、`ignoreErrors`、`tracesSampleRate`、`replaysSessionSampleRate` 等字段全部来自 `@sentry/browser`/`@sentry/react` 标准 API,`@sentry/react-router` 的 client 导出用 `export * from '@sentry/browser'` 全量转发,**这些配置字段原样保留即可**,只需要:
1. 顶层 `import * as Sentry from '@sentry/nextjs'` 改成 `import * as Sentry from '@sentry/react-router'`。
2. `integrations` 数组里加一项 `Sentry.reactRouterTracingIntegration()`，替代 `@sentry/nextjs` 原本自动做的路由级 instrumentation（RR8 不会自动做，需要显式加这个 integration，本 spike 已验证它能正常初始化）。
3. 服务端如果现在有单独的 Sentry 初始化（本仓库目前没有独立的 `sentry.server.config.ts`，只有一个统一入口），Task 6 需要确认 `initSentry()` 在 SSR entry（`app/entry.server.tsx`）里是否也要调用一次 server 端的 `Sentry.init`——`@sentry/react-router` 的 server 导出走的是 `index.server.js`（Node 条件），本 spike 未验证 server 端 init（brief 范围是"能在 RR8 下初始化"，验证的是最常见的踩坑点即 client 端与路由集成；server 端是同一个包的 Node 导出，风险显著更低，但如果 Task 6 要做完整验证，建议同样起一次 dev server 并确认 `app/entry.server.tsx` 里调用 server 端 `Sentry.init` 不报错）。

**不需要走 brief 预设的降级方案**（`@sentry/react` + `@sentry/node` 手工接线）——`@sentry/react-router` 本身就验证通过了。

---

## 4. 验证④：console 剥离——只删 `console.log`，保留 `console.error`/`console.warn`

**结论：Vite 8 原生 `oxc` 方案（方案 A）可以精确做到，已验证。不需要引入 `terser`。**

### 4.1 已验证可用的配置（方案 A，推荐，Task 9 直接抄这段）

```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  build: {
    minify: "oxc", // Vite 8 client 构建的默认值，这里显式写出便于自文档化
    rolldownOptions: {
      output: {
        minify: {
          compress: {
            dropConsole: false, // 显式关闭"全量删除 console.*"这个开关——这才是 brief 里明确禁止的 drop:['console'] 等价物
            treeshake: {
              manualPureFunctions: ["console.log"], // 只把 console.log 标记为可安全消除的纯函数调用
            },
          },
        },
      },
    },
  },
});
```

**关键点**：`build.rollupOptions`/`build.rolldownOptions`（后者是新名字，前者是保留的兼容别名，两者等价，指向同一个 Rolldown `RolldownOptions` 类型）是 Vite 8 把配置透传给 Rolldown 自身的正式公开入口（Vite 官方类型声明原文:`Will be merged with internal rolldown options. https://rolldown.rs/reference/Interface.RolldownOptions`），不是黑话或未公开行为。`compress.dropConsole` 就是 brief 里说的"`drop: ['console']` 全量删除"在 oxc/Rolldown 里的等价开关——**必须显式设成 `false`**（虽然默认值本来就是 `false`，但显式写出是为了防止未来 Rolldown/Vite 改默认值导致行为悄悄回退）。真正做精确剥离的是 `compress.treeshake.manualPureFunctions`：把指定的函数调用标记为"无副作用"，当调用结果未被使用时（`console.log(x)` 作为独立语句正是这种情况）,整条语句会被当成死代码消除掉；`console.warn`/`console.error` 不在这个列表里，不受影响。

### 4.2 验证方式与证据

测试代码（`app/routes/home.tsx` 顶层）：
```tsx
if (typeof window !== "undefined") {
  console.log("SPIKE_MARKER_LOG: this should be stripped");
  console.warn("SPIKE_MARKER_WARN: this must survive");
  console.error("SPIKE_MARKER_ERROR: this must survive");
}
```

先做了基线测试（不加任何 minify 配置，Vite 8 默认 `minify: 'oxc'`）：三条 marker 全部原样保留在产物里，确认默认行为不会误删任何东西。

加上 §4.1 的配置后重新构建：
```
$ grep -c "SPIKE_MARKER_LOG" build/client/assets/home-*.js
0
$ grep -c "SPIKE_MARKER_WARN" build/client/assets/home-*.js
1
$ grep -c "SPIKE_MARKER_ERROR" build/client/assets/home-*.js
1

# 产物实际内容（已美化换行,原始是压缩后的单行）：
typeof window < "u" && (
  console.warn("SPIKE_MARKER_WARN: this must survive"),
  console.error("SPIKE_MARKER_ERROR: this must survive")
);
```

`console.log` 那一行连同它的字符串字面量整体消失，`console.warn`/`console.error` 原样保留、顺序不变。**重复构建两次结果一致**（清空 `build/` 目录重新跑），不是偶然命中。

### 4.3 为什么不需要 terser 保底方案

brief 里把 terser 列为"保底方案"，前提是方案 A 做不到精确保留。本 spike 已经证明方案 A 能做到精确保留，所以**不建议引入 terser**：会多一个 devDependency，且 terser 是纯 JS 实现，压缩速度显著慢于 Rolldown 原生的 Rust `oxc` minifier（本 spike 未做正式 benchmark，但 Rolldown/oxc 生态的定位就是替代 terser/esbuild 压缩速度）。如果 Task 9 实现时发现 §4.1 配置在真实项目代码库上有边界情况（比如某些 `console.log` 调用因为参数有副作用而没被消除——`manualPureFunctions` 只保证"调用本身"被视为纯,不会分析参数表达式的副作用,如果参数里有 `console.log(doSomethingWithSideEffect())` 这种写法,函数调用消除有可能连带把参数求值也去掉,这点本 spike 没有单独测试参数带副作用的场景),再退回 terser 方案，配置照抄 brief 原文即可：
```ts
build: {
  minify: "terser",
  terserOptions: { compress: { pure_funcs: ["console.log"] } },
}
```

**对 Task 9 的具体指导**：直接用 §4.1 的配置块，不用额外调研或试验。验收标准维持 brief 定的"以行为为准"——生产构建产物 grep 不到 `console.log` 调用、`console.error`/`console.warn` 都在。

---

## 5. 综合结论与已知风险

| # | 验证项 | 结论 | 采用方案 |
|---|---|---|---|
| ① | Vite 8 + RR8 + plugin-react@6 SSR | **通过** | 按 §1 标准写法，无需变通 |
| ② | `@serwist/vite` 构建 SW | **默认不可用**（产物路径错误，非报错）；存在有效但依赖内部行为的规避写法 | **推荐改用 `vite-plugin-pwa@1.3.0`（injectManifest）**，已验证跑通，配置见 §2.3，`sw.ts` 改动范围见 §2.4 |
| ③ | `@sentry/react-router` 初始化 | **通过**，RR8 是显式声明的 peer,不是开放区间 | 按 §3 标准写法，`src/config/sentry.ts` 改动范围见 §3 末尾 |
| ④ | console 剥离精确保留 error/warn | **通过**，Vite 8 原生 `oxc` 方案即可，不需要 terser | 按 §4.1 配置块直接抄 |

**footnote（react/react-dom 版本范围）**：`react-router@8.3.1` 的 `peerDependencies` 是 `react: ">=19.2.7"`。如果 Task 5（或任何写 `package.json` 的任务）把 react/react-dom 锁成精确版本 `19.2.4`（brief 给的版本号字面值），会**不满足**这个 peer range。本次验证全程用的是 `^19.2.4`（caret range），解析器实际装的是 `19.2.8`，同时满足"不低于 brief 指定版本"和"满足 react-router 的 peer 要求"两个约束。**写正式 `package.json` 时务必保留 caret，不要精确锁版本。**

**次要发现（不阻塞任何决策，供后续任务参考）**：
- `@serwist/vite@9.5.12` 的类型声明（`.d.mts`）里 `import { RollupOptions } from "rollup"`，但 Vite 8 项目不装真正的 `rollup` 包（只装 `rolldown`）。这在 `skipLibCheck: true` 下（本仓库 `tsconfig.json` 已经是 `true`）不会报错——已经用 `skipLibCheck: false` 复现过一次 `error TS2307: Cannot find module 'rollup' or its corresponding type declarations.` 来确认掩盖关系,确认只要保持现有 `skipLibCheck: true` 不动就没有影响。如果 Task 8 最终选了保留 `@serwist/vite`（而不是本文推荐的 `vite-plugin-pwa`），且未来某个任务想把 `skipLibCheck` 改成 `false` 做更严格的类型检查，需要额外装一个空的 `rollup` 包或做类型 shim 来避免这个报错。选 `vite-plugin-pwa` 则不存在这个问题（其类型声明未见对 `rollup` 包的引用）。
- `vite-plugin-pwa@1.3.0` 会自动拉入 `workbox-build`/`workbox-window` 依赖树（325 个包左右），体积比 `@serwist/vite` 大不少。这是切换方案的真实成本之一，但只影响 devDependencies 体积，不影响生产产物大小。

---

## 附录：完整联合验证（四项叠加在同一份配置里跑通）

为确认四个结论互不冲突，最后额外做了一次全部叠加的构建（Serwist 换成 vite-plugin-pwa + Sentry 接入 entry.client + console 剥离配置，全部在同一个 `vite.config.ts` 里）：

```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    reactRouter(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "app",
      filename: "sw.ts",
      outDir: "build/client",
      injectRegister: false,
      manifest: false,
      injectManifest: { globDirectory: "build/client" },
    }),
  ],
  build: {
    minify: "oxc",
    rolldownOptions: {
      output: {
        minify: {
          compress: {
            dropConsole: false,
            treeshake: { manualPureFunctions: ["console.log"] },
          },
        },
      },
    },
  },
});
```

结果：`bun run react-router build` 退出码 0；`build/client/sw-pwa.js` 生成且含真实 precache manifest；`build/client/assets/entry.client-*.js` 含 Sentry 代码；console 剥离结果与 §4.2 一致（0 / 1 / 1）；随后 `bun run react-router dev` 启动无错误，`curl` 验证 SSR 内容仍然正常渲染。**四项结论在同一套配置下互不冲突，可以放心叠加进 Task 6/8/9 的实现。**

骨架已按 brief 要求删除，未保留在仓库或本地任何持久位置。
