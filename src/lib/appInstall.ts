export const RELEASE_PAGE_URL = 'https://github.com/huanwei520/Huanvae-Chat-App/releases/latest'
export const RELEASE_API_URL = 'https://api.github.com/repos/huanwei520/Huanvae-Chat-App/releases/latest'
export const PROXY_PREFIX_URL = 'https://edgeone.gh-proxy.org/'
const CACHE_KEY = 'huanvae.install-targets.latest'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

export interface DownloadTarget {
  version: string | null
  downloadUrl: string
}

export interface InstallTargets {
  version: string | null
  normalUrl: string
  proxyUrl: string
}

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name?: string
  assets?: GitHubAsset[]
}

function pickAssetForCurrentPlatform(assets: GitHubAsset[]): GitHubAsset | null {
  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  const isMac = platform.includes('mac')
  const isWindows = platform.includes('win')
  const isLinux = platform.includes('linux') || ua.includes('linux')
  const isArm = ua.includes('arm') || ua.includes('aarch64') || ua.includes('apple silicon')

  const nonSigAssets = assets.filter(asset => !asset.name.endsWith('.sig'))

  if (isWindows) {
    return nonSigAssets.find(asset => asset.name.endsWith('_x64-setup.exe'))
      ?? nonSigAssets.find(asset => asset.name.endsWith('.msi'))
      ?? null
  }

  if (isMac) {
    if (isArm) {
      return nonSigAssets.find(asset => asset.name.endsWith('_aarch64.dmg'))
        ?? nonSigAssets.find(asset => asset.name.endsWith('.dmg'))
        ?? null
    }
    return nonSigAssets.find(asset => asset.name.endsWith('_x64.dmg'))
      ?? nonSigAssets.find(asset => asset.name.endsWith('.dmg'))
      ?? null
  }

  if (isLinux) {
    return nonSigAssets.find(asset => asset.name.endsWith('.AppImage'))
      ?? nonSigAssets.find(asset => asset.name.endsWith('.deb'))
      ?? null
  }

  return nonSigAssets.find(asset =>
    asset.name.endsWith('.exe')
    || asset.name.endsWith('.msi')
    || asset.name.endsWith('.dmg')
    || asset.name.endsWith('.AppImage')
    || asset.name.endsWith('.deb'),
  ) ?? null
}

function readCache(): InstallTargets | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { expiresAt?: number; data?: InstallTargets }
    if (!parsed.expiresAt || !parsed.data) return null
    if (parsed.expiresAt < Date.now()) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(data: InstallTargets): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      expiresAt: Date.now() + CACHE_TTL_MS,
      data,
    }))
  } catch {
    // ignore
  }
}

export async function fetchInstallTargets(): Promise<InstallTargets | null> {
  const cached = readCache()
  if (cached) return cached

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(RELEASE_API_URL, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
    if (!response.ok) return null

    const release = await response.json() as GitHubRelease
    const assets = release.assets ?? []
    const targetAsset = pickAssetForCurrentPlatform(assets)
    if (!targetAsset?.browser_download_url) return null

    const targets: InstallTargets = {
      version: release.tag_name?.replace(/^v/i, '') ?? null,
      normalUrl: targetAsset.browser_download_url,
      proxyUrl: `${PROXY_PREFIX_URL}${targetAsset.browser_download_url}`,
    }
    writeCache(targets)
    return targets
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
