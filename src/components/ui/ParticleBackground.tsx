'use client'

import { useEffect, useRef, memo } from 'react'
import * as THREE from 'three'

interface ParticleBackgroundProps {
  /** 粒子数量 */
  particleCount?: number
  /** 主色调 (hex) */
  primaryColor?: string
  /** 次要色调 (hex) */
  secondaryColor?: string
  /** 背景色 (hex) */
  backgroundColor?: string
  /** 粒子大小 */
  particleSize?: number
  /** 动画速度 */
  speed?: number
  /** 是否显示连线 */
  showLines?: boolean
  /** 连线距离阈值 */
  lineDistance?: number
  /** 是否响应鼠标 */
  interactive?: boolean
  /** 额外的 CSS 类名 */
  className?: string
}

const ParticleBackground = memo(function ParticleBackground({
  particleCount = 100,
  primaryColor = '#8b5cf6',
  secondaryColor = '#6366f1',
  backgroundColor = '#0f0a1e',
  particleSize = 2,
  speed = 0.5,
  showLines = true,
  lineDistance = 150,
  interactive = true,
  className = '',
}: ParticleBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // 创建场景
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(backgroundColor)

    // 创建相机
    const camera = new THREE.PerspectiveCamera(75, width / height, 1, 1000)
    camera.position.z = 400

    // 创建渲染器
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // 粒子几何体
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const velocities = new Float32Array(particleCount * 3)

    const color1 = new THREE.Color(primaryColor)
    const color2 = new THREE.Color(secondaryColor)

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3
      
      // 随机位置
      positions[i3] = (Math.random() - 0.5) * 800
      positions[i3 + 1] = (Math.random() - 0.5) * 800
      positions[i3 + 2] = (Math.random() - 0.5) * 400

      // 随机颜色（在两个颜色之间插值）
      const mixRatio = Math.random()
      const mixedColor = color1.clone().lerp(color2, mixRatio)
      colors[i3] = mixedColor.r
      colors[i3 + 1] = mixedColor.g
      colors[i3 + 2] = mixedColor.b

      // 随机速度
      velocities[i3] = (Math.random() - 0.5) * speed
      velocities[i3 + 1] = (Math.random() - 0.5) * speed
      velocities[i3 + 2] = (Math.random() - 0.5) * speed * 0.5
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // 粒子材质
    const particleMaterial = new THREE.PointsMaterial({
      size: particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    })

    // 创建粒子系统
    const particles = new THREE.Points(geometry, particleMaterial)
    scene.add(particles)

    // 连线几何体
    let lineGeometry: THREE.BufferGeometry | null = null
    let lineMaterial: THREE.LineBasicMaterial | null = null
    let lines: THREE.LineSegments | null = null

    if (showLines) {
      lineGeometry = new THREE.BufferGeometry()
      lineMaterial = new THREE.LineBasicMaterial({
        color: primaryColor,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
      })
      lines = new THREE.LineSegments(lineGeometry, lineMaterial)
      scene.add(lines)
    }

    // 鼠标交互
    const handleMouseMove = (event: MouseEvent) => {
      if (!interactive) return
      const rect = container.getBoundingClientRect()
      mouseRef.current.x = ((event.clientX - rect.left) / width) * 2 - 1
      mouseRef.current.y = -((event.clientY - rect.top) / height) * 2 + 1
    }

    if (interactive) {
      container.addEventListener('mousemove', handleMouseMove)
    }

    // 动画循环
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)

      const positionArray = geometry.attributes.position.array as Float32Array

      // 更新粒子位置
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3

        positionArray[i3] += velocities[i3]
        positionArray[i3 + 1] += velocities[i3 + 1]
        positionArray[i3 + 2] += velocities[i3 + 2]

        // 边界检测
        if (Math.abs(positionArray[i3]) > 400) velocities[i3] *= -1
        if (Math.abs(positionArray[i3 + 1]) > 400) velocities[i3 + 1] *= -1
        if (Math.abs(positionArray[i3 + 2]) > 200) velocities[i3 + 2] *= -1
      }

      geometry.attributes.position.needsUpdate = true

      // 鼠标交互 - 轻微旋转
      if (interactive) {
        particles.rotation.x += (mouseRef.current.y * 0.1 - particles.rotation.x) * 0.02
        particles.rotation.y += (mouseRef.current.x * 0.1 - particles.rotation.y) * 0.02
      }

      // 更新连线
      if (showLines && lineGeometry && lines) {
        const linePositions: number[] = []
        
        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3
          const x1 = positionArray[i3]
          const y1 = positionArray[i3 + 1]
          const z1 = positionArray[i3 + 2]

          for (let j = i + 1; j < particleCount; j++) {
            const j3 = j * 3
            const x2 = positionArray[j3]
            const y2 = positionArray[j3 + 1]
            const z2 = positionArray[j3 + 2]

            const distance = Math.sqrt(
              (x1 - x2) ** 2 + (y1 - y2) ** 2 + (z1 - z2) ** 2
            )

            if (distance < lineDistance) {
              linePositions.push(x1, y1, z1, x2, y2, z2)
            }
          }
        }

        lineGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(linePositions, 3)
        )
        lines.rotation.copy(particles.rotation)
      }

      renderer.render(scene, camera)
    }

    animate()

    // 窗口大小调整
    const handleResize = () => {
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight

      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }

    window.addEventListener('resize', handleResize)

    // 清理
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', handleResize)
      if (interactive) {
        container.removeEventListener('mousemove', handleMouseMove)
      }
      
      geometry.dispose()
      particleMaterial.dispose()
      lineGeometry?.dispose()
      lineMaterial?.dispose()
      renderer.dispose()
      
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [
    particleCount,
    primaryColor,
    secondaryColor,
    backgroundColor,
    particleSize,
    speed,
    showLines,
    lineDistance,
    interactive,
  ])

  return (
    <div 
      ref={containerRef} 
      className={`absolute inset-0 -z-10 ${className}`}
      aria-hidden="true"
    />
  )
})

export default ParticleBackground
