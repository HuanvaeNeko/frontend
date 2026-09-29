import { defineMessages } from './define'

/** 文件预览（components/ui/file-preview.tsx）与消息里的图片 / 视频 */
export const filePreview = defineMessages(
  {
    pdfLoading: '加载 PDF...',
    loadFailed: '加载失败',
    pdfLoadFailed: 'PDF 加载失败',
    pageOf: '第 {page} / {total} 页',
    zoomOut: '缩小',
    zoomIn: '放大',
    rotate: '旋转',
    reset: '重置',
    openInNewTab: '在新标签页打开',
    closeEsc: '关闭 (Esc)',
    downloadFile: '下载文件',
    videoUnsupported: '您的浏览器不支持视频播放',
    unsupported: '此文件类型暂不支持预览',
    imageLoadFailed: '图片加载失败',
    videoLoadFailed: '视频加载失败',
  },
  {
    pdfLoading: 'Loading PDF...',
    loadFailed: 'Failed to load',
    pdfLoadFailed: 'Failed to load PDF',
    pageOf: 'Page {page} of {total}',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    rotate: 'Rotate',
    reset: 'Reset',
    openInNewTab: 'Open in new tab',
    closeEsc: 'Close (Esc)',
    downloadFile: 'Download file',
    videoUnsupported: 'Your browser does not support video playback',
    unsupported: 'Preview is not available for this file type',
    imageLoadFailed: 'Failed to load image',
    videoLoadFailed: 'Failed to load video',
  },
)
