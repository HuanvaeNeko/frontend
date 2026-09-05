import type { MetaFunction } from 'react-router'
import { Outlet } from 'react-router'
import { mergeMeta } from '@/lib/meta'

export const meta: MetaFunction = ({ matches }) =>
  mergeMeta(matches, [
    { name: 'robots', content: 'noindex, nofollow, noarchive' },
    { name: 'googlebot', content: 'noindex, nofollow, noimageindex' },
  ])

export default function AuthLayout() {
  return <Outlet />
}
