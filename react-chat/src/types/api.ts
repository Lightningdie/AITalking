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

/** 统一错误格式：code 可用于后续按错误类型分支，message 展示给用户 */
export class ApiError extends Error {
  code: string;
  message: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.message = message;
  }
}
