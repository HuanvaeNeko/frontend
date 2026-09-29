/**
 * 登录 / 注册表单的报错槽位：紧挨提交按钮、一直占着一行高度。
 *
 * 原来报错条插在卡片最上面，卡片一变高整页就重新垂直居中——标题上窜、输入框下沉，
 * 看起来像页面「跳了一下」。占住固定高度后报错出现不改变布局；role=alert 让读屏播报。
 */
export function FormErrorSlot({ message }: { message: string }) {
  return (
    <p role="alert" className="min-h-5 text-sm leading-5 text-destructive">
      {message}
    </p>
  )
}
