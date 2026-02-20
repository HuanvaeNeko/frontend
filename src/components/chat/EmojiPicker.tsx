'use client'

import { useState } from 'react'
import { Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useI18n } from '@/i18n/I18nProvider'

const EMOJI_CATEGORIES = {
  frequently: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😋', '😎', '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '😴', '🥱', '🤤', '😛', '😜', '🤪', '😝', '🤑'],
  faces: ['😤', '😠', '😡', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊'],
  gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝'],
  hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋', '🫶', '🥹', '🥺', '😢', '😭', '🥲', '😇', '🤗'],
  items: ['🎉', '🎊', '🎁', '🎈', '🔥', '⭐', '✨', '💫', '🌟', '💥', '💢', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '🎵', '🎶', '🔔', '🔕', '📢', '📣', '💡', '🔑', '🔒'],
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  disabled?: boolean
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('frequently')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-xl" aria-label={t('chat.window.emoji')}>
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-0" sideOffset={8} align="start">
        <div className="flex gap-1 overflow-x-auto border-b p-2">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <Button
              key={category}
              type="button"
              size="sm"
              variant={activeCategory === category ? 'secondary' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => setActiveCategory(category as keyof typeof EMOJI_CATEGORIES)}
            >
              {t(`chat.emoji.${category}`)}
            </Button>
          ))}
        </div>

        <ScrollArea className="max-h-[280px] p-3">
          <div className="grid grid-cols-8 gap-1">
            {EMOJI_CATEGORIES[activeCategory].map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md text-xl transition-colors hover:bg-accent"
                onClick={() => {
                  onSelect(emoji)
                  setOpen(false)
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
