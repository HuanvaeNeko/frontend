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
