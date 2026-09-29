import { afterEach, describe, expect, it } from 'vitest'
import { setActiveLocale, translate } from '../translate'

/** 组件外（store、API 模块）的翻译：跟随 I18nProvider 当前生效的语言，不再在这些地方写死中文 */
afterEach(() => setActiveLocale('zh-CN'))

describe('translate', () => {
  it('默认中文；切到英文后跟着变', () => {
    expect(translate('chat.preview.card')).toBe('[卡片]')
    setActiveLocale('en-US')
    expect(translate('chat.preview.card')).toBe('[Card]')
  })

  it('参数替换；没有这个 key 时原样返回 key（与 useI18n 的 t 同一套规则）', () => {
    expect(translate('chat.card.confirm', { label: '重启' })).toBe('确认重启？')
    expect(translate('no.such.key')).toBe('no.such.key')
  })
})
