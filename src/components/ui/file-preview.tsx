'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Loader2,
  FileText,
  File,
  ExternalLink
} from 'lucide-react'
import { Markdown } from './markdown'
import { useI18n } from '@/i18n/I18nProvider'

// pdf.js 只在预览 PDF 时才需要，见 file-preview-pdf.tsx 顶部注释
const PdfPreview = lazy(() => import('./file-preview-pdf'))

export interface PreviewFile {
  url: string
  name: string
  type: string // MIME type
  size?: number
}

interface FilePreviewProps {
  file: PreviewFile | null
  files?: PreviewFile[] // 多文件预览支持
  onClose: () => void
  onDownload?: (file: PreviewFile) => void
}

type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'markdown' | 'code' | 'unsupported'

// 根据 MIME 类型判断预览类型
function getPreviewType(mimeType: string, fileName: string): PreviewType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('text/markdown') || fileName.endsWith('.md')) return 'markdown'
  if (mimeType.startsWith('text/') || isCodeFile(fileName)) return 'code'
  return 'unsupported'
}

// 判断是否是代码文件
function isCodeFile(fileName: string): boolean {
  const codeExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.scss', '.less',
    '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
    '.sh', '.bash', '.zsh', '.yml', '.yaml', '.toml', '.xml', '.sql',
    '.vue', '.svelte', '.astro', '.php', '.swift', '.kt', '.scala'
  ]
  return codeExtensions.some(ext => fileName.toLowerCase().endsWith(ext))
}

// 获取代码语言
function getCodeLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', sh: 'bash', bash: 'bash',
    yml: 'yaml', yaml: 'yaml', json: 'json', html: 'html', css: 'css',
    scss: 'scss', less: 'less', xml: 'xml', sql: 'sql', md: 'markdown',
    vue: 'vue', svelte: 'svelte', php: 'php', swift: 'swift', kt: 'kotlin'
  }
  return langMap[ext] || 'plaintext'
}

