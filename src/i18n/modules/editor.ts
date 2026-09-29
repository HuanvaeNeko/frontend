import { defineMessages } from './define'

/** 消息编辑器工具栏（MarkdownEditor.tsx） */
export const editor = defineMessages(
  {
    placeholder: '输入消息... (支持 Markdown 语法)',
    // 工具栏按钮的悬浮提示；Markdown 语法本身与快捷键不翻译
    bold: '粗体 **text** (Ctrl+B)',
    italic: '斜体 *text* (Ctrl+I)',
    strike: '删除线 ~~text~~',
    inlineCode: '行内代码 `code`',
    codeBlock: '代码块 ```code```',
    heading: '标题 ## heading',
    bulletList: '无序列表 - item',
    orderedList: '有序列表 1. item',
    quote: '引用 > quote',
    link: '链接 [text](url) (Ctrl+K)',
    edit: '编辑',
    emptyPreview: '无内容预览',
    linkPrompt: '输入链接 URL',
    // 没选中文字时插进输入框、并被选中的示例文字
    sample: {
      bold: '粗体文本',
      italic: '斜体文本',
      strike: '删除线文本',
      codeBlock: '代码块',
      linkText: '链接文字',
      listItem: '列表项',
      quote: '引用内容',
      heading: '标题',
    },
  },
  {
    placeholder: 'Type a message... (Markdown supported)',
    bold: 'Bold **text** (Ctrl+B)',
    italic: 'Italic *text* (Ctrl+I)',
    strike: 'Strikethrough ~~text~~',
    inlineCode: 'Inline code `code`',
    codeBlock: 'Code block ```code```',
    heading: 'Heading ## heading',
    bulletList: 'Bulleted list - item',
    orderedList: 'Numbered list 1. item',
    quote: 'Quote > quote',
    link: 'Link [text](url) (Ctrl+K)',
    edit: 'Edit',
    emptyPreview: 'Nothing to preview',
    linkPrompt: 'Enter the link URL',
    sample: {
      bold: 'bold text',
      italic: 'italic text',
      strike: 'strikethrough text',
      codeBlock: 'code',
      linkText: 'link text',
      listItem: 'list item',
      quote: 'quote',
      heading: 'heading',
    },
  },
)
