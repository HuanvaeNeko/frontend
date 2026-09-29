import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/features/auth/store/authStore'
import { useI18n } from '@/i18n/I18nProvider'

/**
 * 「退出登录」确认框：侧栏底部图标、手机「更多」菜单、设置页三处共用。
 * 侧栏图标紧挨着「设置」「切换明暗」，误点一下就得重新输密码，所以先确认。
 * 受控组件：手机端的入口在 Popover 里，Popover 一关里面的子树就卸载，确认框得挂在外面。
 */
export function LogoutConfirmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const logout = useAuthStore((s) => s.logout)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('shell.logoutConfirm.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('shell.logoutConfirm.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('shell.logoutConfirm.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { void logout() }}>{t('shell.logoutConfirm.confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
