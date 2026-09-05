import type { MetaFunction } from 'react-router'
import DownloadsPage from '@/features/downloads/components/DownloadsPage'
import { mergeMeta } from '@/lib/meta'

export const meta: MetaFunction = ({ matches }) =>
  mergeMeta(matches, [
    { title: 'Downloads - Huanvae' },
    { name: 'description', content: 'Download Huanvae for Windows, macOS, Linux, and Android.' },
  ])

export default function Downloads() {
  return <DownloadsPage />
}
