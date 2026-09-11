import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/I18nProvider'
import { useSearchParams } from '@/lib/navigation'
import { ROUTES } from '@/lib/routes'
import { type AuthorizeRequest, oauthApi, scopeLabelKey } from '../api/oauth'
import { appendQuery, browserNav } from '../lib/redirect'
import { isValidRedirectUri } from '../lib/redirectUri'

const NS = 'shell.oauth.authorize'

/** query → 请求体；缺必填或 PKCE 只给一半 → null（错误页，不跳转） */
export function parseAuthorizeQuery(params: URLSearchParams): AuthorizeRequest | null {
  const client_id = params.get('client_id')
  const redirect_uri = params.get('redirect_uri')
  if (!client_id || !redirect_uri) return null
  const challenge = params.get('code_challenge')
  const method = params.get('code_challenge_method')
  if ((challenge === null) !== (method === null)) return null
  if (method !== null && method !== 'S256') return null
  const req: AuthorizeRequest = { client_id, redirect_uri, scope: params.get('scope') || 'profile' }
  const state = params.get('state')
  if (state !== null) req.state = state
  if (challenge !== null) {
    req.code_challenge = challenge
    req.code_challenge_method = 'S256'
  }
  return req
}

type Phase =
  | { kind: 'invalid' }
  | { kind: 'loading' }
  | { kind: 'consent'; appName: string; logo: string | null; scopes: string[]; submitting: boolean }
  | { kind: 'redirecting' }
  | { kind: 'denied'; redirected: boolean }
  | { kind: 'error'; message: string }

/**
 * 托管授权页（spec §6.4）。全屏、不进壳；未登录由 protected-layout 的 ProtectedRoute
 * 带 `next` 跳登录页。跳转目标只用后端回传的 redirect_uri（后端已按注册白名单校验）；
 * 拒绝分支没有后端回传，才用 query 的 redirect_uri，且必须过 isValidRedirectUri。
 */
