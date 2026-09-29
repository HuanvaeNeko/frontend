import { defineMessages } from './define'

/**
 * 通用与好友 / 认证 / 连接 / 其他 API 模块的兜底报错。
 *
 * 这些文案在组件外（API 模块、store）产出，一律用 `translate()` **在抛错 / 写 state 的那一刻**取，
 * 不能写成模块级常量——那样会钉死在模块加载时的语言上。
 *
 * 与界面上某个 key 逐字同义的直接复用那个 key，不在这里重复：删除好友 → shell.contacts.removeFailed、
 * 取消拉黑 → shell.settings.blacklist.removeFailed、创建客户端 → shell.oauth.clients.createFailed、
 * 取消授权 → shell.oauth.revokeFailed、提示音类型 / 大小 / 不可用 → shell.settings.sounds.err*。
 */
export const errors = defineMessages(
  {
    /** apiEnvelope 的默认 fallbackMessage */
    requestFailed: '请求失败',
    /** apiEnvelope：响应体读到一半断了（前面会带上 endpoint） */
    readResponseFailed: '读取响应失败',
    /** apiClient 的 30 秒超时 */
    requestTimeout: '请求超时，请检查网络连接',
    auth: {
      /**
       * friends.ts 拿不到自己的 user_id 时抛的。它同时是 apiClient.isAuthError 认的「前端哨兵」——
       * 那边按**每种语言**的这句话整串比对，改这里的措辞不用改那边。
       */
      notLoggedIn: '用户未登录',
      loginFailed: '登录失败',
      registerFailed: '注册失败',
      /** GET /api/session 502 / 网络失败：ProtectedRoute 连同「重试」按钮一起显示 */
      sessionCheckFailed: '无法确认登录状态，请稍后重试',
      /** GET /api/session 2xx 但 body 不是预期形状——与上一句必须不同，见 authStore.restoreSession */
      sessionUnexpected: '会话响应形状不符合预期',
    },
    devices: {
      load: '获取设备列表失败',
      revoke: '撤销设备失败',
    },
    friends: {
      /**
       * 不是报错：加好友时验证消息留空，friends.ts 代发的默认招呼语（会显示在对方的好友申请里）。
       * 跟 friends.ts 的其余文案放在一起，按发送者当前的界面语言取。
       */
      defaultRequestReason: '你好，我想加你为好友',
      loadList: '获取好友列表失败',
      loadPending: '获取待处理请求失败',
      loadSent: '获取已发送请求失败',
      sendRequest: '发送好友请求失败',
      approve: '同意好友请求失败',
      reject: '拒绝好友请求失败',
      setRemark: '设置备注失败',
      loadBlacklist: '获取黑名单失败',
      block: '拉黑失败',
    },
    ws: {
      /** 重连次数用尽 */
      unreachable: '无法连接到服务器，请刷新页面重试',
      connectionError: 'WebSocket 连接错误',
      connectFailed: 'WebSocket 连接失败',
    },
    discovery: {
      search: '搜索失败',
    },
    bots: {
      load: '加载机器人失败',
    },
    miniapps: {
      load: '加载小程序失败',
    },
    oauth: {
      loadClients: '加载 OAuth 客户端失败',
      deleteClient: '删除客户端失败',
      resetSecret: '重置密钥失败',
      loadGrants: '加载已授权应用失败',
      authorize: '授权请求失败',
    },
    lowcode: {
      loadOperators: '获取算子列表失败',
      loadOperatorDetail: '获取算子详情失败',
      createWorkflow: '创建流程失败',
      loadWorkflows: '获取流程列表失败',
      loadWorkflowDetail: '获取流程详情失败',
      updateWorkflow: '更新流程失败',
      deleteWorkflow: '删除流程失败',
      validateWorkflow: '验证流程失败',
      exportWorkflow: '导出流程失败',
      validateDefinition: '验证流程定义失败',
      execute: '执行流程失败',
      loadExecutionResult: '查询执行结果失败',
      saveCategoryConfig: '保存分类配置失败',
      loadCategoryConfig: '获取分类配置失败',
      deleteCategoryConfig: '删除分类配置失败',
      validateCategoryConfig: '验证分类配置失败',
      loadCategoryOperators: '获取可分类算子列表失败',
      executeConfig: '执行流程配置失败',
      validateConfig: '验证流程配置失败',
      importConfig: '导入流程配置失败',
    },
    diagnostic: {
      report: '上报诊断信息失败',
      loadStatistics: '获取诊断统计失败',
      loadErrorLogs: '获取错误日志失败',
      loadReports: '获取诊断报告失败',
      loadReportDetail: '获取诊断报告详情失败',
      updateReportStatus: '更新诊断报告状态失败',
      loadReportFile: '获取诊断报告原始文件失败',
    },
    sound: {
      /** IndexedDB 请求失败却没带 error 对象时的兜底 */
      storageRequest: 'IndexedDB 请求失败',
      openFailed: '打开提示音库失败',
    },
  },
  {
    requestFailed: 'Request failed',
    readResponseFailed: 'Failed to read the response',
    requestTimeout: 'Request timed out. Please check your network connection.',
    auth: {
      notLoggedIn: 'Not signed in',
      loginFailed: 'Login failed',
      registerFailed: 'Registration failed',
      sessionCheckFailed: 'Couldn’t confirm your sign-in status. Please try again later.',
      sessionUnexpected: 'The session response had an unexpected format',
    },
    devices: {
      load: 'Failed to load devices',
      revoke: 'Failed to remove device',
    },
    friends: {
      defaultRequestReason: 'Hi, I’d like to add you as a friend',
      loadList: 'Failed to load friends',
      loadPending: 'Failed to load friend requests',
      loadSent: 'Failed to load sent requests',
      sendRequest: 'Failed to send friend request',
      approve: 'Failed to accept friend request',
      reject: 'Failed to decline friend request',
      setRemark: 'Failed to set remark',
      loadBlacklist: 'Failed to load blocked users',
      block: 'Failed to block user',
    },
    ws: {
      unreachable: 'Can’t connect to the server. Please refresh the page and try again.',
      connectionError: 'WebSocket connection error',
      connectFailed: 'WebSocket connection failed',
    },
    discovery: {
      search: 'Search failed',
    },
    bots: {
      load: 'Failed to load bots',
    },
    miniapps: {
      load: 'Failed to load mini apps',
    },
    oauth: {
      loadClients: 'Failed to load OAuth clients',
      deleteClient: 'Failed to delete client',
      resetSecret: 'Failed to reset secret',
      loadGrants: 'Failed to load authorized apps',
      authorize: 'Authorization request failed',
    },
    lowcode: {
      loadOperators: 'Failed to load operators',
      loadOperatorDetail: 'Failed to load operator details',
      createWorkflow: 'Failed to create workflow',
      loadWorkflows: 'Failed to load workflows',
      loadWorkflowDetail: 'Failed to load workflow details',
      updateWorkflow: 'Failed to update workflow',
      deleteWorkflow: 'Failed to delete workflow',
      validateWorkflow: 'Failed to validate workflow',
      exportWorkflow: 'Failed to export workflow',
      validateDefinition: 'Failed to validate workflow definition',
      execute: 'Failed to run workflow',
      loadExecutionResult: 'Failed to load execution result',
      saveCategoryConfig: 'Failed to save category config',
      loadCategoryConfig: 'Failed to load category config',
      deleteCategoryConfig: 'Failed to delete category config',
      validateCategoryConfig: 'Failed to validate category config',
      loadCategoryOperators: 'Failed to load categorizable operators',
      executeConfig: 'Failed to run workflow config',
      validateConfig: 'Failed to validate workflow config',
      importConfig: 'Failed to import workflow config',
    },
    diagnostic: {
      report: 'Failed to submit diagnostic report',
      loadStatistics: 'Failed to load diagnostic statistics',
      loadErrorLogs: 'Failed to load error logs',
      loadReports: 'Failed to load diagnostic reports',
      loadReportDetail: 'Failed to load diagnostic report details',
      updateReportStatus: 'Failed to update diagnostic report status',
      loadReportFile: 'Failed to load the raw diagnostic report file',
    },
    sound: {
      storageRequest: 'IndexedDB request failed',
      openFailed: 'Failed to open the sound library',
    },
  },
)
