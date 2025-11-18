# GitHub Pages 部署指南

本项目已配置自动部署到 GitHub Pages。每次推送到 `main` 分支时，GitHub Actions 会自动构建并部署项目。

## 🚀 快速开始

### 1. 启用 GitHub Pages

1. 进入你的 GitHub 仓库
2. 点击 **Settings** (设置)
3. 在左侧菜单中找到 **Pages**
4. 在 **Source** (源) 下拉菜单中选择 **GitHub Actions**

### 2. 配置部署路径

根据你的仓库类型，需要配置不同的 base 路径：

#### 情况 A: 用户/组织站点 (username.github.io)
如果你的仓库名是 `username.github.io` 或 `organization.github.io`，部署后的地址将是：
```
https://username.github.io/
```

**不需要修改** `vite.config.ts`，保持默认即可。

#### 情况 B: 项目站点 (其他仓库名)
如果你的仓库名是 `frontend` 或其他名称，部署后的地址将是：
```
https://username.github.io/frontend/
```

**需要修改** `vite.config.ts`：
```typescript
export default defineConfig({
  plugins: [react()],
  base: '/frontend/',  // 将 'frontend' 替换为你的实际仓库名
  // ...
})
```

### 3. 推送代码触发部署

```bash
# 提交并推送到 main 分支
git add .
git commit -m "配置 GitHub Pages 自动部署"
git push origin main
```

### 4. 查看部署状态

1. 进入仓库的 **Actions** 标签页
2. 你会看到一个名为 "部署到 GitHub Pages" 的工作流正在运行
3. 等待部署完成（通常需要 1-3 分钟）
4. 部署成功后，访问你的 GitHub Pages 地址

## 📋 工作流说明

工作流文件位于 `.github/workflows/deploy.yml`，主要步骤：

1. ✅ 检出代码
2. ✅ 安装 pnpm (v9)
3. ✅ 设置 Node.js 环境 (v20) 并自动缓存 pnpm 依赖
4. ✅ 安装项目依赖 (`pnpm install`)
5. ✅ 构建项目 (`pnpm build`)
6. ✅ 部署到 GitHub Pages

## 🔧 自定义配置

### 修改触发分支

默认在推送到 `main` 分支时触发部署，如果你想修改触发分支，编辑 `.github/workflows/deploy.yml`：

```yaml
on:
  push:
    branches:
      - main  # 改为你想要的分支名，如 master 或 develop
```

### 修改 Node.js 版本

如果需要使用不同的 Node.js 版本，修改工作流中的：

```yaml
- name: 设置 Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'  # 改为你需要的版本
```

### 修改 pnpm 版本

如果需要使用不同的 pnpm 版本，修改工作流中的：

```yaml
- name: 安装 pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 9  # 改为你需要的版本
```

## 🐛 常见问题

### 1. 部署后页面显示 404

**原因**: `base` 路径配置不正确

**解决方法**: 
- 检查 `vite.config.ts` 中的 `base` 配置是否与仓库名一致
- 确保 `base` 路径以 `/` 开头和结尾，如 `/frontend/`

### 2. 部署后资源加载失败 (404)

**原因**: 同上，base 路径配置问题

**解决方法**: 
- 修改 `vite.config.ts` 中的 `base` 配置
- 重新提交并推送代码

### 3. GitHub Actions 工作流失败

**可能原因**:
- 没有正确配置 GitHub Pages 设置
- 仓库的 Actions 权限不足

**解决方法**:
1. 确保在仓库 Settings > Pages 中选择了 "GitHub Actions" 作为源
2. 检查 Settings > Actions > General > Workflow permissions
   - 选择 "Read and write permissions"
   - 勾选 "Allow GitHub Actions to create and approve pull requests"

### 4. 部署后 API 请求失败

**原因**: 前端部署到 GitHub Pages 后，可能存在跨域问题

**解决方法**:
- 确保后端 API 配置了正确的 CORS 策略
- 检查 `src/store/apiConfig.ts` 和 `src/utils/apiConfig.ts` 中的 API 地址配置

## 📚 相关资源

- [GitHub Pages 官方文档](https://docs.github.com/en/pages)
- [GitHub Actions 官方文档](https://docs.github.com/en/actions)
- [Vite 部署指南](https://vitejs.dev/guide/static-deploy.html#github-pages)
- [pnpm 官方文档](https://pnpm.io/)

## 💡 提示

- 首次部署可能需要几分钟时间
- 后续部署通常在 1-3 分钟内完成
- 可以通过 Actions 标签页查看详细的构建日志
- 部署成功后，GitHub Pages 地址会显示在仓库的 About 部分

