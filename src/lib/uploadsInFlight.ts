/**
 * 进行中的文件上传计数。
 *
 * 部署后的静默更新（`ServiceWorkerUpdater`）要整页刷新，刷新会直接掐断正在跑的分片上传，
 * 所以它刷新前要问一句「现在有没有上传」。
 *
 * 单独成一个模块、不放进 `@/api/storage`，是因为更新器挂在根布局上：从 storage 导入
 * 会把整个上传 API（连同 API 客户端）拉进每个页面的首屏包。
 */
let count = 0

/** 把一次上传登记为进行中，直到它结束（成功或失败都会注销） */
export function trackUpload<T>(run: () => Promise<T>): Promise<T> {
  count++
  return run().finally(() => {
    count--
  })
}

export function hasUploadsInFlight(): boolean {
  return count > 0
}
