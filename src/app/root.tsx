import { useEffect } from 'react'
import Cookies from 'js-cookie'
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from 'react-router'
import type { LinksFunction, MetaFunction } from 'react-router'
import NotFoundView from '@/components/common/NotFoundView'
import SoundProvider from '@/components/providers/SoundProvider'
import GlobalThreeBackdrop from '@/components/three/GlobalThreeBackdrop'
import { Toaster } from '@/components/ui/toaster'
import { useSettingsStore } from '@/features/settings/store/settingsStore'
import { setSoundEnabled, setSoundVolume } from '@/hooks/useSound'
import { I18nProvider } from '@/i18n/I18nProvider'
import { dynamic } from '@/lib/dynamic'
import globalsHref from '@/styles/globals.css?url'

const APP_NAME = 'Huanvae Chat'
const APP_DEFAULT_TITLE = 'Huanvae Chat - AI聊天、群聊与视频会议'
const APP_DESCRIPTION = '智能通讯平台 - AI聊天、群组协作、视频会议，支持实时消息、文件共享、视频通话'
const APP_URL = 'https://huanvae.cn'

const UpdatePrompt = dynamic(async () => {
  const mod = await import('@/components/common/UpdatePrompt')
  return { default: mod.UpdatePrompt }
})

const themeInitScript = `
(() => {
  try {
    const raw = localStorage.getItem('app-settings')
    const parsed = raw ? JSON.parse(raw) : null
    const state = parsed?.state || {}
    const theme = state.theme || 'light'
    const root = document.documentElement
    const isDark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
  } catch {}
})();
`

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: globalsHref },
  { rel: 'manifest', href: '/manifest.json' },
  { rel: 'icon', href: '/logo.svg' },
  { rel: 'apple-touch-icon', href: '/logo.svg' },
  { rel: 'canonical', href: `${APP_URL}/` },
  { rel: 'alternate', hrefLang: 'zh-CN', href: `${APP_URL}/` },
  { rel: 'alternate', hrefLang: 'x-default', href: `${APP_URL}/` },
]

export const meta: MetaFunction = () => [
  { title: APP_DEFAULT_TITLE },
  { name: 'application-name', content: APP_NAME },
  { name: 'description', content: APP_DESCRIPTION },
  {
    name: 'keywords',
    content:
      'Huanvae Chat,聊天,AI,AI聊天,即时通讯,视频会议,群聊,WebRTC,PWA,instant messaging,video meeting,team collaboration',
  },
  { name: 'author', content: 'Huanvae Team' },
  { name: 'creator', content: 'Huanvae' },
  { name: 'publisher', content: 'Huanvae' },
  { name: 'referrer', content: 'origin-when-cross-origin' },
  { name: 'format-detection', content: 'telephone=no' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
  { name: 'apple-mobile-web-app-title', content: APP_NAME },
  { name: 'robots', content: 'index, follow' },
  {
    name: 'viewport',
    content: 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover',
  },
  { name: 'theme-color', content: '#4285f4' },
  { property: 'og:type', content: 'website' },
  { property: 'og:site_name', content: APP_NAME },
  { property: 'og:title', content: APP_DEFAULT_TITLE },
  { property: 'og:description', content: APP_DESCRIPTION },
  { property: 'og:url', content: APP_URL },
  { property: 'og:locale', content: 'zh_CN' },
  { property: 'og:image', content: `${APP_URL}/logo.svg` },
  { property: 'og:image:width', content: '512' },
  { property: 'og:image:height', content: '512' },
  { property: 'og:image:alt', content: APP_NAME },
  { name: 'twitter:card', content: 'summary_large_image' },
  { name: 'twitter:title', content: APP_DEFAULT_TITLE },
  { name: 'twitter:description', content: APP_DESCRIPTION },
  { name: 'twitter:image', content: `${APP_URL}/logo.svg` },
]

/** 同步设置到 DOM（原 providers.tsx 的 SettingsSync，逻辑逐行保持不变）。 */
function SettingsSync() {
  const theme = useSettingsStore((s) => s.theme)
  const language = useSettingsStore((s) => s.language)
  const soundEnabled = useSettingsStore((s) => s.soundEnabled)
  const soundVolume = useSettingsStore((s) => s.soundVolume)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)

  useEffect(() => {
    const root = document.documentElement
    const setThemeCookie = (value: 'light' | 'dark') => {
      Cookies.set('app-theme', value, { expires: 365, sameSite: 'Lax', path: '/' })
      root.style.colorScheme = value
    }
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      root.classList.toggle('dark', mediaQuery.matches)
      setThemeCookie(mediaQuery.matches ? 'dark' : 'light')
    } else {
      root.classList.toggle('dark', theme === 'dark')
      setThemeCookie(theme === 'dark' ? 'dark' : 'light')
    }
  }, [theme])

  useEffect(() => {
    if (theme !== 'auto') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const root = document.documentElement
      root.classList.toggle('dark', e.matches)
      Cookies.set('app-theme', e.matches ? 'dark' : 'light', { expires: 365, sameSite: 'Lax', path: '/' })
      root.style.colorScheme = e.matches ? 'dark' : 'light'
    }
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    setSoundEnabled(soundEnabled)
  }, [soundEnabled])

  useEffect(() => {
    setSoundVolume(soundVolume)
  }, [soundVolume])

  useEffect(() => {
    const root = document.documentElement
    if (animationsEnabled) {
      root.classList.remove('reduce-motion')
      root.style.setProperty('--animation-duration', '1')
    } else {
      root.classList.add('reduce-motion')
      root.style.setProperty('--animation-duration', '0')
    }
  }, [animationsEnabled])

  useEffect(() => {
    if (!language || language === 'auto') {
      document.documentElement.lang = navigator.language || 'zh-CN'
      return
    }
    document.documentElement.lang = language
  }, [language])

  return null
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <head>
        {/* charset 必须是 head 的第一个标签：Next 以前会自动注入，RR 不会，
            漏掉会让整站中文在浏览器里变成乱码（已实测复现）。 */}
        <meta charSet="utf-8" />
        <Meta />
        <Links />
        {/* 主题防闪脚本：内容为本文件内的静态字面量，不含任何用户输入 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full">
        <I18nProvider>
          <SoundProvider>
            <GlobalThreeBackdrop />
            <SettingsSync />
            <div className="relative z-10 h-full">{children}</div>
            <Toaster />
            <UpdatePrompt autoUpdateDelay={3000} />
          </SoundProvider>
        </I18nProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundView />
  }
  console.error(error)
  return <NotFoundView />
}
