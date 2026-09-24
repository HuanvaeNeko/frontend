import * as THREE from 'three'

/**
 * 全局粒子背景的 three.js 场景本体。只由 `GlobalThreeBackdrop` 动态 import：
 * three 约 500 KB（未压缩），以前静态挂在根路由上，每个页面水合前都要下载、解析一遍；
 * 背景纯装饰，水合后空闲时再加载不影响任何功能。
 */
export type BackdropVariant = 'landing' | 'app' | 'other'

export interface BackdropOptions {
  variant: BackdropVariant
  isDark: boolean
  enableMotion: boolean
}

type ParticleRuntime = {
  baseX: Float32Array
  baseY: Float32Array
  baseZ: Float32Array
  phase: Float32Array
  speed: Float32Array
}

/** 无交互多久后视为空闲（空闲时粒子减速变暗） */
const IDLE_AFTER_MS = 4500
/**
 * 应用内（聊天/联系人/设置）的帧间隔上限。背景透明度只有 0.2×0.34，30 fps 与 60 fps
 * 肉眼无差，但整屏 WebGL 合成层的开销减半——实测它在空闲时独占主线程约 16%（4× 降速）。
 */
const APP_FRAME_INTERVAL_MS = 1000 / 30

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
  return new THREE.Line(geometry, material)
}

/**
 * 在 container 里挂一个粒子背景，返回卸载函数；WebGL 不可用时返回 null。
 *
 * 不再先用一个探测 canvas 调 getContext 判断 WebGL 是否可用：那个 canvas 的上下文
 * 从不释放，每挂一次就泄漏一个——以前每次路由切换都会重挂，实测 10 次切换泄漏 22 个
 * 上下文，浏览器到上限（约 16）后开始强制丢弃最老的上下文。`WebGLRenderer` 创建失败
 * 本身就会抛错，下面的 try/catch 已经覆盖了「不支持 WebGL」这一情形。
 */
