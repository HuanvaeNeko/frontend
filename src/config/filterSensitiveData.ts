/**
 * event.request.data 里 password / token 字段的过滤逻辑，独立成模块。
 *
 * ## 为什么要从 src/config/sentry.ts 里拆出来
 *
 * 这段逻辑原来定义在 src/config/sentry.ts 里，server/index.ts 直接
 * `import { filterSensitiveData } from '../src/config/sentry'` 复用它——
 * 图的是不让"过滤 password/token"这条有安全含义的规则在客户端、服务端各写
 * 一份、日后改一边忘了改另一边。但这样跨端引入的是 sentry.ts 整个模块，会把
 * 它其余 8 处 `import.meta.env.PROD` 判断一起带进服务端运行时：Bun 下
 * `import.meta.env` 就是字面意义上的 `process.env`，没有 Vite 注入的
 * PROD/DEV/MODE 布尔值，所以 `import.meta.env.PROD` 在 server/index.ts 的
 * 运行时里恒为 `undefined`（falsy）。这意味着 sentry.ts 的其余每一个导出——
 * initSentry、captureError、captureMessage、setUser、addBreadcrumb——只要
 * 哪天被服务端代码误用，都会静默地什么也不做：不抛错、不打日志、不告警。
 * `tsc` 也拦不住这个坑：同一行 `import * as Sentry from '@sentry/react-router'`，
 * Node 下解析到 build/esm/index.server.js，Vite 给浏览器打包时解析到
 * index.client.js，是两个物理上不同的模块，但包里只发布了一份不区分运行时的
 * .d.ts，类型层面看不出任何差异。
 *
 * 拆出来之后，这个模块对两边（Vite 客户端打包 / 纯 Bun 服务端直接运行）
 * 行为完全一致，因为它：
 * - 不 import `@sentry/react-router`（也就不可能带出它 Node 导出里那条会
 *   连带加载 React 的静态 re-export 链——这正是 server/index.ts 必须把
 *   Sentry 相关 import 全部动态化、且放在
 *   `process.env.NODE_ENV ??= 'production'` 之后的原因，见 server/index.ts
 *   顶部注释）；
 * - 不引用 `import.meta.env`，所以没有"看起来能调、实际因为环境变量判断
 *   不同而静默 no-op"的分支。
 *
 * ## 为什么放在 src/config/ 而不是新建 shared/ 目录
 *
 * 这个文件本身对运行环境没有任何假设——不碰 import.meta.env、不碰 DOM、
 * 不 import 任何仅浏览器可用的东西，是纯粹可移植的 TS，放在哪个目录都不会有
 * "客户端专属代码泄漏进服务端"的问题。留在 src/config/ 是因为它唯一的两个
 * 调用方之一（sentry.ts）就在这个目录里，按"这是 Sentry 相关配置"的心智
 * 模型能直接找到；没有必要为了区区一个函数新建一层目录。server/index.ts
 * 用相对路径 `../src/config/filterSensitiveData` 引用它，和现有对
 * `../build/server/index.js` 等路径的引用方式保持一致，不依赖"Bun 在运行时
 * 是否支持 tsconfig.json 的 paths（`@/*` 别名）"这个未经验证的前提。
 *
 * ## 为什么用本地最小类型，不 import Sentry.ErrorEvent / Sentry.EventHint
 *
 * 哪怕只是 `import type`，也会让这个模块的类型依赖图里出现
 * `@sentry/react-router`，"对 Sentry 零依赖"这句话就打了折扣，且类型依赖
 * 一旦存在，未来很容易被改成运行时依赖。下面的 SentryEventLike 只声明了这个
 * 函数真正用到的路径（event.request.data），足够让 sentry.ts 和
 * server/index.ts 各自的 `Sentry.init({ beforeSend: filterSensitiveData })`
 * 通过类型检查（真实的 Sentry.ErrorEvent 结构上兼容这个最小形状）。
 */
export interface SentryEventLike {
  request?: {
    data?: unknown
  }
}

/**
 * 过滤敏感信息：从 event.request.data 中移除 password / token 字段。
 *
 * 用 `<T extends SentryEventLike>` 泛型、而不是把参数和返回值都固定标注成
 * SentryEventLike，是为了让调用方传入的具体事件类型（客户端/服务端各自的
 * `Sentry.ErrorEvent`）原样返回，不丢失成这个模块自定义的最小类型——这样
 * 赋值给 `Sentry.init({ beforeSend: filterSensitiveData })` 时，返回类型
 * 仍然精确匹配 Sentry 要求的 `ErrorEvent`，而不需要这个函数自己认识
 * Sentry 的类型。
 *
 * 提取为具名导出（而不是内联匿名函数）是为了让这段有实际安全含义的逻辑
 * 可以被单测直接覆盖，见 __tests__/filterSensitiveData.test.ts。
 */
export function filterSensitiveData<T extends SentryEventLike>(event: T, _hint: unknown): T {
  // 过滤密码等敏感信息
  if (event.request?.data) {
    const data = event.request.data as Record<string, unknown>
    if (data.password) {
      data.password = '[Filtered]'
    }
    if (data.token) {
      data.token = '[Filtered]'
    }
  }

  return event
}
