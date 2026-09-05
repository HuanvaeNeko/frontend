import { dynamic } from '@/lib/dynamic'

const RegisterPage = dynamic(() => import('@/features/auth/components/RegisterForm'))

export default function Register() {
  return <RegisterPage />
}
