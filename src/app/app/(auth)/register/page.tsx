'use client'

import dynamic from 'next/dynamic'

const RegisterPage = dynamic(() => import('@/features/auth/components/RegisterForm'), { ssr: false })

export default function Register() {
  return <RegisterPage />
}
