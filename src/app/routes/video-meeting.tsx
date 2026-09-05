import { dynamic } from '@/lib/dynamic'

const VideoMeetingPage = dynamic(() => import('@/features/webrtc/components/VideoMeeting'))

export default function VideoMeeting() {
  return <VideoMeetingPage />
}
