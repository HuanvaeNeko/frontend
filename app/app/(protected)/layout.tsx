import type { Metadata } from 'next'
import ProtectedLayoutClient from './ProtectedLayoutClient'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <ProtectedLayoutClient>{children}</ProtectedLayoutClient>
}
