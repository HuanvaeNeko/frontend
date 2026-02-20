/**
 * 低代码平台 API
 * 根据后端文档（../backend/lowcode/低代码平台.md）整理。
 */

import { apiClient } from './apiClient'

type JsonObject = Record<string, unknown>

interface LowcodeEnvelope<T = JsonObject> {
  success?: boolean
  message?: string
  data?: T
  [key: string]: unknown
}

export interface LowcodeOperator extends JsonObject {
  id: string
  name?: string
  category?: string
  description?: string
}

export interface LowcodeWorkflow extends JsonObject {
  id: string
  name?: string
  description?: string
  definition?: JsonObject
  created_at?: string
  updated_at?: string
}

export interface LowcodeExecutionResult extends JsonObject {
  execution_id?: string
  status?: string
  output?: JsonObject
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return
    search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

async function parseEnvelope<T = JsonObject>(response: Response, fallbackError: string): Promise<T> {
  const result = (await response.json().catch(() => ({}))) as LowcodeEnvelope<T>
  if (!response.ok) {
    throw new Error((result.message as string) || fallbackError)
  }
  return (result.data as T) ?? (result as unknown as T)
}

export const lowcodeApi = {
  // 算子（公开）
  getOperators: async (): Promise<{ operators: LowcodeOperator[]; total?: number }> => {
    const res = await apiClient.get('/api/lowcode/operators')
    return parseEnvelope<{ operators: LowcodeOperator[]; total?: number }>(res, '获取算子列表失败')
  },

  getOperatorDetail: async (operatorId: string): Promise<LowcodeOperator> => {
    const res = await apiClient.get(`/api/lowcode/operators/${operatorId}`)
    return parseEnvelope<LowcodeOperator>(res, '获取算子详情失败')
  },

  // 流程（需认证）
  createWorkflow: async (payload: JsonObject): Promise<LowcodeWorkflow> => {
    const res = await apiClient.post('/api/lowcode/workflows', payload)
    return parseEnvelope<LowcodeWorkflow>(res, '创建流程失败')
  },

  getWorkflows: async (params?: { page?: number; page_size?: number; active_only?: boolean }): Promise<JsonObject> => {
    const res = await apiClient.get(`/api/lowcode/workflows${buildQuery(params)}`)
    return parseEnvelope<JsonObject>(res, '获取流程列表失败')
  },

  getWorkflowDetail: async (workflowId: string): Promise<LowcodeWorkflow> => {
    const res = await apiClient.get(`/api/lowcode/workflows/${workflowId}`)
    return parseEnvelope<LowcodeWorkflow>(res, '获取流程详情失败')
  },

  updateWorkflow: async (workflowId: string, payload: JsonObject): Promise<LowcodeWorkflow> => {
    const res = await apiClient.put(`/api/lowcode/workflows/${workflowId}`, payload)
    return parseEnvelope<LowcodeWorkflow>(res, '更新流程失败')
  },

  deleteWorkflow: async (workflowId: string): Promise<JsonObject> => {
    const res = await apiClient.delete(`/api/lowcode/workflows/${workflowId}`)
    return parseEnvelope<JsonObject>(res, '删除流程失败')
  },

  validateWorkflow: async (workflowId: string): Promise<JsonObject> => {
    const res = await apiClient.post(`/api/lowcode/workflows/${workflowId}/validate`)
    return parseEnvelope<JsonObject>(res, '验证流程失败')
  },

  exportWorkflow: async (workflowId: string): Promise<JsonObject> => {
    const res = await apiClient.get(`/api/lowcode/workflows/${workflowId}/export`)
    return parseEnvelope<JsonObject>(res, '导出流程失败')
  },

  validateWorkflowDefinition: async (payload: JsonObject): Promise<JsonObject> => {
    const res = await apiClient.post('/api/lowcode/workflows/validate', payload)
    return parseEnvelope<JsonObject>(res, '验证流程定义失败')
  },

  executeWorkflow: async (payload: JsonObject): Promise<LowcodeExecutionResult> => {
    const res = await apiClient.post('/api/lowcode/execute', payload)
    return parseEnvelope<LowcodeExecutionResult>(res, '执行流程失败')
  },

  getExecutionResult: async (executionId: string): Promise<LowcodeExecutionResult> => {
    const res = await apiClient.get(`/api/lowcode/executions/${executionId}`)
    return parseEnvelope<LowcodeExecutionResult>(res, '查询执行结果失败')
  },

  // 分类配置
  saveCategoryConfig: async (payload: JsonObject): Promise<JsonObject> => {
    const res = await apiClient.post('/api/lowcode/category_config', payload)
    return parseEnvelope<JsonObject>(res, '保存分类配置失败')
  },

  getCategoryConfig: async (): Promise<JsonObject> => {
    const res = await apiClient.get('/api/lowcode/category_config')
    return parseEnvelope<JsonObject>(res, '获取分类配置失败')
  },

  deleteCategoryConfig: async (): Promise<JsonObject> => {
    const res = await apiClient.delete('/api/lowcode/category_config')
    return parseEnvelope<JsonObject>(res, '删除分类配置失败')
  },

  validateCategoryConfig: async (payload: JsonObject): Promise<JsonObject> => {
    const res = await apiClient.post('/api/lowcode/category_config/validate', payload)
    return parseEnvelope<JsonObject>(res, '验证分类配置失败')
  },

  getCategoryOperators: async (): Promise<JsonObject> => {
    const res = await apiClient.get('/api/lowcode/category_config/operators')
    return parseEnvelope<JsonObject>(res, '获取可分类算子列表失败')
  },

  // 流程配置文件
  executeWorkflowConfig: async (payload: JsonObject): Promise<LowcodeExecutionResult> => {
    const res = await apiClient.post('/api/lowcode/workflow_config/execute', payload)
    return parseEnvelope<LowcodeExecutionResult>(res, '执行流程配置失败')
  },

  validateWorkflowConfig: async (payload: JsonObject): Promise<JsonObject> => {
    const res = await apiClient.post('/api/lowcode/workflow_config/validate', payload)
    return parseEnvelope<JsonObject>(res, '验证流程配置失败')
  },

  importWorkflowConfig: async (payload: JsonObject): Promise<JsonObject> => {
    const res = await apiClient.post('/api/lowcode/workflow_config/import', payload)
    return parseEnvelope<JsonObject>(res, '导入流程配置失败')
  },
}

