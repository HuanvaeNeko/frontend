'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { useGroupStore } from '@/features/chat/store/groupStore'
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
 * 创建群聊对话框，从 `GroupList.tsx` 抽出（Task 8）：`ContactsList` 的
 * `?add=create-group` 面板只该是一个「创建群」表单，不该渲染整份主列表——
 * 渲染整份主列表会让点击行写 `chatStore.selectedConversation` 却不改 URL
 * （终审 finding #4）。代码逐行搬自原 `GroupList.tsx` 的 dialogVariants /
 * 建群四个 state / handleCreateGroup / createPortal 对话框 JSX。
 */
export function CreateGroupDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: () => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { createGroup } = useGroupStore()

  const [groupName, setGroupName] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  // 建群时是否需要入群审核。批 3 之前这里是五档 `joinMode`，那套模型连同
  // `groups."join-mode"` 列一起被 migration 043 删掉了（doc:64-75）。
  // 初值取后端默认值 true（不传该字段时后端就按需审核建群，doc:60）。
  const [joinApprovalRequired, setJoinApprovalRequired] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 创建群聊
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast({
        title: t('chat.groupList.error'),
        description: t('chat.groupList.enterGroupName'),
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await createGroup(groupName.trim(), groupDescription.trim() || undefined, joinApprovalRequired)
      toast({
        title: t('chat.groupList.success'),
        description: t('chat.groupList.createSuccess'),
      })
      onCreated?.()
      onClose()
      setGroupName('')
      setGroupDescription('')
      setJoinApprovalRequired(true)
    } catch (error) {
      toast({
        title: t('chat.groupList.failed'),
        description: error instanceof Error ? error.message : t('chat.groupList.createFailed'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <>
              {/* 遮罩层 */}
              <motion.div
                className="fixed inset-0 z-[9998] bg-foreground/45"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
              />
              {/* 对话框 */}
              <motion.div
                className="fixed inset-0 flex items-center justify-center z-[9999] pointer-events-none p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
              <motion.div
                className="w-[400px] max-w-full pointer-events-auto rounded-2xl border bg-card p-6 shadow-xl"
                variants={dialogVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-semibold mb-6 text-foreground">{t('chat.groupList.createGroup')}</h3>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="create-group-name" className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.groupList.groupNameRequired')}</label>
                    <Input
                      id="create-group-name"
                      type="text"
                      placeholder={t('chat.groupList.enterGroupNamePlaceholder')}
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      maxLength={30}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label htmlFor="create-group-desc" className="text-sm font-medium text-foreground mb-1.5 block">{t('chat.groupList.groupDescOptional')}</label>
                    <Input
                      id="create-group-desc"
                      type="text"
                      placeholder={t('chat.groupList.groupDescPlaceholder')}
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      maxLength={200}
                      className="h-10"
                    />
                  </div>

                  <div>
                    <label htmlFor="create-group-join-approval" className="text-sm font-medium text-foreground mb-1.5 block">
                      {t('chat.groupList.joinApprovalLabel')}
                    </label>
                    <select
                      id="create-group-join-approval"
                      className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] cursor-pointer"
                      value={joinApprovalRequired ? 'required' : 'open'}
                      onChange={(e) => setJoinApprovalRequired(e.target.value === 'required')}
                    >
                      <option value="required">{t('chat.groupList.joinApprovalRequiredDesc')}</option>
                      <option value="open">{t('chat.groupList.joinApprovalOpenDesc')}</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    className="flex-1 h-10"
                    onClick={() => {
                      onClose()
                      setGroupName('')
                      setGroupDescription('')
                      setJoinApprovalRequired(true)
                    }}
                    disabled={submitting}
                  >
                    {t('chat.groupList.cancel')}
                  </Button>
                  <Button
                    className="flex-1 h-10"
                    onClick={handleCreateGroup}
                    disabled={submitting || !groupName.trim()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('chat.groupList.creating')}
                      </>
                    ) : (
                      t('chat.groupList.create')
                    )}
                  </Button>
                </div>
              </motion.div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
