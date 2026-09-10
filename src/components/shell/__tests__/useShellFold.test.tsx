import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useShellFold } from '../useShellFold'
import { stubViewport } from './viewportStub'

describe('useShellFold', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([[1440, 'desktop'], [1024, 'desktop'], [1023, 'tablet'], [768, 'tablet'], [767, 'phone'], [360, 'phone']] as const)('宽 %i → %s', (width, expected) => {
    stubViewport(width)
    expect(renderHook(() => useShellFold()).result.current).toBe(expected)
  })

  it('视口变化时跟着变（订阅了 change）', () => {
    const viewport = stubViewport(1440)
    const { result } = renderHook(() => useShellFold())
    expect(result.current).toBe('desktop')
    act(() => viewport.resize(500))
    expect(result.current).toBe('phone')
  })
})
