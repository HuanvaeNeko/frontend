'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, 
  Paperclip, 
  Loader2, 
  Image as ImageIcon, 
  FileText, 
  Video, 
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { EmojiPicker } from './EmojiPicker'
import { MarkdownEditor, type MarkdownEditorRef } from './MarkdownEditor'
import { useI18n } from '@/i18n/I18nProvider'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  sending: boolean
  selectedFile: File | null
  uploadProgress: number | null
  editorHasContent: boolean
  fileInputRef: React.RefObject<HTMLInputElement>
  editorRef: React.RefObject<MarkdownEditorRef>
  onSendMessage: () => void
  onSendFile: () => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCancelFile: () => void
  onPaste: (e: React.ClipboardEvent) => void
  setEditorHasContent: (hasContent: boolean) => void
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

export const ChatInput = memo(({
  sending,
  selectedFile,
  uploadProgress,
  editorHasContent,
  fileInputRef,
  editorRef,
  onSendMessage,
  onSendFile,
  onFileSelect,
  onCancelFile,
  onPaste,
  setEditorHasContent
}: ChatInputProps) => {
  const { t } = useI18n()

  const handleEmojiSelect = (emoji: string) => {
    editorRef.current?.insertText(emoji)
  }

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-primary" />
    if (file.type.startsWith('video/')) return <Video className="h-5 w-5 text-primary" />
    return <FileText className="h-5 w-5 text-muted-foreground" />
  }

  return (
    <div 
      className="p-4 shrink-0 border-t border-border/40 bg-card/80 backdrop-blur-md pb-[max(1.5rem,env(safe-area-inset-bottom))]" 
      onPaste={onPaste}
    >
      <AnimatePresence>
        {selectedFile && (
          <motion.div 
            className="mb-4 p-3 rounded-2xl flex items-center gap-3 bg-muted/50 border border-border/50 shadow-sm" 
            initial={{ opacity: 0, y: 10, scale: 0.95 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {getFileIcon(selectedFile)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full" 
              onClick={onCancelFile} 
              disabled={sending}
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uploadProgress !== null && (
          <motion.div 
            className="mb-4 px-1" 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 font-medium">
              <span>{t('chat.window.uploading')}</span>
              <span>{uploadProgress.toFixed(0)}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1.5 rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-3 bg-muted/30 p-2 rounded-[24px] border border-border/40 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all shadow-sm">
        <input 
          ref={fileInputRef} 
          type="file" 
          className="hidden" 
          onChange={onFileSelect} 
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar" 
        />
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10" 
          onClick={() => fileInputRef.current?.click()} 
          disabled={sending}
          title={t('chat.window.attachFile')}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        
        <div className="flex-1 min-w-0 py-1.5">
          <MarkdownEditor 
            ref={editorRef} 
            placeholder={t('chat.window.inputPlaceholder')} 
            onSubmit={onSendMessage} 
            onChange={() => setEditorHasContent(!(editorRef.current?.isEmpty() ?? true))} 
            disabled={sending} 
            className="bg-transparent border-none focus:ring-0 px-0 min-h-[24px] max-h-[150px] text-sm sm:text-base" 
            minHeight="24px" 
            maxHeight="150px" 
          />
        </div>
        
        <div className="flex items-center gap-1 shrink-0 pb-0.5">
           <EmojiPicker onSelect={handleEmojiSelect} disabled={sending} />
           
           <Button 
            size="icon" 
            className={cn(
              "h-9 w-9 shrink-0 rounded-full transition-all duration-300 shadow-sm",
              (!editorHasContent && !selectedFile) 
                ? "bg-muted text-muted-foreground hover:bg-muted/80 opacity-50" 
                : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95"
            )}
            onClick={selectedFile ? onSendFile : onSendMessage} 
            disabled={(!editorHasContent && !selectedFile) || sending}
            title={t('chat.window.send')}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
})

ChatInput.displayName = 'ChatInput'
