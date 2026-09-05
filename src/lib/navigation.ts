import {
  useNavigate,
  useLocation,
  useSearchParams as useRouterSearchParams,
  useParams as useRouterParams,
} from 'react-router'
import { useMemo } from 'react'

/**
 * 导航适配层：向调用方保持 Next.js App Router 的签名，内部由 React Router 实现。
 *
 * 这是一层有意保留的适配，用于把框架迁移的改动面收敛到 import 路径。
 * 已核实全仓库无 router.refresh() / router.prefetch() 调用点，
 * 这两个方法仅为签名完整性保留。
 */
export function useRouter() {
  const navigate = useNavigate()
  // 必须 useMemo：返回对象曾经是每次渲染都新建的字面量，identity 不稳定。
  // 调用方（如 ProtectedRoute）把 router 放进 useEffect 依赖数组，新
  // identity 会让 effect 每次渲染都重新触发一次 navigate()，navigate 又
  // 引发重渲染 —— 形成死循环（已实测复现：约 2200 次/秒被中止的
  // /__manifest 请求，未登录用户永远到不了 /app/login）。
  //
  // 这里 useMemo 依赖 [navigate] 是否有效，取决于 react-router 的
  // useNavigate() 在本仓库实际路由模式下是否 identity 稳定 —— 不能假设，
  // 已核实：本仓库是 React Router 8 Framework Mode（@react-router/dev +
  // src/app/routes.ts + entry.client.tsx 用 HydratedRouter），走的是 data
  // router 分支，见 node_modules/react-router/dist/development/lib/hooks.js
  // 的 useNavigate()：isDataRoute 为 true 时用 useNavigateStable()，其
  // useCallback 依赖是 [router, id] —— router 是全局单例，id 是当前路由
  // 在路由表里的静态 id，同一组件在同一匹配路由下重渲染时两者都不变。
  // （对比：非 data-router 分支的 useNavigateUnstable() 依赖包含
  // locationPathname，一导航就变——命名本身就说明了这一点。）已用独立诊断
  // 测试实测验证：用与本文件测试相同的 createMemoryRouter + RouterProvider
  // 搭建组件，连续触发 4 次重渲染，useNavigate() 返回的函数引用全程相同。
  return useMemo(
    () => ({
      push: (href: string) => { void navigate(href) },
      replace: (href: string) => { void navigate(href, { replace: true }) },
      back: () => { void navigate(-1) },
      forward: () => { void navigate(1) },
      refresh: () => { void navigate('.', { replace: true }) },
      prefetch: () => {},
    }),
    [navigate],
  )
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
