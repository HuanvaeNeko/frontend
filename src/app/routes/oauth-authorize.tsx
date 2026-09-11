import AuthorizePage from '@/features/oauth/components/AuthorizePage'

/** 全屏授权页：与 /app/video-meeting 同层，不进壳（spec §3） */
export default function OAuthAuthorize() {
  return <AuthorizePage />
}
