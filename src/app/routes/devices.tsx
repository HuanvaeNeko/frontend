import { dynamic } from '@/lib/dynamic'

const DevicesPage = dynamic(() => import('@/features/settings/components/DevicesPage'))

export default function Devices() {
  return <DevicesPage />
}
