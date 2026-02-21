import { useResponsive } from 'ahooks'

export function useIsMobile() {
  const responsive = useResponsive()
  // default breakpoints: xs: 0, sm: 576, md: 768, lg: 992, xl: 1200
  // if responsive is undefined (SSR), return false
  // if responsive.md is true (>=768), then not mobile
  // if responsive.md is false (<768), then mobile
  return !responsive?.md
}
