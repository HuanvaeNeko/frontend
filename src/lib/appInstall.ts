export const RELEASE_PAGE_URL = 'https://github.com/huanwei520/Huanvae-Chat-App/releases/latest'
export const RELEASE_API_URL = 'https://api.github.com/repos/huanwei520/Huanvae-Chat-App/releases/latest'
export const PROXY_PREFIX_URL = 'https://ghproxy.com/'
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
  androidUrl?: string
}

export interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
  download_count: number
  created_at: string
}

export interface GitHubRelease {
  tag_name?: string
  published_at?: string
  assets?: GitHubAsset[]
  body?: string
}

export async function fetchReleaseInfo(): Promise<GitHubRelease | null> {
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
    return await response.json() as GitHubRelease
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function pickAssetForCurrentPlatform(assets: GitHubAsset[]): GitHubAsset | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  const isMac = platform.includes('mac')
  const isWindows = platform.includes('win')
  const isLinux = platform.includes('linux') || ua.includes('linux')
  const isArm = ua.includes('arm') || ua.includes('aarch64') || ua.includes('apple silicon')
  
  // Exclude signature files
  const nonSigAssets = assets.filter(asset => !asset.name.endsWith('.sig') && !asset.name.endsWith('.yml') && !asset.name.endsWith('.json'))

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

  return null
}

async function getAndroidDownloadUrl(assets: GitHubAsset[]): Promise<string | undefined> {
  // Find android-latest.json asset
  const jsonAsset = assets.find(asset => asset.name === 'android-latest.json')
  if (!jsonAsset) return undefined

  try {
    // Fetch the JSON content
    const response = await fetch(jsonAsset.browser_download_url)
    if (!response.ok) return undefined
    
    const data = await response.json()
    // Extract the APK file name from the path in JSON
    // The JSON structure typically has a 'path' field like "Huanvae-Chat-App_1.0.0_arm64-v8a.apk"
    // Or we can just look for the APK asset in the release that matches the filename
    
    // Actually, simpler approach:
    // If we can get the filename from the JSON, we can find the asset in the release list
    // Let's try to find an .apk asset directly first as a fallback, but the requirement is to parse json
    
    /* 
      android-latest.json usually looks like:
      {
        "version": "1.0.0",
        "releaseDate": "...",
        "path": "Huanvae-Chat-App_1.0.0_arm64-v8a.apk" 
      }
    */
    
    if (data && data.path) {
        // Find the asset with this name
        const apkAsset = assets.find(a => a.name === data.path)
        if (apkAsset) return apkAsset.browser_download_url
    }
    
    // Fallback: just find the first apk
    return assets.find(a => a.name.endsWith('.apk'))?.browser_download_url

  } catch (e) {
    console.error('Failed to parse android-latest.json', e)
    // Fallback
    return assets.find(a => a.name.endsWith('.apk'))?.browser_download_url
  }
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

    // Get Android download URL
    let androidUrl: string | undefined
    try {
      const jsonAsset = assets.find(a => a.name === 'android-latest.json')
      if (jsonAsset) {
        // Fetch the content of android-latest.json
        const jsonResp = await fetch(jsonAsset.browser_download_url)
        if (jsonResp.ok) {
          const jsonData = await jsonResp.json()
          if (jsonData && jsonData.path) {
             const apkAsset = assets.find(a => a.name === jsonData.path)
             if (apkAsset) {
               androidUrl = apkAsset.browser_download_url
             }
          }
        }
      }
      // Fallback if not found via json
      if (!androidUrl) {
         androidUrl = assets.find(a => a.name.endsWith('.apk'))?.browser_download_url
      }
    } catch (e) {
      console.error('Failed to resolve android asset', e)
    }

    const targets: InstallTargets = {
      version: release.tag_name?.replace(/^v/i, '') ?? null,
      normalUrl: targetAsset.browser_download_url,
      proxyUrl: `${PROXY_PREFIX_URL}${targetAsset.browser_download_url}`,
      androidUrl: androidUrl ? `${PROXY_PREFIX_URL}${androidUrl}` : undefined
    }
    writeCache(targets)
    return targets
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
