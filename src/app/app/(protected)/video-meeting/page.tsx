'use client'

import dynamic from 'next/dynamic'

const VideoMeetingPage = dynamic(() => import('@/features/webrtc/components/VideoMeeting'), { ssr: false })

export default function VideoMeeting() {
  return <VideoMeetingPage />
}
