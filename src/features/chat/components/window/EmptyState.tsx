'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

export const EmptyState = memo(() => {
  const { t } = useI18n()
  
  return (
    <div className="h-full min-h-0 flex items-center justify-center overflow-hidden">
      <motion.div 
        className="text-center" 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
      >
        <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center bg-primary/10">
          <MessageCircle className="w-12 h-12 text-primary/50" />
        </div>
        <h3 className="text-2xl font-bold text-foreground mb-2">Huanvae Chat</h3>
        <p className="text-muted-foreground">{t('chat.window.selectConversation')}</p>
      </motion.div>
    </div>
  )
})

EmptyState.displayName = 'EmptyState'
