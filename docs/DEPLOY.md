# 部署指南

本项目使用 Next.js 16 构建，支持静态导出部署到 Cloudflare Pages、Vercel、GitHub Pages 等平台。

## 🚀 快速开始

### 构建项目

```bash
pnpm build
```

构建输出目录为 `out/`，包含所有静态文件。

### 本地预览

```bash
pnpm preview
```

使用 Wrangler 本地预览 Cloudflare Pages 部署效果。

## ☁️ Cloudflare Pages（推荐）

### 自动部署

1. 连接 GitHub 仓库到 Cloudflare Pages
2. 配置构建设置：
   - **构建命令**: `pnpm build`
   - **输出目录**: `out`
   - **Node.js 版本**: `20`
3. 部署！

### 手动部署

```bash
# 构建
pnpm build

# 部署
npx wrangler pages deploy out --project-name=huanvae-chat
```

## ▲ Vercel

直接连接 Git 仓库，Vercel 会自动检测 Next.js 项目并配置：

1. 导入 GitHub 仓库
2. Vercel 自动识别 Next.js 框架
3. 部署完成

> 注意：由于使用 `output: 'export'`，Vercel 会进行静态导出。

## 📄 GitHub Pages

### 1. 启用 GitHub Pages

1. 进入仓库 **Settings** > **Pages**
2. **Source** 选择 **Deploy from a branch**
3. **Branch** 选择 **gh-pages** 和 **/ (root)**
4. 保存

### 2. 配置部署路径

根据仓库类型配置 `next.config.js`：

#### 用户站点 (username.github.io)

```javascript
const nextConfig = {
  output: 'export',
  // 默认即可，无需配置 basePath
}
```

#### 项目站点 (username.github.io/repo-name)

```javascript
const nextConfig = {
  output: 'export',
  basePath: '/repo-name',
  assetPrefix: '/repo-name/',
}
```

### 3. GitHub Actions 工作流

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, dev]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build

      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./out
```

## 🔧 环境变量

### 生产环境配置

在部署平台设置以下环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `https://api.huanvae.cn` |
| `NEXT_PUBLIC_WS_URL` | WebSocket 地址 | `wss://api.huanvae.cn` |

### Cloudflare Pages

在项目设置 > 环境变量中添加。

### Vercel

在项目设置 > Environment Variables 中添加。

## 🐛 常见问题

### 1. 部署后页面显示 404

**原因**: basePath 配置不正确

**解决**: 
- 检查 `next.config.js` 中的 `basePath` 配置
- 确保与实际部署路径一致

### 2. 资源加载失败

**原因**: assetPrefix 配置不正确

**解决**:
- 设置正确的 `assetPrefix`
- 格式: `/repo-name/`（注意首尾斜杠）

### 3. API 请求失败

**原因**: CORS 配置或环境变量问题

**解决**:
- 确保后端配置了正确的 CORS 策略
- 检查 `NEXT_PUBLIC_API_URL` 环境变量

### 4. 刷新页面 404

**原因**: SPA 路由需要服务器配置

**解决**:
- Cloudflare Pages: 自动处理
- Nginx: 配置 `try_files $uri $uri/ /index.html`
- 使用 `trailingSlash: true` 配置（已启用）

## 📚 相关资源

- [Next.js 部署文档](https://nextjs.org/docs/deployment)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Vercel 文档](https://vercel.com/docs)
- [GitHub Pages 文档](https://docs.github.com/en/pages)

## 💡 提示

- 首次部署可能需要几分钟
- 后续部署通常在 1-3 分钟内完成
- 可以通过平台控制台查看构建日志
- 建议使用 Preview 分支测试后再部署到生产

---

**更新时间**: 2026-01-13