/**
 * API 层类型：统一请求/响应与错误格式，便于无感切换模型或接口
 */

export interface ChatMessagePayload {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequestParams {
  apiKey: string;
  model: string;
  provider?: string;
  messages: ChatMessagePayload[];
  stream: boolean;
}

export interface UsagePayload {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatChunkPayload {
  content?: string;
  usage?: UsagePayload;
  error?: string;
}

/** 非流式响应：聚合 content + 可选 usage */
export interface ChatResponse {
  content: string;
  usage?: UsagePayload;
}

/** 错误分类：用于 UI 展示不同提示语 */
export type ErrorCategory = 'network' | 'auth' | 'rate_limit' | 'model' | 'param' | 'unknown';

/** 统一错误格式：code 用于按错误类型分支，category 用于 UI 分类提示，retryable 标记是否可重试 */
export class ApiError extends Error {
  code: string;
  message: string;
  category: ErrorCategory;
  retryable: boolean;

  constructor(code: string, message: string, category: ErrorCategory = 'unknown', retryable = false) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.message = message;
    this.category = category;
    this.retryable = retryable;
  }
}
