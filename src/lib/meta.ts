import type { MetaDescriptor } from 'react-router'

/**
 * meta 合并适配层。
 *
 * Next App Router 的 metadata 是**继承合并**的：根 layout 的 metadata 与页面
 * metadata 逐字段合并，同名字段由页面覆盖。React Router 的 `<Meta />` 不是这样 ——
 * 它取"最深的、导出了 meta 的那条路由"的返回值**整体覆盖**祖先
 * （见 react-router/dist/development/lib/dom/ssr/components.js 里 `meta = [...routeMeta]`）。
 *
 * 直接照搬会让 `/`、`/downloads` 丢掉根路由的 viewport / theme-color / keywords，
 * 让 `/app/*` 连 `<title>` 都没有 —— 其中 viewport 缺失会直接改变移动端布局宽度。
 * 因此这里显式把祖先的 meta 拼回来，复刻 Next 的覆盖语义。
 */

/** 取 meta 描述符的去重键：title 唯一，其余按 name / property 区分。 */
function metaKey(descriptor: MetaDescriptor): string | null {
  if (typeof descriptor !== 'object' || descriptor === null) return null
  const record = descriptor as Record<string, unknown>
  if (typeof record.title === 'string') return 'title'
  if (typeof record.name === 'string') return `name:${record.name}`
  if (typeof record.property === 'string') return `property:${record.property}`
  return null
}

/**
 * 把祖先路由已计算出的 meta 与本路由的 meta 合并，同名以本路由为准。
 *
 * @param parentMatches meta 函数入参里的 `matches`（祖先项的 `meta` 已填好，本路由项为空数组）
 * @param own 本路由自己的 meta 描述符
 */
export function mergeMeta(
  parentMatches: ReadonlyArray<{ meta: MetaDescriptor[] }>,
  own: MetaDescriptor[],
): MetaDescriptor[] {
  const overridden = new Set(
    own.map(metaKey).filter((key): key is string => key !== null),
  )
  const inherited = parentMatches
    .flatMap((match) => match.meta ?? [])
    .filter((descriptor) => {
      const key = metaKey(descriptor)
      return key === null || !overridden.has(key)
    })
  return [...inherited, ...own]
}
