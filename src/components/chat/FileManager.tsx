import { useState } from 'react'
import { Upload, File, Image as ImageIcon, Video as VideoIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface FileManagerProps {
  subTab: 'main' | 'upload'
}

export default function FileManager({ subTab }: FileManagerProps) {
  const { toast } = useToast()
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      // TODO: 实现文件上传逻辑
      toast({
        title: '提示',
        description: '文件上传功能即将上线',
      })
    } catch (error) {
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '上传文件失败',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  // 我的文件
  if (subTab === 'main') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <File className="h-12 w-12 mb-4" />
            <p className="text-sm">暂无文件</p>
            <p className="text-xs mt-1">上传文件后将在这里显示</p>
          </div>
        </div>
      </div>
    )
  }

  // 上传文件
  if (subTab === 'upload') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">上传文件</h3>
            <p className="text-sm text-muted-foreground mb-4">
              点击或拖拽文件到此处上传
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              支持图片、视频、文档，最大 500MB
            </p>

            <input
              type="file"
              id="file-upload"
              className="hidden"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
              disabled={uploading}
            />
            
            <label htmlFor="file-upload">
              <Button asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      选择文件
                    </>
                  )}
                </span>
              </Button>
            </label>

            <div className="mt-8 space-y-2">
              <h4 className="text-sm font-medium">存储位置</h4>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm">个人文件</Button>
                <Button variant="outline" size="sm">发送给好友</Button>
                <Button variant="outline" size="sm">发送到群聊</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
