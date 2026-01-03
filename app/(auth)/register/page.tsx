'use client'

import dynamic from 'next/dynamic'

const RegisterPage = dynamic(() => import('@/views/Register'), { ssr: false })

export default function Register() {
  return <RegisterPage />
}
