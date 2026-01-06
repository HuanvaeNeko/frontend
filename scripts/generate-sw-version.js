#!/usr/bin/env node
/**
 * 生成 Service Worker 版本信息
 * 在构建前运行，将版本号注入到 sw.js
 * 
 * 通过 npm/pnpm 的 prebuild 钩子自动运行
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

// 读取 package.json 版本
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))
const version = packageJson.version || '1.0.0'
const buildTime = new Date().toISOString()

console.log(`📦 版本: ${version}`)
console.log(`🕐 构建时间: ${buildTime}`)

// 读取 sw.js
const swPath = join(rootDir, 'public/sw.js')
let swContent = readFileSync(swPath, 'utf-8')

// 替换版本号 - 支持多种格式
// 格式1: const SW_VERSION = '1.0.0' 或 "1.0.0"
// 格式2: __APP_VERSION__ 占位符
swContent = swContent
  .replace(/const SW_VERSION = ['"][^'"]*['"]/g, `const SW_VERSION = '${version}'`)
  .replace(/__APP_VERSION__/g, version)
  .replace(/__BUILD_TIME__/g, buildTime)

// 写回 sw.js
writeFileSync(swPath, swContent)

console.log('✅ Service Worker 版本已更新:', version)

