/**
 * 统一模型协议：UI 只与此结构交互，不出现 fetch / axios / SDK
 */

/** 发给模型的消息项 */
export interface ModelMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 1.1 请求入参结构 */
export interface ModelRequestParams {
  modelId: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/** usage 可选字段，与 API 层一致 */
export interface ModelUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** 1.2 统一返回结构（回调） */
export interface ModelCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (usage?: ModelUsage) => void;
  onError: (error: Error) => void;
}
