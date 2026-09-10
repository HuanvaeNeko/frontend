import { motion } from 'framer-motion'
import { useProfileStore } from '@/features/profile/store/profileStore'
import { useI18n } from '@/i18n/I18nProvider'

export function EmptyContent({ hint }: { hint: 'chat' | 'contacts' }) {
  const { t } = useI18n()
  const nickname = useProfileStore((s) => s.profile?.user_nickname)
  return (
    <motion.div className="flex h-full flex-1 items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0 } }}>
      <div className="text-center">
        <div className="mb-4 text-5xl">💬</div>
        <h3 className="mb-2 text-xl font-semibold text-foreground">{t('shell.empty.title')}</h3>
        <p className="text-muted-foreground">{t(`shell.empty.${hint}`)}</p>
        {nickname && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary-subtle)] px-3 py-1 text-[12px] text-[var(--primary-text)]">{nickname}</div>}
      </div>
    </motion.div>
  )
}
