import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// getApiBaseUrl()（`@/lib/apiConfig`）现在无条件返回同源空串 ''：BFF 会话层之后，
// 浏览器不再知道任何后端 host，上游由服务端的 BFF_UPSTREAM_* 决定（见 vite.config.ts）。
// 断言里因此也不要硬编码某个协议/主机——用 getApiBaseUrl() 或只断言路径部分。

// @testing-library/react 只在检测到全局 afterEach 时才会自动注册卸载清理；
// 本项目的 vitest.config.ts 未开启 test.globals，afterEach 在测试文件里
// 是模块级导入而非全局变量，因此需要在这里手动接线，否则每个 render()
// 都会往 document.body 里叠加节点，导致后续用例里 getByTestId / getByText
// 命中多个元素。
afterEach(() => {
  cleanup()
})
