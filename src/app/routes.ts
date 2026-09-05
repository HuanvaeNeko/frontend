import { type RouteConfig, index, layout, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('downloads', 'routes/downloads.tsx'),
  route('~offline', 'routes/offline.tsx'),

  route('app', 'routes/app-index.tsx'),

  layout('routes/auth-layout.tsx', [
    route('app/login', 'routes/login.tsx'),
    route('app/register', 'routes/register.tsx'),
  ]),

  layout('routes/protected-layout.tsx', [
    route('app/chat', 'routes/chat.tsx'),
    route('app/friends', 'routes/friends.tsx'),
    route('app/groups', 'routes/groups.tsx'),
    route('app/files', 'routes/files.tsx'),
    route('app/webrtc', 'routes/webrtc.tsx'),
    route('app/ai-chat', 'routes/ai-chat.tsx'),
    route('app/video-meeting', 'routes/video-meeting.tsx'),
    route('app/devices', 'routes/devices.tsx'),
    route('app/settings', 'routes/settings.tsx'),
    route('app/profile', 'routes/profile.tsx'),
  ]),
] satisfies RouteConfig
