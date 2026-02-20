'use client'

export const MOBILE_INTERACTIONS = {
  edgeSwipeStartX: 56,
  edgeSwipeTriggerX: 72,
  edgeSwipeMaxVerticalDelta: 56,
  edgeSwipeProgressDistance: 120,
  drawerCloseOffsetY: 120,
  drawerCloseVelocityY: 500,
  drawerDragElastic: 0.22,
} as const

export function triggerMobileHaptic(duration = 10) {
  if (typeof navigator === 'undefined') return
  if (typeof navigator.vibrate !== 'function') return
  navigator.vibrate(duration)
}
