'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '@/i18n/I18nProvider'

interface TypingIndicatorProps {
  typingUsers: { userId: string }[]
  conversationType: 'friend' | 'group'
}

export const TypingIndicator = memo(({ typingUsers, conversationType }: TypingIndicatorProps) => {
  const { t } = useI18n()

  if (typingUsers.length === 0) return null

  return (
    <motion.div 
      className="px-4 py-2 flex items-center gap-2" 
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex space-x-1">
        {[0, 1, 2].map((i) => (
          <motion.span 
            key={i} 
            className="w-2 h-2 bg-primary rounded-full" 
            animate={{ y: [-3, 0, -3] }} 
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} 
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">
        {conversationType === 'friend'
          ? t('chat.window.friendTyping')
          : typingUsers.length === 1
            ? t('chat.window.someoneTyping')
            : t('chat.window.peopleTyping', { count: typingUsers.length })}
      </span>
    </motion.div>
  )
})

TypingIndicator.displayName = 'TypingIndicator'
