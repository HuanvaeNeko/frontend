'use client'

import { useState, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Code,
  Code2,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Eye,
  EyeOff,
  Heading2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Markdown } from '@/components/ui/markdown'

export interface MarkdownEditorRef {
  focus: () => void
  clear: () => void
  getValue: () => string
  isEmpty: () => boolean
  insertText: (text: string) => void
}

interface MarkdownEditorProps {
  placeholder?: string
  onSubmit?: () => void
  onChange?: (content: string) => void
  disabled?: boolean
  className?: string
  minHeight?: string
  maxHeight?: string
}

const ToolbarButton = ({ 
  onClick, 
  isActive, 
  disabled,
  children,
  title,
}: { 
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title?: string
}) => (
  <motion.button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`p-1.5 rounded-md transition-colors ${
      isActive 
        ? 'bg-primary/10 text-primary' 
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    whileHover={{ scale: disabled ? 1 : 1.05 }}
    whileTap={{ scale: disabled ? 1 : 0.95 }}
  >
    {children}
  </motion.button>
)

export const MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(({
  placeholder = '输入消息... (支持 Markdown 语法)',
  onSubmit,
  onChange,
  disabled = false,
  className = '',
  minHeight = '42px',
  maxHeight = '150px',
}, ref) => {
  const [value, setValue] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    clear: () => {
      setValue('')
      onChange?.('')
    },
    getValue: () => value,
    isEmpty: () => !value.trim(),
    insertText: (text: string) => {
      const textarea = textareaRef.current
      if (!textarea) return
      
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = value.slice(0, start) + text + value.slice(end)
      setValue(newValue)
      onChange?.(newValue)
      
      // 设置光标位置
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length
        textarea.focus()
      }, 0)
    },
  }), [value, onChange])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    onChange?.(newValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
      return
    }

    // 快捷键支持
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': // Ctrl+B 粗体
          e.preventDefault()
          insertBold()
          break
        case 'i': // Ctrl+I 斜体
          e.preventDefault()
          insertItalic()
          break
        case 'k': // Ctrl+K 链接
          e.preventDefault()
          insertLink()
          break
        case '`': // Ctrl+` 代码
          e.preventDefault()
          insertCode()
          break
      }
    }
  }

  // 插入 Markdown 语法（智能包裹选中文本）
  const insertMarkdown = useCallback((before: string, after: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const hasSelection = start !== end
    const selectedText = value.slice(start, end)
    
    let newValue: string
    let newCursorStart: number
    let newCursorEnd: number

    if (hasSelection) {
      // 有选中文本：用语法包裹
      newValue = value.slice(0, start) + before + selectedText + after + value.slice(end)
      newCursorStart = start + before.length
      newCursorEnd = start + before.length + selectedText.length
    } else {
      // 无选中文本：插入语法和占位符，选中占位符
      newValue = value.slice(0, start) + before + placeholder + after + value.slice(end)
      newCursorStart = start + before.length
      newCursorEnd = start + before.length + placeholder.length
    }
    
    setValue(newValue)
    onChange?.(newValue)

    // 设置光标位置/选中范围
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorStart, newCursorEnd)
    }, 0)
  }, [value, onChange])

  // 插入行级语法（在行首插入）
  const insertLineMarkdown = useCallback((prefix: string, placeholder: string = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const hasSelection = start !== end
    
    // 找到当前行的开始位置
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const beforeLine = value.slice(0, lineStart)
    const afterCursor = value.slice(end)
    
    let newValue: string
    let newCursorStart: number
    let newCursorEnd: number

    if (hasSelection) {
      // 有选中：在每行前加前缀
      const selectedText = value.slice(start, end)
      const lines = selectedText.split('\n')
      const prefixedLines = lines.map(line => prefix + line).join('\n')
      newValue = value.slice(0, start) + prefixedLines + afterCursor
      newCursorStart = start
      newCursorEnd = start + prefixedLines.length
    } else {
      // 无选中：在当前行首插入
      const currentLine = value.slice(lineStart, start)
      newValue = beforeLine + prefix + currentLine + placeholder + afterCursor
      newCursorStart = lineStart + prefix.length + currentLine.length
      newCursorEnd = newCursorStart + placeholder.length
    }
    
    setValue(newValue)
    onChange?.(newValue)

    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newCursorStart, newCursorEnd)
    }, 0)
  }, [value, onChange])

  const insertBold = () => insertMarkdown('**', '**', '粗体文本')
  const insertItalic = () => insertMarkdown('*', '*', '斜体文本')
  const insertStrike = () => insertMarkdown('~~', '~~', '删除线文本')
  const insertCode = () => insertMarkdown('`', '`', 'code')
  const insertCodeBlock = () => insertMarkdown('\n```\n', '\n```\n', '代码块')
  const insertLink = () => {
    const url = window.prompt('输入链接 URL')
    if (url) {
      const textarea = textareaRef.current
      const start = textarea?.selectionStart || 0
      const end = textarea?.selectionEnd || 0
      const selectedText = value.slice(start, end) || '链接文字'
      insertMarkdown('[', `](${url})`, selectedText)
    }
  }
  const insertBulletList = () => insertLineMarkdown('- ', '列表项')
  const insertOrderedList = () => insertLineMarkdown('1. ', '列表项')
  const insertQuote = () => insertLineMarkdown('> ', '引用内容')
  const insertHeading = () => insertLineMarkdown('## ', '标题')

  return (
    <div className={`markdown-editor ${className}`}>
      {/* 工具栏 */}
      <div 
        className="flex items-center gap-0.5 border-b bg-muted/40 px-2 py-1.5"
      >
        <ToolbarButton onClick={insertBold} disabled={disabled} title="粗体 **text** (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertItalic} disabled={disabled} title="斜体 *text* (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertStrike} disabled={disabled} title="删除线 ~~text~~">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        
        <div className="mx-1 h-4 w-px bg-border" />
        
        <ToolbarButton onClick={insertCode} disabled={disabled} title="行内代码 `code`">
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertCodeBlock} disabled={disabled} title="代码块 ```code```">
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertHeading} disabled={disabled} title="标题 ## heading">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertBulletList} disabled={disabled} title="无序列表 - item">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertOrderedList} disabled={disabled} title="有序列表 1. item">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertQuote} disabled={disabled} title="引用 > quote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={insertLink} disabled={disabled} title="链接 [text](url) (Ctrl+K)">
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        
        <div className="flex-1" />
        
        <ToolbarButton 
          onClick={() => setShowPreview(!showPreview)} 
          isActive={showPreview}
          disabled={disabled}
          title={showPreview ? '编辑' : '预览'}
        >
          {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </ToolbarButton>
      </div>

      {/* 编辑区/预览区 */}
      <div 
        className="px-3 py-2 overflow-y-auto"
        style={{ minHeight, maxHeight }}
      >
        {showPreview ? (
          <div className="prose prose-sm max-w-none text-foreground">
            {value.trim() ? (
              <Markdown className="text-sm">{value}</Markdown>
            ) : (
              <span className="text-sm text-muted-foreground">无内容预览</span>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="h-full w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            style={{ minHeight: 'inherit' }}
          />
        )}
      </div>

      {/* 样式 */}
      <style>{`
        .markdown-editor {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          border-radius: 0.75rem;
          transition: all 0.2s;
        }
        
        .markdown-editor:focus-within {
          border-color: hsl(var(--ring));
          box-shadow: 0 0 0 3px hsl(var(--ring) / 0.15);
        }
      `}</style>
    </div>
  )
})

MarkdownEditor.displayName = 'MarkdownEditor'

export default MarkdownEditor
