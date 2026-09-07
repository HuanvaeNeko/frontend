import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Vitest（经由 Vite 的 loadEnv）会加载仓库根目录的 .env，所以 import.meta.env.VITE_API_URL
// 在测试里跟开发者本机配置的值一致，不是固定的 https://api.huanvae.cn。断言里不要硬编码某个
// 宿主/域名——用 getApiBaseUrl()（`@/lib/apiConfig`）或只断言路径部分，否则换一份 .env 就假红。

// @testing-library/react 只在检测到全局 afterEach 时才会自动注册卸载清理；
// 本项目的 vitest.config.ts 未开启 test.globals，afterEach 在测试文件里
// 是模块级导入而非全局变量，因此需要在这里手动接线，否则每个 render()
// 都会往 document.body 里叠加节点，导致后续用例里 getByTestId / getByText
// 命中多个元素。
afterEach(() => {
  cleanup()
})
