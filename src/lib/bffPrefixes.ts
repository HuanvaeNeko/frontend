/**
 * BFF 反代/透传的路径前缀。任何以这些前缀开头的同源请求，响应体都来自
 * Huanvae 后端（经 `server/index.ts` 反代），不是本应用自己的静态资源。
 *
 * 与 `server/index.ts` 里同名的 `BFF_PREFIXES` 常量语义完全一致，但**刻意
 * 不共享同一份源码**：runtime 镜像只从 `src/` 拷贝 `src/config/filterSensitiveData.ts`
 * 这一个文件（见 Dockerfile 该行注释），`server/index.ts` 因此不能 import
 * `src/lib` 下的任何东西——拷一份常量过去，比把整个 `src/` 目录拖进 runtime
 * 镜像便宜得多。两处一旦要加/删前缀，必须同时改。
 */
export const BFF_PREFIXES = ['/api/', '/avatars/', '/user-file/', '/friends-file/', '/apps/'] as const

/**
 * 这个 URL 是不是「本应用自己的静态资源」（js/css/字体/图标之类，可以放心
 * 被 Service Worker 长期缓存）。
 *
 * 同源不再等于「本应用资源」——BFF 落地后，头像、私聊图片、预签名文件下载
 * 都经反代落到同一个 origin 上（见 `src/lib/apiConfig.ts` 的 `toAbsoluteApiUrl`），
 * 但它们是后端数据，不是构建产物。必须按路径前缀把它们从「同源」里再排除
 * 一次，见 `src/app/sw.ts` 的调用点与那里的护栏注释。
 */
export function isAppAsset(url: URL, origin: string): boolean {
  return url.origin === origin && !BFF_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
}
