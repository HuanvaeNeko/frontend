import VideoMeetingClient from './client'

// 静态导出：返回空数组，不预生成任何路径
// 客户端会通过 404.html 回退处理这些路由
export function generateStaticParams() {
  return []
}

export default function VideoMeetingRoomPage() {
  return <VideoMeetingClient />
}
