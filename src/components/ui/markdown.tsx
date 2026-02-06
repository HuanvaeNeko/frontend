'use client'

import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.css'

interface MarkdownProps {
  children: string
  className?: string
}

// 自定义组件映射
const components: Components = {
  // 链接在新标签页打开
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:text-blue-600 underline underline-offset-2"
      {...props}
    >
      {children}
    </a>
  ),
  // 代码块样式
  pre: ({ children, ...props }) => (
    <pre
      className="rounded-lg overflow-x-auto p-4 bg-slate-900 text-sm my-3"
      {...props}
    >
      {children}
    </pre>
  ),
  // 行内代码样式
  code: ({ className, children, ...props }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  // 表格样式
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-slate-300 dark:border-slate-600" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-slate-300 dark:border-slate-600 px-4 py-2 bg-slate-100 dark:bg-slate-800 font-semibold text-left" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-slate-300 dark:border-slate-600 px-4 py-2" {...props}>
      {children}
    </td>
  ),
  // 引用块样式
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 dark:bg-blue-950/30 italic text-slate-600 dark:text-slate-400"
      {...props}
    >
      {children}
    </blockquote>
  ),
  // 列表样式
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-inside my-2 space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-inside my-2 space-y-1" {...props}>
      {children}
    </ol>
  ),
  // 标题样式
  h1: ({ children, ...props }) => (
    <h1 className="text-2xl font-bold mt-6 mb-4 text-slate-800 dark:text-slate-200" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-xl font-bold mt-5 mb-3 text-slate-800 dark:text-slate-200" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-lg font-semibold mt-4 mb-2 text-slate-800 dark:text-slate-200" {...props}>
      {children}
    </h3>
  ),
  // 段落样式
  p: ({ children, ...props }) => (
    <p className="my-2 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  // 分割线
  hr: (props) => (
    <hr className="my-6 border-slate-300 dark:border-slate-600" {...props} />
  ),
  // 图片样式
  img: ({ src, alt, ...props }) => (
    <img
      src={src}
      alt={alt || ''}
      className="max-w-full h-auto rounded-lg my-4"
      loading="lazy"
      {...props}
    />
  ),
}

/**
 * Markdown 渲染组件
 * 
 * 支持:
 * - GitHub Flavored Markdown (GFM)
 * - KaTeX 数学公式 (行内: $...$, 块级: $$...$$)
 * - 代码高亮 (highlight.js)
 * - 表格、任务列表、删除线等
 */
function MarkdownRenderer({ children, className = '' }: MarkdownProps) {
  return (
    <div className={`markdown-body prose prose-slate dark:prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

// 使用 memo 优化性能，避免不必要的重渲染
export const Markdown = memo(MarkdownRenderer)
export default Markdown
