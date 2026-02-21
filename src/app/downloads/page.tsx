import DownloadsPage from '@/features/downloads/components/DownloadsPage'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Downloads - Huanvae',
  description: 'Download Huanvae for Windows, macOS, Linux, and Android.',
}

export default function Page() {
  return <DownloadsPage />
}