'use client'

import dynamic from 'next/dynamic'
import SimpleLoading from '@/components/SimpleLoading'

const LoginPage = dynamic(() => import('@/features/auth/components/LoginForm'), { 
  ssr: false,
  loading: () => <SimpleLoading />
})

export default function Login() {
  return <LoginPage />
}
