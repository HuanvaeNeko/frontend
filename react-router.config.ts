import type { Config } from '@react-router/dev/config'

export default {
  appDirectory: 'src/app',
  // SSR 只渲染 HTML 外壳；业务数据全部客户端拉取（见 spec §1.3）
  ssr: true,
} satisfies Config
