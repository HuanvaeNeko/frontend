# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

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
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
# server/index.ts 用相对路径直接 import ../src/config/filterSensitiveData
# （零运行时依赖，见该文件顶部注释）——它不经过 react-router 的构建产物，
# 是 Bun 在运行时对 server/index.ts 做 TS 解析时才会去找的普通文件系统路径，
# 漏拷贝会在容器里直接 `Cannot find module` 崩溃退出（已实测复现）。
# 只拷这一个文件，不拷整个 src/（1.4M 客户端源码，服务端运行时用不到）。
COPY --from=build /app/src/config/filterSensitiveData.ts ./src/config/filterSensitiveData.ts
USER bun
EXPOSE 3000
CMD ["bun", "run", "server/index.ts"]
