'use client'

import dynamic from 'next/dynamic'

const LoginPage = dynamic(() => import('@/views/Login'), { ssr: false })

export default function Login() {
  return <LoginPage />
}
