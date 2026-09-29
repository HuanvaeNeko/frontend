/**
 * 密码长度规则，跟随后端：profile/个人资料管理.md:305-306——`old_password` ≥ 6，`new_password` 6-100，
 * 不限字符种类。注册接口文档没写规则（auth/用户登录注册鉴权部分.md 只有示例），与改密码用同一套；
 * APP 的注册（useRegisterForm.ts）和改密码（PasswordForm.tsx）同样只要求 ≥ 6。
 *
 * 放在 lib 而不是 profile api 里：注册页也要用，不该为一个常量把整个资料 API 模块拖进注册页的 chunk。
 */
export const PASSWORD_LIMITS = { oldMin: 6, newMin: 6, newMax: 100 } as const
