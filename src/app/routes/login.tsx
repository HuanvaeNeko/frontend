import SimpleLoading from '@/components/common/SimpleLoading'
import { dynamic } from '@/lib/dynamic'

const LoginPage = dynamic(() => import('@/features/auth/components/LoginForm'), {
  loading: () => <SimpleLoading />,
})

export default function Login() {
  return <LoginPage />
}
