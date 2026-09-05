import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// @testing-library/react 只在检测到全局 afterEach 时才会自动注册卸载清理；
// 本项目的 vitest.config.ts 未开启 test.globals，afterEach 在测试文件里
// 是模块级导入而非全局变量，因此需要在这里手动接线，否则每个 render()
// 都会往 document.body 里叠加节点，导致后续用例里 getByTestId / getByText
// 命中多个元素。
afterEach(() => {
  cleanup()
})
