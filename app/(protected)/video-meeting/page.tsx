'use client'

import dynamic from 'next/dynamic'

const VideoMeetingPage = dynamic(() => import('@/views/VideoMeeting'), { ssr: false })

export default function VideoMeeting() {
  return <VideoMeetingPage />
}
