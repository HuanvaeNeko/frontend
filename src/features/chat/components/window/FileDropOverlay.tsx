'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload } from 'lucide-react'
import { useI18n } from '@/i18n/I18nProvider'

interface FileDropOverlayProps {
  isDragging: boolean
}

export const FileDropOverlay = memo(({ isDragging }: FileDropOverlayProps) => {
  const { t } = useI18n()

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10"
        >
          <div className="text-center">
            <Upload className="h-12 w-12 text-primary mx-auto mb-3" />
            <p className="text-lg font-medium text-primary">{t('chat.window.dragUploadTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('chat.window.dragUploadDesc')}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
})

FileDropOverlay.displayName = 'FileDropOverlay'
