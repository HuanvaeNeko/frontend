#!/usr/bin/env node
/**
 * 生成 Service Worker 版本信息
 * 在构建前运行，将版本号注入到 sw.js 和 manifest.json
 * 
 * 版本格式: {major}.{minor}.{patch}-{buildId}
 * buildId 自动生成，确保每次构建都是唯一版本
 * 
 * 通过 npm/pnpm 的 prebuild 钩子自动运行
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// 读取 package.json 基础版本
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))
const baseVersion = packageJson.version || '1.0.0'

// 生成构建 ID（基于时间戳，格式：YYYYMMDD.HHMM）
const now = new Date()
const buildId = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
  '.',
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0')
].join('')

// 尝试获取 Git commit hash（短版本）
let gitHash = ''
try {
  gitHash = execSync('git rev-parse --short HEAD', { 
    cwd: rootDir, 
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim()
} catch {
  console.log('⚠️ 无法获取 Git commit hash')
}

// 完整版本号
const fullVersion = gitHash 
  ? `${baseVersion}+${buildId}.${gitHash}`
  : `${baseVersion}+${buildId}`

// 简化版本号（用于 manifest.json 等）
const simpleVersion = `${baseVersion}+${buildId}`

const buildTime = now.toISOString()

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📦 版本自动生成')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`   基础版本: ${baseVersion}`)
console.log(`   构建 ID:  ${buildId}`)
if (gitHash) {
  console.log(`   Git Hash: ${gitHash}`)
}
console.log(`   完整版本: ${fullVersion}`)
console.log(`   构建时间: ${buildTime}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// 更新 sw.js
const swPath = join(rootDir, 'public/sw.js')
if (existsSync(swPath)) {
  let swContent = readFileSync(swPath, 'utf-8')
  swContent = swContent
    .replace(/const SW_VERSION = ['"][^'"]*['"]/g, `const SW_VERSION = '${fullVersion}'`)
    .replace(/__APP_VERSION__/g, fullVersion)
    .replace(/__BUILD_TIME__/g, buildTime)
  writeFileSync(swPath, swContent)
  console.log('✅ sw.js 版本已更新')
}

// 更新 manifest.json
const manifestPath = join(rootDir, 'public/manifest.json')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  manifest.version = simpleVersion
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log('✅ manifest.json 版本已更新')
}

// 生成版本信息文件（供前端使用）
const versionInfo = {
  version: fullVersion,
  baseVersion,
  buildId,
  gitHash: gitHash || null,
  buildTime
}

const versionFilePath = join(rootDir, 'public/version.json')
writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2) + '\n')
console.log('✅ version.json 已生成')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('🎉 版本更新完成!')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
