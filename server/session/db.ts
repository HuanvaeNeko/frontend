import { SESSION_SCHEMA_SQL } from './sql'

/** `bun:sqlite` 与 `node:sqlite` 的交集，只用这三个方法 */
export interface SqliteLike {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    run(...params: unknown[]): { changes?: number | bigint }
  }
  exec(sql: string): void
  close(): void
}

/**
 * 变量说明符 + `@vite-ignore`：**故意**让 Rolldown 无法静态分析这两个 import。
 *
 * 路由模块（`src/app/routes/api.$.ts` 等）会经本文件间接引到 sqlite，而它们进的是
 * SSR bundle。写成静态 `import { Database } from 'bun:sqlite'` 的话，
 * `react-router dev`（其 bin 是 `#!/usr/bin/env node`，跑在 Node 下）在构建
 * 依赖图时就会去解析 `bun:sqlite` 并失败。反过来写死 `node:sqlite`，生产的 Bun
 * 运行时又拿不到最优实现。用变量说明符把解析推到运行时，两端各取所需。
 */
const runtimeImport = (specifier: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ specifier)

/** Bun 与 Node 的 sqlite 类名不同，构造后的实例形状才是一致的 */
export async function openDatabase(path: string): Promise<SqliteLike> {
  const isBun = typeof process !== 'undefined' && Boolean(process.versions?.bun)
  const mod = await runtimeImport(isBun ? 'bun:sqlite' : 'node:sqlite')
  const Ctor = (isBun ? mod.Database : mod.DatabaseSync) as new (p: string) => SqliteLike

  const db = new Ctor(path)
  // WAL：读写不互斥。生产是单进程，但 dev 下 Vite 进程与 SSR 模块可能各持一份连接。
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SESSION_SCHEMA_SQL)
  return db
}
