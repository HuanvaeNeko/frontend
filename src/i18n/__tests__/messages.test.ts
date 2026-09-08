import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES, messages } from '@/i18n/messages'

/**
 * 文案资源层的断言：盯的是 `messages.ts` 里**那句话本身**，不是组件里的 key。
 *
 * 为什么不能在 `GroupList.test.tsx` 里测：那个文件把 `t` mock 成
 * `(key) => key`（原因写在 mock 上方，是为了让 `useEffect` 依赖数组的 bug 保持
 * 可测），于是 `findByPlaceholderText('chat.groupList.enterGroupKeywordPlaceholder')`
 * 只证明「组件接的是这个 key」，对 key 背后的 zh/en 字符串一无所知——把三句
 * 文案整段改回「输入群ID」，那条用例照样绿。两件事各测各的：
 * **组件测 key 有没有接对，这里测 key 背后的话有没有说对。**
 *
 * 为什么这句话必须说对：发现搜索是**完全匹配**（大小写不敏感的 `ILIKE`，无通配）
 * 或 `group_id` 精确匹配（`发现搜索.md:164`），子串不再命中。文案若仍写「输入群ID」
 * 或暗示模糊联想，用户拿「技术」去找「技术交流群」永远返回空，屏幕上和「搜索坏了」
 * 完全一样——本轮迁移消灭的就是这类静默失败，只不过这一处的失败方是产品语义
 * 而不是解包层。
 *
 * 断言的是**语义**不是快照：只要求每句话同时说清「要完整/完全一致」和「群 ID 也行」
 * 两件事，换措辞不会红，把这两件事之一说没了才会红。
 */

/** 「必须完整 / 完全一致」这层意思在两种语言里的说法。 */
const EXACTNESS = {
  'zh-CN': /完整|完全|全称|逐字/,
  'en-US': /\b(full|complete|exact|exactly)\b/i,
} as const

/** 「群 ID 也是合法输入」这层意思在两种语言里的说法。 */
const GROUP_ID = {
  'zh-CN': /群\s*ID/i,
  'en-US': /group\s*id/i,
} as const

/**
 * 三句文案，覆盖用户在「加入群聊」里能看到这条规则的全部三个位置。
 * 空状态（含它作为 toast description 的那次使用）此前一句断言都没有。
 */
const COPY_UNDER_TEST = [
  { key: 'enterGroupKeywordPlaceholder', where: '输入框 placeholder' },
  { key: 'enterGroupKeyword', where: '关键词为空时的 toast 文案' },
  { key: 'noMatchedGroup', where: '搜不到时的空状态 / toast 文案' },
] as const

describe('i18n 资源：加入群聊的搜索文案必须说出「完整群名或群 ID」', () => {
  it.each(SUPPORTED_LOCALES)('%s 三处文案齐全且都是字符串', (locale) => {
    const groupList = messages[locale].chat.groupList
    for (const { key } of COPY_UNDER_TEST) {
      expect(typeof groupList[key]).toBe('string')
      expect(groupList[key].length).toBeGreaterThan(0)
    }
  })

  for (const locale of SUPPORTED_LOCALES) {
    for (const { key, where } of COPY_UNDER_TEST) {
      it(`${locale} 的 ${key}（${where}）说了「要完整」`, () => {
        expect(messages[locale].chat.groupList[key]).toMatch(EXACTNESS[locale])
      })

      it(`${locale} 的 ${key}（${where}）说了「群 ID 也行」`, () => {
        expect(messages[locale].chat.groupList[key]).toMatch(GROUP_ID[locale])
      })
    }
  }

  /**
   * 已在群里的人不该被请去申请一次注定 400 的加群（`群聊管理.md:1089`
   * 「已是该群成员」）。文案必须存在且两种语言都说的是"已经在群里"这件事，
   * 而不是被复用成某句通用的「加入成功」。
   */
  it.each(SUPPORTED_LOCALES)('%s 的 alreadyMember 说的是「你已经在这个群里」', (locale) => {
    const groupList = messages[locale].chat.groupList
    expect(typeof groupList.alreadyMember).toBe('string')
    expect(groupList.alreadyMember).toMatch(locale === 'zh-CN' ? /已(经)?在/ : /already/i)
    // 不能和「加入成功」是同一句：那两种状态在屏幕上必须能区分
    expect(groupList.alreadyMember).not.toBe(groupList.joinSuccess)
  })
})
