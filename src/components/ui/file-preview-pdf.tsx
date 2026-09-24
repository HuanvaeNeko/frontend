import type { ReactNode } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// 配置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfPreviewProps {
  url: string
  page: number
  scale: number
  loading: ReactNode
  onLoadSuccess: (numPages: number) => void
  onLoadError: () => void
}

/**
 * PDF 渲染，从 `file-preview.tsx` 拆出来单独懒加载。
 *
 * react-pdf + pdf.js 约 400 KB，以前跟着 `FilePreview` 被 `ChatWindow` 静态引入，
 * 打开任何一个会话都要先下载、解析它——哪怕这辈子没预览过 PDF。现在只有真正
 * 预览 PDF 时才加载。
 */
export default function PdfPreview({ url, page, scale, loading, onLoadSuccess, onLoadError }: PdfPreviewProps) {
  return (
    <Document
      file={url}
      onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
      onLoadError={onLoadError}
      loading={loading}
    >
      <Page pageNumber={page} scale={scale} renderTextLayer renderAnnotationLayer />
    </Document>
  )
}