// 格式化文件大小
function formatSize(bytes?: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function PdfLoading() {
  const { t } = useI18n()
  return (
    <div className="p-8 flex items-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin" />
      {t('filePreview.pdfLoading')}
    </div>
  )
}

export function FilePreview({ file, files = [], onClose, onDownload }: FilePreviewProps) {
  const { t } = useI18n()
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [textContent, setTextContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  // 只记哪一种失败，文案渲染时按当前语言取（原来把 err.message 原样显示：
  // HTTP 失败是写死的「加载失败」，断网则是浏览器自带的英文 "Failed to fetch"）
  const [error, setError] = useState<'load' | 'pdf' | null>(null)

  // 获取当前文件
  const allFiles = files.length > 0 ? files : (file ? [file] : [])
  const currentFile = allFiles[currentIndex] || file

  // 获取预览类型
  const previewType = currentFile ? getPreviewType(currentFile.type, currentFile.name) : 'unsupported'

  // 加载文本内容
  useEffect(() => {
    if (!currentFile) return
    
    const type = getPreviewType(currentFile.type, currentFile.name)
    if (type === 'text' || type === 'markdown' || type === 'code') {
      setLoading(true)
      setError(null)
      fetch(currentFile.url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.text()
        })
        .then(text => {
          setTextContent(text)
          setLoading(false)
        })
        .catch(() => {
          setError('load')
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [currentFile])

  const handlePrev = useCallback(() => {
    if (previewType === 'pdf' && currentPage > 1) {
      setCurrentPage(p => p - 1)
    } else if (allFiles.length > 1) {
      setCurrentIndex(i => (i - 1 + allFiles.length) % allFiles.length)
      setScale(1)
      setRotation(0)
      setCurrentPage(1)
    }
  }, [allFiles.length, currentPage, previewType])

  const handleNext = useCallback(() => {
    if (previewType === 'pdf' && currentPage < numPages) {
      setCurrentPage(p => p + 1)
    } else if (allFiles.length > 1) {
      setCurrentIndex(i => (i + 1) % allFiles.length)
      setScale(1)
      setRotation(0)
      setCurrentPage(1)
    }
  }, [allFiles.length, currentPage, numPages, previewType])

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, 3))
      if (e.key === '-') setScale(s => Math.max(s - 0.25, 0.5))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, handlePrev, handleNext])

  const handleDownload = () => {
    if (currentFile && onDownload) {
      onDownload(currentFile)
    } else if (currentFile) {
      window.open(currentFile.url, '_blank')
    }
  }

  if (!currentFile) return null

  // 使用 Portal 渲染到 body，避免被父元素的 transform 影响 fixed 定位
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col"
        onClick={onClose}
      >
        {/* 顶部工具栏 */}
        <motion.header
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between px-4 py-3 bg-black/50"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 text-white min-w-0">
            <FileText className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium truncate">{currentFile.name}</p>
              <p className="text-sm text-white/60">
                {formatSize(currentFile.size)}
                {allFiles.length > 1 && ` · ${currentIndex + 1} / ${allFiles.length}`}
                {previewType === 'pdf' && numPages > 0 && ` · ${t('filePreview.pageOf', { page: currentPage, total: numPages })}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 缩放控制（图片/PDF） */}
            {(previewType === 'image' || previewType === 'pdf') && (
              <>
                <button
                  className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
                  onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}
                  title={t('filePreview.zoomOut')}
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <span className="text-white/80 text-sm min-w-[4rem] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
                  onClick={() => setScale(s => Math.min(s + 0.25, 3))}
                  title={t('filePreview.zoomIn')}
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
              </>
            )}

            {/* 旋转控制（仅图片） */}
            {previewType === 'image' && (
              <button
                className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
                onClick={() => setRotation(r => (r + 90) % 360)}
                title={t('filePreview.rotate')}
              >
                <RotateCw className="w-5 h-5" />
              </button>
            )}

            {/* 原始大小 */}
            {(previewType === 'image' || previewType === 'pdf') && (
              <button
                className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
                onClick={() => { setScale(1); setRotation(0) }}
                title={t('filePreview.reset')}
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            )}

            {/* 在新标签页打开 */}
            <button
              className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
              onClick={() => window.open(currentFile.url, '_blank')}
              title={t('filePreview.openInNewTab')}
            >
              <ExternalLink className="w-5 h-5" />
            </button>

            {/* 下载 */}
            <button
              className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
              onClick={handleDownload}
              title={t('chat.window.download')}
            >
              <Download className="w-5 h-5" />
            </button>

            {/* 关闭 */}
            <button
              className="p-2 rounded-lg hover:bg-white/10 text-white transition-colors"
              onClick={onClose}
              title={t('filePreview.closeEsc')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </motion.header>

        {/* 主内容区域 */}
        <div
          className="flex-1 overflow-auto flex items-center justify-center p-4"
          onClick={e => e.stopPropagation()}
        >
          {loading && (
            <div className="flex flex-col items-center gap-4 text-white">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p>{t('chat.window.loading')}</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-4 text-white">
              <File className="w-16 h-16 text-white/50" />
              <p className="text-red-400">{error === 'pdf' ? t('filePreview.pdfLoadFailed') : t('filePreview.loadFailed')}</p>
              <button
                className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                onClick={handleDownload}
              >
                {t('filePreview.downloadFile')}
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* 图片预览 */}
              {previewType === 'image' && (
                <motion.img
                  key={currentFile.url}
                  src={currentFile.url}
                  alt={currentFile.name}
                  className="max-w-full max-h-full object-contain select-none"
                  style={{
                    transform: `scale(${scale}) rotate(${rotation}deg)`,
                    transition: 'transform 0.2s ease',
                  }}
                  onLoad={() => setLoading(false)}
                  draggable={false}
                />
              )}

              {/* 视频预览 */}
              {previewType === 'video' && (
                <video
                  key={currentFile.url}
                  src={currentFile.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-full"
                  onLoadedData={() => setLoading(false)}
                >
                  {t('filePreview.videoUnsupported')}
                </video>
              )}

              {/* 音频预览 */}
              {previewType === 'audio' && (
                <div className="flex flex-col items-center gap-6 text-white">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <FileText className="w-16 h-16" />
                  </div>
                  <p className="text-xl font-medium">{currentFile.name}</p>
                  <audio
                    key={currentFile.url}
                    src={currentFile.url}
                    controls
                    autoPlay
                    className="w-full max-w-md"
                    onLoadedData={() => setLoading(false)}
                  />
                </div>
              )}

              {/* PDF 预览 */}
              {previewType === 'pdf' && (
                <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
                  <Suspense fallback={<PdfLoading />}>
                    <PdfPreview
                      url={currentFile.url}
                      page={currentPage}
                      scale={scale}
                      loading={<PdfLoading />}
                      onLoadSuccess={(pages) => {
                        setNumPages(pages)
                        setLoading(false)
                      }}
                      onLoadError={() => setError('pdf')}
                    />
                  </Suspense>
                </div>
              )}

              {/* Markdown 预览 */}
              {previewType === 'markdown' && (
                <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-full overflow-auto shadow-2xl">
                  <Markdown>{textContent}</Markdown>
                </div>
              )}

              {/* 代码预览 */}
              {previewType === 'code' && (
                <div className="bg-slate-900 rounded-lg max-w-4xl w-full max-h-full overflow-auto shadow-2xl">
                  <div className="sticky top-0 px-4 py-2 bg-slate-800 border-b border-slate-700 text-slate-400 text-sm">
                    {currentFile.name} · {getCodeLanguage(currentFile.name)}
                  </div>
                  <pre className="p-4 text-sm text-slate-300 overflow-x-auto">
                    <code>{textContent}</code>
                  </pre>
                </div>
              )}

              {/* 不支持的类型 */}
              {previewType === 'unsupported' && (
                <div className="flex flex-col items-center gap-6 text-white">
                  <File className="w-24 h-24 text-white/50" />
                  <div className="text-center">
                    <p className="text-xl font-medium mb-2">{currentFile.name}</p>
                    <p className="text-white/60">{t('filePreview.unsupported')}</p>
                  </div>
                  <button
                    className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-2"
                    onClick={handleDownload}
                  >
                    <Download className="w-5 h-5" />
                    {t('filePreview.downloadFile')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* 左右导航按钮 */}
        {(allFiles.length > 1 || (previewType === 'pdf' && numPages > 1)) && (
          <>
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              onClick={e => { e.stopPropagation(); handlePrev() }}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
              onClick={e => { e.stopPropagation(); handleNext() }}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

export default FilePreview
