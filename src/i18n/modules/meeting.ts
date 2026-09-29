import { defineMessages } from './define'

/** 视频会议页（VideoMeeting.tsx）与 WebRTC API。中文措辞参考 APP src/meeting/* */
export const meeting = defineMessages(
  {
    guest: '访客',
    // APP MeetingPage.tsx:1055（原来网页写「正在加入会议」）
    connecting: '正在连接...',
    errorTitle: '无法加入会议',
    backToChat: '返回聊天',
    me: '我',
    host: '主持人',
    // APP MeetingPage.tsx:1000（原来网页写「参与者 · {n}」）；也用作顶栏参与者按钮的可读名称
    participants: '参与者 ({n})',
    closeParticipants: '关闭参与者面板',
    // 底部控制栏：APP MeetingPage.tsx:1099–1132（网页这几颗纯图标按钮原来没有任何可读名称）
    controls: {
      micOff: '关闭麦克风',
      micOn: '开启麦克风',
      cameraOff: '关闭摄像头',
      cameraOn: '开启摄像头',
      shareScreen: '共享屏幕',
      stopSharing: '停止共享',
      leave: '离开会议',
    },
    screenShare: {
      title: '屏幕共享设置',
      description: '选择分辨率和帧率',
      resolution: '分辨率',
      frameRate: '帧率',
      start: '开始共享',
    },
    permission: {
      title: '媒体权限被拒绝',
      fallback: '需要授权才能使用摄像头和麦克风',
      stepsTitle: '请按照以下步骤开启权限：',
      step1: '点击浏览器地址栏左侧的锁定图标',
      step2: '找到「摄像头」和「麦克风」选项',
      step3: '将权限设置为「允许」',
      step4: '刷新页面',
      // {file} / {policy} 渲染成 <code>
      deployHint: '若部署在 Cloudflare Pages，请确认站点 {file} 中 Permissions-Policy 包含 {policy}。',
      later: '暂不开启',
      reload: '刷新页面',
    },
    // 媒体设备报错（parseMediaError）。APP src/meeting/useWebRTC.ts:219–281、components/MediaPermissionGuide.tsx:94–104
    media: {
      camera: '摄像头',
      microphone: '麦克风',
      denied: '{device}权限被拒绝',
      notFound: '未检测到{device}',
      inUse: '{device}被其他应用占用',
      // APP useWebRTC.ts:273（原来网页写「{device}初始化失败: …」）
      failedWithDetail: '{device}出错: {detail}',
      // APP MediaPermissionGuide.tsx:104（原来网页写「{device}初始化失败」）
      failed: '{device}访问失败',
      insecureContext: '请使用 HTTPS 或 localhost 访问以启用媒体设备',
      // APP useWebRTC.ts:1213（原来网页写「未检测到摄像头或麦克风」）
      noDevices: '未检测到音视频设备',
      screenShareInsecure: '屏幕共享需要 HTTPS 或 localhost 环境',
    },
    errors: {
      missingRoomId: '房间号不能为空',
      // APP MeetingEntryModal.tsx:213 / :257（原来网页写「初始化会议失败」）
      joinFailed: '加入会议失败',
      signalingFailed: '信令连接失败',
      roomClosed: '房间已关闭: {reason}',
      wrongPassword: '密码错误',
      roomNotFound: '房间不存在',
      roomUnavailable: '房间已过期或已满',
      iceServersFailed: '获取 ICE 服务器配置失败',
    },
  },
  {
    guest: 'Guest',
    connecting: 'Connecting...',
    errorTitle: "Can't join the meeting",
    backToChat: 'Back to chat',
    me: 'You',
    host: 'Host',
    participants: 'Participants ({n})',
    closeParticipants: 'Close participants panel',
    controls: {
      micOff: 'Turn off microphone',
      micOn: 'Turn on microphone',
      cameraOff: 'Turn off camera',
      cameraOn: 'Turn on camera',
      shareScreen: 'Share screen',
      stopSharing: 'Stop sharing',
      leave: 'Leave meeting',
    },
    screenShare: {
      title: 'Screen sharing settings',
      description: 'Choose the resolution and frame rate',
      resolution: 'Resolution',
      frameRate: 'Frame rate',
      start: 'Start sharing',
    },
    permission: {
      title: 'Media permission denied',
      fallback: 'Camera and microphone access is required',
      stepsTitle: 'To allow access:',
      step1: 'Click the lock icon at the left of the address bar',
      step2: 'Find the “Camera” and “Microphone” settings',
      step3: 'Set them to “Allow”',
      step4: 'Reload the page',
      deployHint: 'If the site is deployed on Cloudflare Pages, make sure the Permissions-Policy in {file} includes {policy}.',
      later: 'Not now',
      reload: 'Reload page',
    },
    // 英文里设备名落在句中，所以是小写；每句都把 {device} 放在不需要大写的位置
    media: {
      camera: 'camera',
      microphone: 'microphone',
      denied: 'Permission to use the {device} was denied',
      notFound: 'No {device} detected',
      inUse: 'The {device} is being used by another app',
      failedWithDetail: 'Something went wrong with the {device}: {detail}',
      failed: "Couldn't access the {device}",
      insecureContext: 'Open this page over HTTPS or on localhost to use media devices',
      noDevices: 'No camera or microphone detected',
      screenShareInsecure: 'Screen sharing requires HTTPS or localhost',
    },
    errors: {
      missingRoomId: 'Room ID is missing',
      joinFailed: 'Failed to join the meeting',
      signalingFailed: 'Failed to connect to the meeting server',
      roomClosed: 'The room was closed: {reason}',
      wrongPassword: 'Incorrect password',
      roomNotFound: 'Room not found',
      roomUnavailable: 'The room has expired or is full',
      iceServersFailed: 'Failed to get the ICE server configuration',
    },
  },
)
