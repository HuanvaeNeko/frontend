/**
 * `<head>` 内联防闪脚本（root.tsx 注入；内容是静态字面量，不含任何用户输入）。
 * 先做上期的明暗 class 切换，再读 `huanvae.theme`：preset 为 custom 且有快照时，
 * 按 isDark 把对应那份逐条 setProperty。只赋值不计算——culori 不进内联脚本（spec §4.3）。
 */
export const themeInitScript = `
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
    const themeRaw = localStorage.getItem('huanvae.theme')
    const themeState = themeRaw ? JSON.parse(themeRaw)?.state : null
    const snapshot = themeState && themeState.config && themeState.config.preset === 'custom' ? themeState.snapshot : null
    const vars = snapshot ? (isDark ? snapshot.dark : snapshot.light) : null
    if (vars && typeof vars === 'object') {
      for (const name of Object.keys(vars)) {
        if (name.startsWith('--') && typeof vars[name] === 'string') root.style.setProperty(name, vars[name])
      }
    }
  } catch {}
})();
`
