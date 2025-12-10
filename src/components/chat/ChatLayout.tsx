import { motion } from 'framer-motion'
import { useChatStore } from '@/store/chatStore'
import Sidebar from './Sidebar'
import ConversationList from './ConversationList'
import ChatWindow from './ChatWindow'
import { fadeInVariants } from '@/utils/motionAnimations'

export default function ChatLayout() {
  const { selectedConversation, activeTab } = useChatStore()

  return (
    <motion.div
      variants={fadeInVariants}
      initial="hidden"
      animate="visible"
      className="h-screen flex overflow-hidden bg-gray-50"
    >
      {/* 左侧功能栏 */}
      <Sidebar />

      {/* 中间列表区域 */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <ConversationList />
      </div>

      {/* 右侧内容区域 */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <ChatWindow />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">HuanVae Chat</h2>
              <p className="text-gray-500">
                {activeTab === 'friends' && '选择一个好友开始聊天'}
                {activeTab === 'groups' && '选择一个群聊开始聊天'}
                {activeTab === 'files' && '管理你的文件'}
                {activeTab === 'webrtc' && '开始视频通话'}
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
