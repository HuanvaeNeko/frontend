import { defineMessages } from './define'

/**
 * 维护页、安装提示、加载中、重试等系统级界面。
 *
 * 逐字同义的直接复用已有 key，不在这里重复：加载中… → shell.list.loading、重试 → shell.list.retry、
 * 更多 → home.more、关闭 → common.close、语言名 → settings.languageOptions.*。
 */
export const system = defineMessages(
  {
    maintenance: {
      badge: '服务异常',
      title: '服务暂时不可用',
      description: '无法连接后端服务，请稍后重试。',
      errorTitle: '错误信息',
      /** 调用方没给错误文案时 */
      connectFailed: '连接失败',
      retrying: '正在重试...',
      reconnect: '重新连接',
      showDiagnostics: '查看诊断信息',
      requestUrl: '请求地址',
      occurredAt: '发生时间',
      details: '详细信息',
    },
    installPrompt: {
      /** 收起时右下角的入口按钮 */
      open: '安装客户端',
      title: '安装 Huanvae Chat 客户端',
      description: '更稳连接、通知更及时，推荐桌面端使用。',
      direct: '直连',
      proxy: '代理线路',
      snooze: '{n} 天不再提示',
    },
    preparingWorkspace: '正在准备工作台...',
    /** 好友列表为空（且没在搜索）时的引导 */
    addFriendsToChat: '添加好友开始聊天吧！',
  },
  {
    maintenance: {
      badge: 'Service issue',
      title: 'Service temporarily unavailable',
      description: 'Can’t reach the server. Please try again later.',
      errorTitle: 'Error message',
      connectFailed: 'Connection failed',
      retrying: 'Retrying...',
      reconnect: 'Reconnect',
      showDiagnostics: 'Show diagnostics',
      requestUrl: 'Request URL',
      occurredAt: 'Time',
      details: 'Details',
    },
    installPrompt: {
      open: 'Install app',
      title: 'Install the Huanvae Chat app',
      description: 'A steadier connection and more timely notifications. Recommended on desktop.',
      direct: 'Direct',
      proxy: 'Proxy mirror',
      snooze: 'Don’t show for {n} days',
    },
    preparingWorkspace: 'Preparing your workspace...',
    addFriendsToChat: 'Add friends to start chatting!',
  },
)
