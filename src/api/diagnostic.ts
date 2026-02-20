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

export interface DiagnosticStatistics {
  error_logs_24h: number
  error_occurrences_24h: number
  open_reports: number
  investigating_reports: number
  total_reports_7d: number
}

export interface DiagnosticErrorLogItem {
  id: string
  error_type: string
  error_message: string
  source_module: string
  severity: string
  first_occurred: string
  last_occurred: string
  occurrence_count: number
  sample_user_id?: string
  sample_request_path?: string
}

export interface DiagnosticReportItem {
  id: string
  report_type: string
  severity: string
  status: 'open' | 'investigating' | 'resolved' | 'dismissed'
  error_code?: number
  error_message: string
  requester_id: string
  target_user_id?: string
  file_uuid?: string
  suspected_cause?: string
  detail_file_path?: string
  server_timestamp?: string
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

  /**
   * 管理员：获取诊断统计
   * GET /api/admin/diagnostic/statistics
   */
  getStatistics: async (): Promise<DiagnosticStatistics> => {
    const response = await apiClient.get('/api/admin/diagnostic/statistics')
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '获取诊断统计失败')
    }
    return response.json()
  },

  /**
   * 管理员：查询错误日志
   * GET /api/admin/diagnostic/error-logs
   */
  getErrorLogs: async (params?: {
    page?: number
    page_size?: number
    error_type?: string
    severity?: string
    source_module?: string
  }): Promise<{
    logs: DiagnosticErrorLogItem[]
    total: number
    page: number
    page_size: number
    total_pages: number
  }> => {
    const search = new URLSearchParams()
    if (params?.page !== undefined) search.set('page', String(params.page))
    if (params?.page_size !== undefined) search.set('page_size', String(params.page_size))
    if (params?.error_type) search.set('error_type', params.error_type)
    if (params?.severity) search.set('severity', params.severity)
    if (params?.source_module) search.set('source_module', params.source_module)

    const query = search.toString()
    const response = await apiClient.get(`/api/admin/diagnostic/error-logs${query ? `?${query}` : ''}`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '获取错误日志失败')
    }
    return response.json()
  },

  /**
   * 管理员：查询诊断报告
   * GET /api/admin/diagnostic/reports
   */
  getReports: async (params?: {
    page?: number
    page_size?: number
    report_type?: string
    status?: 'open' | 'investigating' | 'resolved' | 'dismissed'
    requester_id?: string
  }): Promise<{
    reports: DiagnosticReportItem[]
    total: number
    page: number
    page_size: number
    total_pages: number
  }> => {
    const search = new URLSearchParams()
    if (params?.page !== undefined) search.set('page', String(params.page))
    if (params?.page_size !== undefined) search.set('page_size', String(params.page_size))
    if (params?.report_type) search.set('report_type', params.report_type)
    if (params?.status) search.set('status', params.status)
    if (params?.requester_id) search.set('requester_id', params.requester_id)

    const query = search.toString()
    const response = await apiClient.get(`/api/admin/diagnostic/reports${query ? `?${query}` : ''}`)

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '获取诊断报告失败')
    }
    return response.json()
  },

  /**
   * 管理员：获取诊断报告详情
   * GET /api/admin/diagnostic/reports/{id}
   */
  getReportDetail: async (reportId: string): Promise<Record<string, unknown>> => {
    const response = await apiClient.get(`/api/admin/diagnostic/reports/${reportId}`)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '获取诊断报告详情失败')
    }
    return response.json()
  },

  /**
   * 管理员：更新诊断报告状态
   * PUT /api/admin/diagnostic/reports/{id}/status
   */
  updateReportStatus: async (
    reportId: string,
    payload: {
      status: 'open' | 'investigating' | 'resolved' | 'dismissed'
      admin_notes?: string
    }
  ): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.put(`/api/admin/diagnostic/reports/${reportId}/status`, payload)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '更新诊断报告状态失败')
    }
    return response.json()
  },

  /**
   * 管理员：获取诊断报告原始文件
   * GET /api/admin/diagnostic/reports/{id}/file
   */
  getReportRawFile: async (reportId: string): Promise<Record<string, unknown>> => {
    const response = await apiClient.get(`/api/admin/diagnostic/reports/${reportId}/file`)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || '获取诊断报告原始文件失败')
    }
    return response.json()
  },
}
