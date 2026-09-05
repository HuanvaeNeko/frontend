# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 只装 package.json 里 dependencies 那部分（react-router / three / framer-motion /
# gsap / @sentry/react-router 等运行时用得到的包）。vite / @react-router/dev /
# vitest / playwright / typescript / tailwindcss 这些构建期工具本来就分类在
# devDependencies 里，`--production` 直接复用这个已有分类，不是新引入的判断。
# runtime 阶段只从这个 stage 拿 node_modules；build 阶段仍然用上面的 deps（全量）。
FROM oven/bun:1.3.14-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* 在构建时被内联进产物：改这些值必须重建镜像，重启容器无效
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_SENTRY_DSN
ARG VITE_APP_VERSION
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_APP_VERSION=$VITE_APP_VERSION
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
# server/index.ts 用相对路径直接 import ../src/config/filterSensitiveData
# （零运行时依赖，见该文件顶部注释）——它不经过 react-router 的构建产物，
# 是 Bun 在运行时对 server/index.ts 做 TS 解析时才会去找的普通文件系统路径，
# 漏拷贝会在容器里直接 `Cannot find module` 崩溃退出（已实测复现）。
# 只拷这一个文件，不拷整个 src/（1.4M 客户端源码，服务端运行时用不到）。
COPY --from=build /app/src/config/filterSensitiveData.ts ./src/config/filterSensitiveData.ts
# 构建期守卫：在 runtime 阶段实际拥有的文件集合上跑一遍 bun 自带的 bundler，
# 逼它解析 server/index.ts 里所有相对路径 import（含上面这类不经过 react-router
# 构建产物、只在容器启动时才由 Bun 按相对路径解析的 import）。
# 故意不放在上面 build 阶段做这件事：build 阶段 `COPY . .` 拷了整个仓库，
# src/ 全量都在，任何"文件其实在仓库里、只是 runtime 阶段忘了 COPY"的疏漏
# 在那里永远测不出来——这恰恰是本次事故的真实形状。放在这里用的才是最终
# 镜像启动时会看到的同一份最小文件集合，漏拷贝会在这一步直接让 docker build
# 失败退出，不用等到容器里才 crash-loop。
# --packages=external：只让 bundler 真正解析本地相对路径 import（这才是本守卫
# 要盯的东西），npm 包一律当外部依赖跳过——不加这个会连 @babel/core 这类被
# react-router SSR 产物间接带进来、自己内部用 try/require 探测可选 preset 是否
# 装了的第三方包也一起拉进解析图，产生和"漏拷贝 src 文件"毫无关系的假失败
# （已实测复现：报 "Could not resolve: @babel/preset-typescript/package.json"，
# 但容器实际从没走到那条 babel 代码路径，健康检查和真实请求都正常）。
# npm 包本身是否装全，交给下面 healthy 检查 + 手动 curl 验证，不归这一步管。
# --outdir 的产物只是校验副产品，同一层内 rm 掉，不留进最终镜像。
RUN bun build server/index.ts --target=bun --packages=external --outdir=/tmp/import-check \
    && rm -rf /tmp/import-check
USER bun
EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]