export function mountBackdrop(container: HTMLElement, { variant, isDark, enableMotion }: BackdropOptions): (() => void) | null {
  const isLanding = variant === 'landing'
  const isApp = variant === 'app'

  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  const lowCpu = (navigator.hardwareConcurrency || 8) <= 4
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const lowMemory = deviceMemory ? deviceMemory <= 4 : false
  const lowPowerMode = !!saveData || lowCpu || lowMemory

  const dpr = Math.min(window.devicePixelRatio || 1, lowPowerMode ? 1.2 : 1.75)
  const particleCount = lowPowerMode
    ? (isLanding ? 110 : isApp ? 70 : 95)
    : (isLanding ? 260 : isApp ? 140 : 200)

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: lowPowerMode ? 'low-power' : 'high-performance',
    })
  } catch {
    return null
  }

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100)
  camera.position.set(0, 0, 8)

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
    for (const line of [lineA, lineB, lineC]) {
      extraDisposables.push(line.geometry as THREE.BufferGeometry, line.material as THREE.Material)
    }

    orbitNodes = new THREE.Group()
    const nodeGeometry = new THREE.SphereGeometry(0.06, 12, 12)
    const nodeMaterial = new THREE.MeshBasicMaterial({ color: isDark ? '#67e8f9' : '#0891b2' })
    for (let i = 0; i < 10; i++) {
      orbitNodes.add(new THREE.Mesh(nodeGeometry, nodeMaterial))
    }
    scene.add(orbitNodes)
    extraObjects.push(orbitNodes)
    extraDisposables.push(nodeGeometry, nodeMaterial)
  }

  // ── 交互状态 ──
  const now0 = performance.now()
  const state = {
    scrollVelocity: 0,
    clickImpulse: 0,
    pointer: { x: 0, y: 0 },
    pointerTarget: { x: 0, y: 0 },
    lastScrollY: window.scrollY,
    lastScrollTime: now0,
    lastActivity: now0,
    visible: document.visibilityState !== 'hidden',
  }

  let rafId = 0
  let running = false
  let idleBlend = 1
  let lastFrame = 0
  const startTime = now0

  // 下面的缓动系数都是按 60 fps 每帧调出来的；按实际帧间隔换算，
  // 这样应用内降到 30 fps 时粒子的跟手速度与以前一致。
  const ease = (k: number, frames: number) => 1 - (1 - k) ** frames

  const resize = () => {
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    camera.aspect = width / Math.max(height, 1)
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    if (!running) renderer.render(scene, camera)
  }

  const tick = (now: number) => {
    rafId = 0
    if (!running) return

    if (isApp && lastFrame && now - lastFrame < APP_FRAME_INTERVAL_MS - 1) {
      rafId = window.requestAnimationFrame(tick)
      return
    }
    const frames = lastFrame ? Math.min((now - lastFrame) / (1000 / 60), 4) : 1
    lastFrame = now

    const elapsed = (now - startTime) / 1000
    const pos = geometry.attributes.position as THREE.BufferAttribute

    const idle = now - state.lastActivity > IDLE_AFTER_MS
    const idleTarget = idle ? 0.34 : 1
    idleBlend = THREE.MathUtils.lerp(idleBlend, idleTarget, ease(0.03, frames))
    state.pointer.x = THREE.MathUtils.lerp(state.pointer.x, state.pointerTarget.x, ease(0.05, frames))
    state.pointer.y = THREE.MathUtils.lerp(state.pointer.y, state.pointerTarget.y, ease(0.05, frames))
    state.scrollVelocity = THREE.MathUtils.lerp(state.scrollVelocity, 0, ease(0.04, frames))
    state.clickImpulse = THREE.MathUtils.lerp(state.clickImpulse, 0, ease(0.07, frames))

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

    camera.position.x = THREE.MathUtils.lerp(camera.position.x, state.pointer.x * 0.95 * routeIntensity, ease(0.04, frames))
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, state.pointer.y * 0.6 * routeIntensity, ease(0.04, frames))

    if (latticeMesh) {
      latticeMesh.rotation.z = elapsed * 0.04 + state.pointer.x * 0.08
      latticeMesh.position.x = THREE.MathUtils.lerp(latticeMesh.position.x, state.pointer.x * 1.2, ease(0.05, frames))
      latticeMesh.position.y = THREE.MathUtils.lerp(latticeMesh.position.y, -1.6 + state.pointer.y * 0.7, ease(0.05, frames))
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

    renderer.render(scene, camera)

    // 应用内空闲且减速已收敛：停掉循环，等下一次交互再唤醒。落地页保持常动。
    if (isApp && idle && Math.abs(idleBlend - idleTarget) < 0.005) {
      running = false
      return
    }
    rafId = window.requestAnimationFrame(tick)
  }

  const start = () => {
    if (running || !enableMotion || !state.visible) return
    running = true
    lastFrame = 0
    rafId = window.requestAnimationFrame(tick)
  }

  const stop = () => {
    running = false
    if (rafId) window.cancelAnimationFrame(rafId)
    rafId = 0
  }

  const markActive = () => {
    state.lastActivity = performance.now()
    start()
  }

  const onPointer = (clientX: number, clientY: number) => {
    const width = window.innerWidth || 1
    const height = window.innerHeight || 1
    state.pointerTarget.x = ((clientX / width) * 2 - 1) * 0.92
    state.pointerTarget.y = (1 - (clientY / height) * 2) * 0.92
    markActive()
  }
  const onMouseMove = (e: MouseEvent) => onPointer(e.clientX, e.clientY)
  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0]
    if (t) onPointer(t.clientX, t.clientY)
  }
  const onScroll = () => {
    const now = performance.now()
    const y = window.scrollY || 0
    const dt = Math.max(now - state.lastScrollTime, 16)
    const v = ((y - state.lastScrollY) / dt) * 16
    state.scrollVelocity = THREE.MathUtils.clamp(v * 6, -20, 20)
    state.lastScrollY = y
    state.lastScrollTime = now
    markActive()
  }
  const onWheel = (e: WheelEvent) => {
    state.scrollVelocity = THREE.MathUtils.clamp(state.scrollVelocity + e.deltaY * 0.02, -20, 20)
    markActive()
  }
  const onPointerDown = () => {
    state.clickImpulse = Math.min(state.clickImpulse + 1, 2.6)
    markActive()
  }
  const onVisibility = () => {
    state.visible = document.visibilityState !== 'hidden'
    if (state.visible) markActive()
    else stop()
  }

  const passive = { passive: true } as const
  window.addEventListener('mousemove', onMouseMove, passive)
  window.addEventListener('touchmove', onTouchMove, passive)
  window.addEventListener('scroll', onScroll, passive)
  window.addEventListener('wheel', onWheel, passive)
  window.addEventListener('pointerdown', onPointerDown, passive)
  window.addEventListener('keydown', markActive, passive)
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)

  resize()
  if (enableMotion) start()
  else if (state.visible) renderer.render(scene, camera)

  return () => {
    stop()
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('touchmove', onTouchMove)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('keydown', markActive)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibility)

    geometry.dispose()
    material.dispose()
    for (const d of extraDisposables) d.dispose()
    for (const obj of extraObjects) scene.remove(obj)

    renderer.dispose()
    // dispose() 只释放 three 自己的 GPU 资源，上下文本身要显式交还，
    // 否则要等 GC 回收 canvas 才释放（重挂频繁时就是泄漏）
    renderer.forceContextLoss()
    renderer.domElement.remove()
  }
}