export function AuthorizePage() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const req = useMemo(() => parseAuthorizeQuery(new URLSearchParams(searchParams.toString())), [searchParams])
  const [phase, setPhase] = useState<Phase>(req ? { kind: 'loading' } : { kind: 'invalid' })

  // useCallback：两者都在下面的 useEffect 里被引用，必须是稳定引用才能诚实地把它们
  // 列进依赖数组——否则要么漏列（exhaustive-deps 警告，本仓禁止使用 lint 抑制注释压掉），
  // 要么列了但每次渲染 effect 都重新触发（这两个函数字面量本来每次渲染都是新的）。
  const finish = useCallback((code: string, state: string | null, redirectUri: string) => {
    setPhase({ kind: 'redirecting' })
    browserNav.assign(appendQuery(redirectUri, { code, state }))
  }, [])
  const fail = useCallback((e: unknown) => setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) }), [])

  useEffect(() => {
    if (!req) return
    let alive = true
    oauthApi.authorize(req).then((res) => {
      if (!alive) return
      if (res.kind === 'code') finish(res.code, res.state, res.redirect_uri)
      else setPhase({ kind: 'consent', appName: res.app_name, logo: res.app_logo_url, scopes: res.scopes, submitting: false })
    }).catch((e: unknown) => { if (alive) fail(e) })
    return () => { alive = false }
    // req 由 query 派生，query 变了整页都会重新走一遍
  }, [req, finish, fail])

  const allow = async () => {
    if (!req || phase.kind !== 'consent') return
    setPhase({ ...phase, submitting: true })
    try {
      const res = await oauthApi.authorize({ ...req, consent: true })
      if (res.kind === 'code') finish(res.code, res.state, res.redirect_uri)
      else setPhase({ kind: 'consent', appName: res.app_name, logo: res.app_logo_url, scopes: res.scopes, submitting: false })
    } catch (e: unknown) {
      fail(e)
    }
  }
  const deny = () => {
    if (!req) return
    // 纵深防御（修复第 2 轮 Critical）：拒绝分支没有后端回传，从头到尾没有服务端确认过，
    // isValidRedirectUri 是跳转前唯一一道闸——不该只信它一次布尔判断就跳。这里跳转前用
    // 独立于 isValidRedirectUri 内部实现的解析结果再核验一遍：原串以 `/` 开头、意图是站内
    // 路径的，解析后必须真的同源；否则（意图是绝对地址）只能再确认协议是 http(s)——具体
    // host 是否在注册白名单里，前端在这条没有后端回传的路径上天生查不到，只能交给后端在
    // 别的入口把关。哪怕 isValidRedirectUri 未来出现新的绕过方式，这里的独立复核也能兜底。
    if (isValidRedirectUri(req.redirect_uri)) {
      const resolved = new URL(req.redirect_uri, location.origin)
      const expectSameOrigin = req.redirect_uri.trim().startsWith('/')
      const safe = expectSameOrigin
        ? resolved.origin === location.origin
        : resolved.protocol === 'http:' || resolved.protocol === 'https:'
      if (safe) {
        setPhase({ kind: 'denied', redirected: true })
        browserNav.assign(appendQuery(req.redirect_uri, { error: 'access_denied', state: req.state ?? null }))
        return
      }
    }
    setPhase({ kind: 'denied', redirected: false })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="glass-card w-full max-w-[420px] p-8 text-center">
        <h1 className="mb-4 text-[15px] font-semibold text-muted-foreground">{t(`${NS}.title`)}</h1>
        {phase.kind === 'invalid' && (<><p className="text-[16px] text-foreground">{t(`${NS}.invalid`)}</p><p className="mt-2 text-[13px] text-muted-foreground">{t(`${NS}.invalidHint`)}</p></>)}
        {phase.kind === 'loading' && <p className="text-[14px] text-muted-foreground">{t(`${NS}.loading`)}</p>}
        {phase.kind === 'redirecting' && <p className="text-[14px] text-foreground">{t(`${NS}.redirecting`)}</p>}
        {phase.kind === 'denied' && (<><p className="text-[16px] text-foreground">{t(`${NS}.denied`)}</p>{!phase.redirected && <p className="mt-2 text-[13px] text-muted-foreground">{t(`${NS}.deniedNoRedirect`)}</p>}</>)}
        {phase.kind === 'error' && (<><p className="text-[14px] text-destructive" role="alert">{t(`${NS}.failed`)}: {phase.message}</p><NavLink to={ROUTES.app.chat} className="subtle-btn mt-4">{t(`${NS}.backToChat`)}</NavLink></>)}
        {phase.kind === 'consent' && (
          <>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-[var(--bg-tertiary)] text-xl font-semibold text-muted-foreground">
              {phase.logo ? <img src={phase.logo} alt="" className="h-full w-full object-cover" /> : phase.appName.charAt(0).toUpperCase()}
            </div>
            <p className="text-[16px] text-foreground">{t(`${NS}.consentTitle`, { name: phase.appName })}</p>
            <p className="mt-4 text-[12px] text-muted-foreground">{t(`${NS}.scopesTitle`)}</p>
            <ul className="mt-2 space-y-1 text-left">
              {phase.scopes.map((s) => (
                <li key={s} className="rounded-md bg-[var(--white-alpha-40)] px-3 py-2 text-[13px]">
                  <span className="text-foreground">{t(scopeLabelKey(s))}</span>
                  <span className="ml-2 text-muted-foreground">{t(`shell.oauth.scopeDesc.${s}`) === `shell.oauth.scopeDesc.${s}` ? '' : t(`shell.oauth.scopeDesc.${s}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" disabled={phase.submitting} onClick={deny}>{t(`${NS}.deny`)}</Button>
              <Button className="flex-1" disabled={phase.submitting} onClick={allow}>{t(`${NS}.allow`)}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AuthorizePage
