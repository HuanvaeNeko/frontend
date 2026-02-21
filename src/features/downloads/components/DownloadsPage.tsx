'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Globe, Laptop, Smartphone, Monitor, HardDrive, Package, Calendar, Info, ArrowLeft } from 'lucide-react'
import { fetchReleaseInfo, type GitHubRelease, PROXY_PREFIX_URL } from '@/lib/appInstall'
import { useI18n } from '@/i18n/I18nProvider'
import { ROUTES } from '@/lib/routes'
import { useRouter } from 'next/navigation'

type OSTab = 'windows' | 'mac' | 'linux' | 'android' | 'web'

function formatBytes(bytes: number, decimals = 1) {
  if (!+bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export default function DownloadsPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<OSTab>('windows')
  const [release, setRelease] = useState<GitHubRelease | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 强制滚动到顶部
    window.scrollTo(0, 0)
    
    // Detect OS
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase()
      const platform = navigator.platform.toLowerCase()
      
      if (platform.includes('win')) {
        setActiveTab('windows')
      } else if (platform.includes('mac')) {
        setActiveTab('mac')
      } else if (platform.includes('linux')) {
        setActiveTab('linux')
      } else if (ua.includes('android')) {
        setActiveTab('android')
      } else if (ua.includes('iphone') || ua.includes('ipad')) {
        setActiveTab('web') // iOS users recommended to use Web
      }
    }

    // Fetch release info
    void fetchReleaseInfo().then((data) => {
      setRelease(data)
      setLoading(false)
    })
  }, [])

  const getDownloadUrl = (url: string) => {
    return locale === 'zh-CN' ? `${PROXY_PREFIX_URL}${url}` : url
  }

  const assets = release?.assets || []
  
  const windowsAssets = assets.filter(a => a.name.endsWith('.exe') || a.name.endsWith('.msi'))
  const macAssets = assets.filter(a => a.name.endsWith('.dmg') || a.name.endsWith('.app.tar.gz'))
  const linuxAssets = assets.filter(a => a.name.endsWith('.AppImage') || a.name.endsWith('.deb') || a.name.endsWith('.rpm') || a.name.endsWith('.snap'))
  const androidAssets = assets.filter(a => a.name.endsWith('.apk'))

  const renderDownloadList = (items: typeof assets, icon: React.ReactNode, primaryExt?: string) => {
    const primary = primaryExt ? items.find(a => a.name.endsWith(primaryExt)) : items[0]
    const others = items.filter(a => a !== primary)

    return (
      <div className="space-y-6">
        {primary && (
          <div className="rounded-xl border bg-gradient-to-br from-sky-50/50 to-white p-6 dark:from-sky-950/20 dark:to-slate-950/50">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className="bg-sky-500 hover:bg-sky-600">Recommended</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{primary.name}</span>
                </div>
                <h4 className="text-lg font-semibold flex items-center gap-2">
                  {icon}
                  {t('landing.download.installer')}
                </h4>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><HardDrive size={12} /> {formatBytes(primary.size)}</span>
                  <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(primary.created_at)}</span>
                  {primary.download_count > 0 && <span className="flex items-center gap-1"><Download size={12} /> {primary.download_count}</span>}
                </div>
              </div>
              <Button size="lg" className="w-full sm:w-auto shadow-lg shadow-sky-500/20" asChild>
                <a href={getDownloadUrl(primary.browser_download_url)} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-5 w-5" />
                  Download
                </a>
              </Button>
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {others.map(asset => (
              <div key={asset.name} className="group relative flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-muted-foreground shrink-0" />
                    <span className="font-medium truncate text-sm" title={asset.name}>{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatBytes(asset.size)}</span>
                    <span>{formatDate(asset.created_at)}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" asChild className="shrink-0">
                  <a href={getDownloadUrl(asset.browser_download_url)} target="_blank" rel="noreferrer">
                    <Download size={18} />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto">
      <div className="container mx-auto min-h-full max-w-5xl px-4 py-12 sm:py-24">
        <div className="mb-8">
          <Button variant="ghost" className="gap-2 pl-0 hover:bg-transparent hover:text-sky-600 dark:hover:text-sky-400" onClick={() => router.push('/')}>
            <ArrowLeft size={20} />
            <span className="text-base font-medium">{t('landing.download.backToHero')}</span>
          </Button>
        </div>

        <div className="mb-16 text-center space-y-6">
          <div className="inline-flex items-center rounded-full border bg-white/50 px-3 py-1 text-sm font-medium text-muted-foreground backdrop-blur dark:bg-slate-900/50">
            <Info size={14} className="mr-2" />
            <span>Latest Release</span>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent dark:from-white dark:to-slate-400">
            {t('landing.download.title')}
          </h1>
          
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <p className="text-lg text-muted-foreground max-w-xl">
              {t('landing.download.desktopDesc')}
            </p>
          </div>

          {release?.tag_name && (
             <div className="flex items-center justify-center gap-2">
                <Badge variant="outline" className="px-3 py-1 text-base font-normal">
                  v{release.tag_name}
                </Badge>
                {release.published_at && (
                  <span className="text-sm text-muted-foreground">
                    Released on {formatDate(release.published_at)}
                  </span>
                )}
             </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OSTab)} className="mx-auto max-w-4xl">
          <div className="overflow-x-auto pb-4 sm:pb-0 scrollbar-hide">
            <TabsList className="inline-flex w-full min-w-[500px] grid-cols-5 bg-white/50 p-1 dark:bg-slate-900/50 sm:w-full sm:min-w-0">
              <TabsTrigger value="windows" className="py-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
                <Monitor size={18} className="mr-2" />
                Windows
              </TabsTrigger>
              <TabsTrigger value="mac" className="py-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
                <Laptop size={18} className="mr-2" />
                macOS
              </TabsTrigger>
              <TabsTrigger value="linux" className="py-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
                <Monitor size={18} className="mr-2" />
                Linux
              </TabsTrigger>
              <TabsTrigger value="android" className="py-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
                <Smartphone size={18} className="mr-2" />
                Android
              </TabsTrigger>
              <TabsTrigger value="web" className="py-2.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800">
                <Globe size={18} className="mr-2" />
                Web
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="mt-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                <p className="text-muted-foreground">Fetching latest release...</p>
              </div>
            ) : (
              <div className="rounded-2xl border bg-white p-6 shadow-xl shadow-slate-200/40 dark:bg-slate-900 dark:shadow-none sm:p-8 transition-all">
                <TabsContent value="windows" className="mt-0 space-y-6 focus-visible:outline-none">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">{t('landing.download.windowsClient')}</h3>
                    <p className="text-sm text-muted-foreground">{t('landing.download.windowsDesc')}</p>
                  </div>
                  {renderDownloadList(windowsAssets, <Monitor size={20} />, '.exe')}
                  {windowsAssets.length === 0 && <div className="py-12 text-center text-muted-foreground">{t('landing.download.noAssets')}</div>}
                </TabsContent>

                <TabsContent value="mac" className="mt-0 space-y-6 focus-visible:outline-none">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">{t('landing.download.macClient')}</h3>
                    <p className="text-sm text-muted-foreground">{t('landing.download.macDesc')}</p>
                  </div>
                  {renderDownloadList(macAssets, <Laptop size={20} />, '.dmg')}
                  {macAssets.length === 0 && <div className="py-12 text-center text-muted-foreground">{t('landing.download.noAssets')}</div>}
                </TabsContent>

                <TabsContent value="linux" className="mt-0 space-y-6 focus-visible:outline-none">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">{t('landing.download.linuxClient')}</h3>
                    <p className="text-sm text-muted-foreground">{t('landing.download.linuxDesc')}</p>
                  </div>
                  {renderDownloadList(linuxAssets, <Monitor size={20} />, '.AppImage')}
                  {linuxAssets.length === 0 && <div className="py-12 text-center text-muted-foreground">{t('landing.download.noAssets')}</div>}
                </TabsContent>

                <TabsContent value="android" className="mt-0 space-y-6 focus-visible:outline-none">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">{t('landing.download.androidClient')}</h3>
                    <p className="text-sm text-muted-foreground">{t('landing.download.androidDesc')}</p>
                  </div>
                  {renderDownloadList(androidAssets, <Smartphone size={20} />, '.apk')}
                  {androidAssets.length === 0 && <div className="py-12 text-center text-muted-foreground">{t('landing.download.noAssets')}</div>}
                </TabsContent>

                <TabsContent value="web" className="mt-0 focus-visible:outline-none">
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-6 rounded-full bg-sky-100 p-4 dark:bg-sky-900/20">
                      <Globe className="h-12 w-12 text-sky-600 dark:text-sky-400" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">{t('landing.download.webTitle')}</h3>
                    <p className="text-muted-foreground max-w-md mb-8 leading-relaxed">
                      {t('landing.download.webDesc')}
                      <br />
                      <span className="text-xs mt-2 block opacity-75">{t('landing.download.mobileHint')}</span>
                    </p>
                    <Button size="lg" className="rounded-full px-8" onClick={() => router.push(ROUTES.auth.login)}>
                      {t('landing.actions.openApp')}
                    </Button>
                  </div>
                </TabsContent>
              </div>
            )}
          </div>
        </Tabs>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Looking for older versions? {' '}
            <a 
              href="https://github.com/huanvae/Huanvae-Chat-App/releases" 
              target="_blank" 
              rel="noreferrer"
              className="font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              View release history on GitHub
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}