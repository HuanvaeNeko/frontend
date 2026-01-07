'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Smile } from 'lucide-react'
import { motion } from 'framer-motion'

// 常用表情列表
const EMOJI_CATEGORIES = {
  '常用': ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😋', '😎', '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '😴', '🥱', '🤤', '😛', '😜', '🤪', '😝', '🤑'],
  '表情': ['😤', '😠', '😡', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊'],
  '手势': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝'],
  '爱心': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋', '🫶', '🥹', '🥺', '😢', '😭', '🥲', '😇', '🤗'],
  '物品': ['🎉', '🎊', '🎁', '🎈', '🔥', '⭐', '✨', '💫', '🌟', '💥', '💢', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '🎵', '🎶', '🔔', '🔕', '📢', '📣', '💡', '🔑', '🔒'],
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  disabled?: boolean
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('常用')

  const handleSelect = (emoji: string) => {
    onSelect(emoji)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <motion.button 
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 disabled:opacity-50"
          style={{
            background: 'rgba(255, 255, 255, 0.6)',
            border: '1px solid rgba(147, 197, 253, 0.3)',
          }}
          whileHover={{ background: 'rgba(147, 197, 253, 0.2)' }}
          whileTap={{ scale: 0.95 }}
          type="button"
        >
          <Smile className="h-5 w-5" />
        </motion.button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content
          className="z-50 w-[320px] max-h-[360px] rounded-2xl bg-white/95 backdrop-blur-xl border border-blue-200/30 shadow-lg shadow-blue-500/10 overflow-hidden"
          sideOffset={8}
          align="start"
        >
          {/* 分类标签 */}
          <div className="flex border-b border-blue-200/20 px-2 pt-2 gap-1 overflow-x-auto">
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  activeCategory === category
                    ? 'bg-blue-500/10 text-blue-600'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          
          {/* 表情网格 */}
          <div className="p-3 max-h-[280px] overflow-y-auto">
            <div className="grid grid-cols-8 gap-1">
              {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  className="w-8 h-8 flex items-center justify-center text-xl rounded-lg hover:bg-blue-100/50 transition-colors"
                  onClick={() => handleSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

