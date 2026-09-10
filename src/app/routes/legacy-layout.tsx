import { Outlet } from 'react-router'
import MainLayout from '@/components/layout/MainLayout'

export default function LegacyLayout() {
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  )
}
