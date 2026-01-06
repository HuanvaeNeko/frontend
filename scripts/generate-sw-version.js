#!/usr/bin/env node
/**
 * 生成 Service Worker 版本信息
 * 在构建前运行，将版本号注入到 sw.js
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

// 读取 sw.js 模板
const swPath = join(rootDir, 'public/sw.js')
let swContent = readFileSync(swPath, 'utf-8')

// 替换版本号占位符
swContent = swContent
  .replace(/__APP_VERSION__/g, version)
  .replace(/__BUILD_TIME__/g, buildTime)

// 写回 sw.js
writeFileSync(swPath, swContent)

console.log('✅ Service Worker 版本已更新')

