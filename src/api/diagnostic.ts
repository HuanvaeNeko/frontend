/**
 * 诊断日志 API
 * 用于客户端错误上报
 */

import { apiClient } from './apiClient'

// ============================================
// 诊断报告类型
// ============================================

export interface FriendPermissionReportRequest {
  file_uuid: string
  operation?: 'preview' | 'download'
  error_message: string
  client_timestamp?: string
  other_user_id?: string
  context?: Record<string, unknown>
}

export interface DiagnosticReportResponse {
  success: boolean
  report_id: string
  message: string
}

// ============================================
// 诊断 API
// ============================================

export const diagnosticApi = {
  /**
   * 上报好友文件权限错误
   * 当用户遇到好友文件访问权限问题时，可以调用此接口上报
   */
  reportFriendPermissionError: async (
    request: FriendPermissionReportRequest
  ): Promise<DiagnosticReportResponse> => {
    console.log('📋 上报好友文件权限错误:', request.file_uuid)

    const payload: FriendPermissionReportRequest = {
      file_uuid: request.file_uuid,
      error_message: request.error_message,
    }

    if (request.operation) {
      payload.operation = request.operation
    }
    if (request.client_timestamp) {
      payload.client_timestamp = request.client_timestamp
    } else {
      // 自动添加客户端时间戳
      payload.client_timestamp = new Date().toISOString()
    }
    if (request.other_user_id) {
      payload.other_user_id = request.other_user_id
    }
    if (request.context) {
      payload.context = request.context
    }

    const response = await apiClient.post(
      '/api/diagnostic/report/friend-permission',
      payload
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '上报诊断信息失败')
    }

    const data: DiagnosticReportResponse = await response.json()
    console.log('✅ 诊断报告已创建:', data.report_id)
    return data
  },
}

