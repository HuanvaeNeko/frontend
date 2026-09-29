'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFriendsStore } from '@/features/chat/store/friendsStore'
import { useToast } from '@/hooks/use-toast'
import { useI18n } from '@/i18n/I18nProvider'

// 弹窗动画
const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.2 },
  },
}

/**
 * 添加好友对话框，从 `FriendList.tsx` 的主列表模式抽出（同 `CreateGroupDialog` 的做法）。
 *
 * 新壳的联系人栏自己渲染好友列表，`?add=friend` 原来渲染的是 FriendList 的 'new' 子面板——
 * 那只是「待处理的申请」，没有输入框：网页端因此根本没有入口能加好友。现在 `?add=friend`
 * 直接打开这个对话框，关闭即清 add 参数。逻辑逐行搬自原 FriendList 的 handleSendRequest。
 */
export function AddFriendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const sendFriendRequest = useFriendsStore((s) => s.sendFriendRequest)
  const [targetUserId, setTargetUserId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const close = () => {
    setTargetUserId('')
    setReason('')
    onClose()
  }

  const handleSendRequest = async () => {
    if (!targetUserId.trim()) {
      toast({
        title: t('chat.friendList.error'),
        description: t('chat.friendList.enterUserId'),
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await sendFriendRequest(targetUserId.trim(), reason.trim() || undefined)
      toast({
        title: t('chat.friendList.success'),
        description: t('chat.friendList.requestSent'),
      })
      close()
    } catch (error) {
      toast({
        title: t('chat.friendList.failed'),
        description: error instanceof Error ? error.message : t('chat.friendList.requestSendFailed'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* 遮罩层 */}
          <motion.div
            className="fixed inset-0 z-[9998] bg-foreground/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          {/* 对话框 */}
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-friend-title"
              className="w-[400px] max-w-full pointer-events-auto rounded-2xl border bg-background p-6 shadow-xl"
              variants={dialogVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="add-friend-title" className="text-xl font-semibold mb-6 text-foreground">{t('chat.friendList.addFriend')}</h3>

              <form
                className="space-y-4"
                onSubmit={(e) => { e.preventDefault(); void handleSendRequest() }}
              >
                <div>
                  <label htmlFor="add-friend-user-id" className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.friendList.userId')}</label>
                  <Input
                    id="add-friend-user-id"
                    type="text"
                    autoFocus
                    placeholder={t('chat.friendList.enterUserIdPlaceholder')}
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div>
                  <label htmlFor="add-friend-reason" className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.friendList.verifyMessageOptional')}</label>
                  <Input
                    id="add-friend-reason"
                    type="text"
                    placeholder={t('chat.friendList.verifyPlaceholder')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-10"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" className="flex-1 h-10" onClick={close} disabled={submitting}>
                    {t('chat.friendList.cancel')}
                  </Button>
                  <Button type="submit" className="flex-1 h-10" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('chat.friendList.sending')}
                      </>
                    ) : (
                      t('chat.friendList.sendRequest')
                    )}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
