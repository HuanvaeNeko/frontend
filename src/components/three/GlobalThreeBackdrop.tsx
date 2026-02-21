'use client'

import { useEffect, useMemo, useRef } from 'react'
import { usePathname } from 'next/navigation'
import * as THREE from 'three'
import { useEventListener } from 'ahooks'
import { useSettingsStore } from '@/features/settings/store/settingsStore'

type ParticleRuntime = {
  baseX: Float32Array
  baseY: Float32Array
  baseZ: Float32Array
  phase: Float32Array
  speed: Float32Array
}

const APP_ROUTE_PREFIX = '/app'

function createCurveLine(
  color: string,
  amplitude: number,
  frequency: number,
  depth: number,
  pointsCount = 240
): THREE.Line {
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= pointsCount; i++) {
    const t = (i / pointsCount) * Math.PI * 2
    const x = Math.sin(t * frequency) * 4.6
    const y = Math.cos(t * (frequency * 0.7)) * amplitude
    const z = Math.sin(t * 2.2) * depth
    points.push(new THREE.Vector3(x, y, z))
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.34,
  })
  const line = new THREE.Line(geometry, material)
  return line
}

export default function GlobalThreeBackdrop() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const particleBackground = useSettingsStore((s) => s.particleBackground)
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled)
  const theme = useSettingsStore((s) => s.theme)

  const isLanding = pathname === '/'
  const overlayOpacity = useMemo(() => (isLanding ? 0.56 : 0.34), [isLanding])

  // Physics State Refs
  const stateRef = useRef({
    scrollVelocity: 0,
    clickImpulse: 0,
    pointer: { x: 0, y: 0 },
    pointerTarget: { x: 0, y: 0 },
    lastScrollY: 0,
    lastScrollTime: 0,
    lastActivity: 0,
    isVisible: true
  })

  // Initialize scroll position on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      stateRef.current.lastScrollY = window.scrollY
      stateRef.current.lastScrollTime = performance.now()
      stateRef.current.lastActivity = performance.now()
    }
  }, [])

  // Event Handlers using ahooks
  const markActive = () => {
    stateRef.current.lastActivity = performance.now()
  }

  const handlePointerMove = (clientX: number, clientY: number) => {
    const width = window.innerWidth || 1
    const height = window.innerHeight || 1
    stateRef.current.pointerTarget.x = ((clientX / width) * 2 - 1) * 0.92
    stateRef.current.pointerTarget.y = (1 - (clientY / height) * 2) * 0.92
    markActive()
  }

  useEventListener('mousemove', (e: MouseEvent) => {
    handlePointerMove(e.clientX, e.clientY)
  })

  useEventListener('touchmove', (e: TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    handlePointerMove(t.clientX, t.clientY)
  })

  useEventListener('scroll', () => {
    const now = performance.now()
    const y = window.scrollY || 0
    const dt = Math.max(now - stateRef.current.lastScrollTime, 16)
    const dy = y - stateRef.current.lastScrollY
    const v = (dy / dt) * 16
    
    stateRef.current.scrollVelocity = THREE.MathUtils.clamp(v * 6, -20, 20)
    stateRef.current.lastScrollY = y
    stateRef.current.lastScrollTime = now
    markActive()
  })

  useEventListener('wheel', (e: WheelEvent) => {
    stateRef.current.scrollVelocity = THREE.MathUtils.clamp(stateRef.current.scrollVelocity + e.deltaY * 0.02, -20, 20)
    markActive()
  })

  useEventListener('pointerdown', () => {
    stateRef.current.clickImpulse = Math.min(stateRef.current.clickImpulse + 1, 2.6)
    markActive()
  })

  useEventListener('keydown', markActive)

  useEventListener('visibilitychange', () => {
    stateRef.current.isVisible = document.visibilityState !== 'hidden'
  }, { target: typeof document !== 'undefined' ? document : undefined })

  // Resize handler is handled inside useEffect because it needs renderer access, 
  // or we can move renderer to ref too. Keeping it simple for now by just updating camera aspect 
  // if we moved renderer to ref. But renderer is recreated on effect re-run.
  // So we keep resize inside effect or use a ref for renderer.
  // Let's keep resize logic inside effect for now as it depends on `renderer` and `camera` which are local to effect.

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const inCoreRoutes = pathname === '/' || (pathname || '').startsWith(APP_ROUTE_PREFIX)
    const shouldRender = inCoreRoutes || particleBackground
    if (!shouldRender) return
    if (typeof window === 'undefined') return
    if (!window.WebGLRenderingContext) return

    const probeCanvas = document.createElement('canvas')
    const webglContext =
      probeCanvas.getContext('webgl2', { alpha: true, antialias: false }) ||
      probeCanvas.getContext('webgl', { alpha: true, antialias: false }) ||
      probeCanvas.getContext('experimental-webgl', { alpha: true, antialias: false })
    if (!webglContext) return

    const mediaReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const enableMotion = animationsEnabled && !mediaReduceMotion

    const isApp = (pathname || '').startsWith(APP_ROUTE_PREFIX)
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    const lowCpu = (navigator.hardwareConcurrency || 8) <= 4
    const lowMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory as number) <= 4
      : false
    const lowPowerMode = !!saveData || lowCpu || lowMemory

    const dpr = Math.min(window.devicePixelRatio || 1, lowPowerMode ? 1.2 : 1.75)
    const particleCount = lowPowerMode
      ? (isLanding ? 110 : isApp ? 70 : 95)
      : (isLanding ? 260 : isApp ? 140 : 200)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100)
    camera.position.set(0, 0, 8)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: lowPowerMode ? 'low-power' : 'high-performance',
      })
    } catch {
      return
    }

    renderer.setPixelRatio(dpr)
    renderer.setClearAlpha(0)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    container.appendChild(renderer.domElement)

    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)

    const runtime: ParticleRuntime = {
      baseX: new Float32Array(particleCount),
      baseY: new Float32Array(particleCount),
      baseZ: new Float32Array(particleCount),
      phase: new Float32Array(particleCount),
      speed: new Float32Array(particleCount),
    }

    const darkMatch = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'auto' && darkMatch)
    const colorA = new THREE.Color(isDark ? '#4fd1ff' : '#0ea5e9')
    const colorB = new THREE.Color(isDark ? '#6ee7b7' : '#22c55e')
    const colorMix = new THREE.Color()

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      const x = (Math.random() - 0.5) * 16
      const y = (Math.random() - 0.5) * 10
      const z = (Math.random() - 0.5) * 7
      positions[i3] = x
      positions[i3 + 1] = y
      positions[i3 + 2] = z

      runtime.baseX[i] = x
      runtime.baseY[i] = y
      runtime.baseZ[i] = z
      runtime.phase[i] = Math.random() * Math.PI * 2
      runtime.speed[i] = 0.12 + Math.random() * 0.38

      colorMix.copy(colorA).lerp(colorB, Math.random() * 0.9)
      colors[i3] = colorMix.r
      colors[i3 + 1] = colorMix.g
      colors[i3 + 2] = colorMix.b
      sizes[i] = 0.9 + Math.random() * 2.2
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const baseOpacity = isLanding ? 0.38 : isApp ? 0.2 : 0.3
    const material = new THREE.PointsMaterial({
      size: isLanding ? 0.085 : isApp ? 0.055 : 0.07,
      vertexColors: true,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    const extraObjects: Array<THREE.Object3D> = []
    const extraDisposables: Array<{ dispose: () => void }> = []

    let latticeMesh: THREE.Mesh | null = null
    let abstractGroup: THREE.Group | null = null
    let orbitNodes: THREE.Group | null = null

    if (isLanding) {
      const latticeGeometry = new THREE.PlaneGeometry(24, 14, 36, 22)
      const latticeMaterial = new THREE.MeshBasicMaterial({
        color: isDark ? '#155e75' : '#0369a1',
        wireframe: true,
        transparent: true,
        opacity: 0.16,
      })
      latticeMesh = new THREE.Mesh(latticeGeometry, latticeMaterial)
      latticeMesh.position.set(0, -1.6, -4)
      latticeMesh.rotation.x = -1.08
      scene.add(latticeMesh)
      extraObjects.push(latticeMesh)
      extraDisposables.push(latticeGeometry, latticeMaterial)

      abstractGroup = new THREE.Group()
      const lineA = createCurveLine('#22d3ee', 2.7, 3, 0.85)
      const lineB = createCurveLine('#34d399', 2.2, 4, 0.55)
      const lineC = createCurveLine('#38bdf8', 1.8, 5, 0.7)
      lineB.rotation.z = Math.PI * 0.35
      lineC.rotation.z = -Math.PI * 0.24
      abstractGroup.add(lineA, lineB, lineC)
      abstractGroup.position.z = -1.1
      scene.add(abstractGroup)
      extraObjects.push(abstractGroup)
      ;[lineA, lineB, lineC].forEach((line) => {
        extraDisposables.push(line.geometry as THREE.BufferGeometry, line.material as THREE.Material)
      })

      orbitNodes = new THREE.Group()
      const nodeGeometry = new THREE.SphereGeometry(0.06, 12, 12)
      const nodeMaterial = new THREE.MeshBasicMaterial({ color: isDark ? '#67e8f9' : '#0891b2' })
      for (let i = 0; i < 10; i++) {
        const node = new THREE.Mesh(nodeGeometry, nodeMaterial)
        orbitNodes.add(node)
      }
      scene.add(orbitNodes)
      extraObjects.push(orbitNodes)
      extraDisposables.push(nodeGeometry, nodeMaterial)
    }

    // const clock = new THREE.Clock() // Deprecated
    let rafId = 0
    let idleBlend = 1
    let startTime = performance.now()

    const resize = () => {
      const width = container.clientWidth || window.innerWidth
      const height = container.clientHeight || window.innerHeight
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const tick = () => {
      // const elapsed = clock.getElapsedTime()
      const elapsed = (performance.now() - startTime) / 1000
      const pos = geometry.attributes.position as THREE.BufferAttribute
      const state = stateRef.current

      const idleTarget = performance.now() - state.lastActivity > 4500 ? 0.34 : 1
      idleBlend = THREE.MathUtils.lerp(idleBlend, idleTarget, 0.03)
      state.pointer.x = THREE.MathUtils.lerp(state.pointer.x, state.pointerTarget.x, 0.05)
      state.pointer.y = THREE.MathUtils.lerp(state.pointer.y, state.pointerTarget.y, 0.05)
      state.scrollVelocity = THREE.MathUtils.lerp(state.scrollVelocity, 0, 0.04)
      state.clickImpulse = THREE.MathUtils.lerp(state.clickImpulse, 0, 0.07)

      const routeIntensity = isLanding ? 1.1 : isApp ? 0.58 : 0.82
      const interactionGain = 1 + Math.abs(state.scrollVelocity) * 0.03 + state.clickImpulse * 0.25
      const waveAmp = 0.2 * routeIntensity * idleBlend * interactionGain
      const xDrift = 0.22 * state.pointer.x * routeIntensity
      const yDrift = 0.17 * state.pointer.y * routeIntensity
      const zDrift = 0.1 * state.pointer.x * routeIntensity

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3
        const freq = runtime.speed[i] * (0.9 + Math.abs(state.scrollVelocity) * 0.05) * idleBlend
        pos.array[i3] = runtime.baseX[i] + Math.sin(elapsed * 0.28 + runtime.phase[i]) * xDrift
        pos.array[i3 + 1] = runtime.baseY[i] + Math.sin(elapsed * freq + runtime.phase[i]) * waveAmp + yDrift
        pos.array[i3 + 2] = runtime.baseZ[i] + Math.cos(elapsed * (freq * 0.6) + runtime.phase[i]) * zDrift
      }

      pos.needsUpdate = true
      points.rotation.z = elapsed * 0.012 * idleBlend + state.pointer.x * 0.038
      points.rotation.y = Math.sin(elapsed * 0.07) * 0.05 + state.pointer.x * 0.06

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, state.pointer.x * 0.95 * routeIntensity, 0.04)
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, state.pointer.y * 0.6 * routeIntensity, 0.04)

      if (latticeMesh) {
        latticeMesh.rotation.z = elapsed * 0.04 + state.pointer.x * 0.08
        latticeMesh.position.x = THREE.MathUtils.lerp(latticeMesh.position.x, state.pointer.x * 1.2, 0.05)
        latticeMesh.position.y = THREE.MathUtils.lerp(latticeMesh.position.y, -1.6 + state.pointer.y * 0.7, 0.05)
      }

      if (abstractGroup) {
        abstractGroup.rotation.z = elapsed * 0.1 + state.pointer.x * 0.12
        abstractGroup.rotation.x = Math.sin(elapsed * 0.22) * 0.08 + state.pointer.y * 0.08
      }

      if (orbitNodes) {
        orbitNodes.children.forEach((node, index) => {
          const phase = elapsed * 0.8 + index * 0.56
          const radius = 2.4 + (index % 3) * 0.3
          node.position.set(
            Math.cos(phase) * radius,
            Math.sin(phase * 1.2) * (0.8 + (index % 2) * 0.55),
            Math.sin(phase * 0.9) * 0.65
          )
        })
      }

      material.opacity = baseOpacity * (0.84 + Math.min(0.32, Math.abs(state.scrollVelocity) * 0.015 + state.clickImpulse * 0.1))

      if (state.isVisible) {
        renderer.render(scene, camera)
      }

      if (enableMotion) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    resize()
    if (enableMotion) {
      tick()
    } else if (stateRef.current.isVisible) {
      renderer.render(scene, camera)
    }

    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(rafId)

      geometry.dispose()
      material.dispose()
      extraDisposables.forEach((d) => d.dispose())
      extraObjects.forEach((obj) => scene.remove(obj))

      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [animationsEnabled, particleBackground, pathname, theme, isLanding])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-20"
      style={{ opacity: overlayOpacity }}
    />
  )
}
