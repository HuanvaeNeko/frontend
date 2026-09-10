import { describe, expect, it } from 'vitest'
import { isAppAsset } from '../bffPrefixes'

const ORIGIN = 'https://app.example.com'

describe('isAppAsset —— Service Worker 用它区分"本应用静态资源"与"BFF 反代的后端数据"', () => {
  it('同源的构建产物是应用资源（正对照：确实有 true 的情况，不是恒假）', () => {
    expect(isAppAsset(new URL('/assets/x.js', ORIGIN), ORIGIN)).toBe(true)
  })

  it('/avatars/ 是 BFF 反代的头像，不是应用资源', () => {
    expect(isAppAsset(new URL('/avatars/a.png', ORIGIN), ORIGIN)).toBe(false)
  })

  it('/user-file/ 预签名下载（带查询串）不是应用资源', () => {
    const url = new URL('/user-file/k?X-Amz-Signature=abc', ORIGIN)
    expect(isAppAsset(url, ORIGIN)).toBe(false)
  })

  it('/api/ 不是应用资源', () => {
    expect(isAppAsset(new URL('/api/storage/file/uuid', ORIGIN), ORIGIN)).toBe(false)
  })

  it('跨源地址不是应用资源，即使路径没有命中任何 BFF 前缀（负对照：不能只看路径）', () => {
    const url = new URL('/assets/x.js', 'https://other.example')
    expect(isAppAsset(url, ORIGIN)).toBe(false)
  })
})
