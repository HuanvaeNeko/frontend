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
