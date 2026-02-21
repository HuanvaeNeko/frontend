'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/features/chat/store/chatStore'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useWSStore } from '@/store/wsStore'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useGroupStore } from '@/features/chat/store/groupStore'
import { useRouter, usePathname } from 'next/navigation'
import FriendList from '@/features/chat/components/sidebar/FriendList'
import GroupList from '@/features/chat/components/sidebar/GroupList'
import ChatWindow from '@/features/chat/components/ChatWindow'
import FileManager from '@/features/chat/components/FileManager'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'
import { Input } from '@/components/ui/input'
import { ArrowLeft, MessageCircle, Users, FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/I18nProvider'

export default function ChatPage() {
  const { t } = useI18n()
  const _router = useRouter()
  const pathname = usePathname()
  
  const { user, accessToken } = useAuthStore()
  const { activeTab, setActiveTab, selectedConversation, setSelectedConversation } = useChatStore()
  const { connect: connectWS } = useWSStore()
  const { loadProfile } = useProfileStore()
  const { loadFriends, loadPendingRequests, loadSentRequests } = useFriendsStore()
  const { loadMyGroups } = useGroupStore()
  
  // Mobile sub-tabs state
  const [subTab, setSubTab] = useState<'main' | 'new' | 'sent' | 'invites' | 'upload'>('main')
  const [searchQuery, setSearchQuery] = useState('')

  // Initialization logic
  useEffect(() => {
    if (user && accessToken) {
      if (!useChatStore.getState().wsConnected) {
        connectWS()
      }
      loadProfile().catch(console.error)
      loadFriends().catch(console.error)
      loadPendingRequests().catch(console.error)
      loadSentRequests().catch(console.error)
      loadMyGroups().catch(console.error)
    }
  }, [user, accessToken, connectWS, loadProfile, loadFriends, loadPendingRequests, loadSentRequests, loadMyGroups])

  // Route-based tab switching
  useEffect(() => {
    if (pathname === ROUTES.app.chatFriends) setActiveTab('friends')
    else if (pathname === ROUTES.app.chatGroups) setActiveTab('groups')
    else if (pathname === ROUTES.app.chatFiles) setActiveTab('files')
    else if (pathname === ROUTES.app.chat && !activeTab) setActiveTab('friends') 
  }, [pathname, setActiveTab, activeTab])

  const handleMobileBack = () => {
    setSelectedConversation(null)
  }

  const renderSidebarContent = () => {
    switch (activeTab) {
      case 'friends': return <FriendList subTab={subTab === 'invites' ? 'new' : subTab as 'main' | 'new' | 'sent'} searchQuery={searchQuery} />
      case 'groups': return <GroupList subTab={subTab === 'upload' ? 'main' : subTab as 'main' | 'invites'} searchQuery={searchQuery} />
      case 'files': return <FileManager subTab={['main', 'upload'].includes(subTab) ? subTab as 'main' | 'upload' : 'main'} />
      default: return <FriendList subTab="main" searchQuery="" />
    }
  }

  const getSubTabs = () => {
    switch (activeTab) {
      case 'friends':
        return [
          { id: 'main', label: t('chat.page.subTabs.friends.main'), icon: Users },
          { id: 'new', label: t('chat.page.subTabs.friends.new'), icon: Users },
          { id: 'sent', label: t('chat.page.subTabs.friends.sent'), icon: Users },
        ]
      case 'groups':
        return [
          { id: 'main', label: t('chat.page.subTabs.groups.main'), icon: MessageCircle },
          { id: 'invites', label: t('chat.page.subTabs.groups.invites'), icon: MessageCircle },
        ]
      case 'files':
        return [
          { id: 'main', label: t('chat.page.subTabs.files.main'), icon: FileText },
          { id: 'upload', label: t('chat.page.subTabs.files.upload'), icon: FileText },
        ]
      default:
        return []
    }
  }

  const subTabs = getSubTabs()
  const isDetailView = selectedConversation

  return (
    <div className="flex h-full w-full overflow-hidden bg-background/50 backdrop-blur-3xl relative">
      
      {/* 1. List Panel (Responsive) */}
      <div 
        className={cn(
          "flex flex-col h-full bg-card/40 backdrop-blur-xl border-r border-border/40 w-full md:w-[340px] lg:w-[380px] shrink-0 transition-all duration-300 z-10",
          isDetailView ? "hidden md:flex" : "flex"
        )}
      >
        {/* Header / Tabs */}
        <div className="flex flex-col shrink-0">
          <div className="h-16 flex items-center px-5 justify-between">
             <h1 className="font-bold text-xl tracking-tight text-foreground/90 truncate">
               {activeTab === 'friends' && t('chat.page.tabs.friends')}
               {activeTab === 'groups' && t('chat.page.tabs.groups')}
               {activeTab === 'files' && t('chat.page.tabs.files')}
             </h1>
             {/* Tab Switcher */}
             <div className="flex gap-1 bg-muted/50 p-1 rounded-xl shrink-0">
                <Button data-testid="tab-friends" variant="ghost" size="icon" onClick={() => setActiveTab('friends')} className={cn("h-8 w-8 rounded-lg transition-all", activeTab==='friends' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}><Users className="w-4 h-4"/></Button>
                <Button data-testid="tab-groups" variant="ghost" size="icon" onClick={() => setActiveTab('groups')} className={cn("h-8 w-8 rounded-lg transition-all", activeTab==='groups' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}><MessageCircle className="w-4 h-4"/></Button>
                <Button data-testid="tab-files" variant="ghost" size="icon" onClick={() => setActiveTab('files')} className={cn("h-8 w-8 rounded-lg transition-all", activeTab==='files' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}><FileText className="w-4 h-4"/></Button>
             </div>
          </div>
          
          {/* Sub Tabs */}
          {activeTab !== 'webrtc' && (
            <div className="px-5 pb-4 space-y-4">
              {subTabs.length > 0 && (
                <div className="flex gap-1 bg-muted/30 p-1 rounded-xl border border-border/20">
                  {subTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSubTab(tab.id as 'main' | 'new' | 'sent' | 'invites' | 'upload')}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all duration-200",
                        subTab === tab.id 
                          ? "bg-background text-primary shadow-sm ring-1 ring-border/50" 
                          : "text-muted-foreground hover:bg-background/40 hover:text-foreground"
                      )}
                    >
                      {tab.icon && <tab.icon className="w-3.5 h-3.5 opacity-70" />}
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
              {subTab === 'main' && (
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('common.search')}
                    className="pl-9 h-10 bg-muted/30 border-transparent hover:bg-muted/50 focus:bg-background focus:border-primary/20 focus:ring-2 focus:ring-primary/10 rounded-xl transition-all"
                  />
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* List Content */}
        <div className="flex-1 overflow-hidden relative">
           {renderSidebarContent()}
        </div>
      </div>

      {/* 2. Detail Panel (Chat Window) */}
      <div 
        className={cn(
          "flex-1 flex flex-col h-full bg-background/60 min-w-0 z-20 relative shadow-[-1px_0_20px_rgba(0,0,0,0.02)]", 
          isDetailView ? "hidden md:flex" : "hidden md:flex" // Force hide on mobile if not detail view
        )}
      >
        {selectedConversation ? (
          <div className="h-full flex flex-col w-full">
             <div className="md:hidden h-14 border-b flex items-center px-2 shrink-0 bg-card/95 backdrop-blur absolute top-0 left-0 right-0 z-50">
                <Button variant="ghost" size="icon" onClick={handleMobileBack}>
                  <ArrowLeft className="w-6 h-6" />
                </Button>
                <span className="ml-2 font-medium truncate">{selectedConversation.name}</span>
             </div>
             
             <div className={cn("flex-1 h-full w-full", "pt-14 md:pt-0")}>
               <ChatWindow hideMobileHeader={true} />
             </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground bg-muted/10 w-full">
            <div className="flex flex-col items-center gap-4">
              <MessageCircle className="w-16 h-16 opacity-20" />
              <p>{t('chat.window.selectConversation') || '选择一个会话开始聊天'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Detail View Overlay */}
      {isDetailView && (
        <div className="fixed inset-0 z-50 bg-background md:hidden flex flex-col h-[100dvh]">
          {selectedConversation ? (
            <div className="h-full flex flex-col w-full">
               <div className="h-14 border-b flex items-center px-2 shrink-0 bg-card/95 backdrop-blur z-50">
                  <Button variant="ghost" size="icon" onClick={handleMobileBack}>
                    <ArrowLeft className="w-6 h-6" />
                  </Button>
                  <span className="ml-2 font-medium truncate">{selectedConversation.name}</span>
               </div>
               <div className="flex-1 h-full w-full relative">
                 <ChatWindow hideMobileHeader={true} />
               </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
