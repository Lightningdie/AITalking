/**
 * 全局对话状态（UI 的 loading / 禁用全部由此派生）
 */
export type ChatStatus = 'idle' | 'requesting' | 'streaming' | 'error';

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

/**
 * 消息状态类型
 */
export type MessageStatus = 'idle' | 'streaming' | 'done' | 'error';

/**
 * 工具调用状态类型（一条工具从发起到完成）
 */
export type ToolCallStatusType = 'running' | 'ok' | 'error';

/**
 * 工具调用信息（SSE toolCall / toolResult 事件驱动）
 */
export interface ToolCallInfo {
  /** 与上游 tool_call id 对应，用于配对 toolResult */
  id: string;
  /** 工具名，如 generate_document */
  name: string;
  status: ToolCallStatusType;
  /** 参数摘要（服务端下发，人类可读） */
  argsSummary?: string;
  /** 结果摘要（服务端下发，人类可读） */
  resultSummary?: string;
  /** 产物下载链接（如 generate_document 生成的文件） */
  resultUrl?: string;
}

/**
 * 统一的消息数据结构
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** 模型的思考过程（reasoning_content），可能为空 */
  reasoningContent?: string;
  /** 本轮工具调用过程（agent harness 下发），可能为空 */
  toolCalls?: ToolCallInfo[];
  /** 用户上传的图片（data URL 列表），仅用户消息使用 */
  images?: string[];
  status: MessageStatus;
  createdAt: number;
}

/**
 * useChat 配置参数
 */
export interface UseChatConfig {
  apiKey: string;
  model: string;
  provider?: 'zhipu';
  contextLength?: number;
}

/**
 * useChat 返回接口
 */
export interface UseChatReturn {
  messages: Message[];
  streamingMessage: Message | null;
  /** 全局对话状态，UI loading/禁用均由此派生 */
  status: ChatStatus;
  /** 最近一次错误信息（status === 'error' 时有效） */
  lastErrorMessage: string | null;
  isOffline: boolean;
  stats: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    turnCount: number;
  };
  sendMessageStream: (content: string, images?: string[]) => Promise<void>;
  sendMessageNonStream: (content: string, images?: string[]) => Promise<void>;
  exportToMarkdown: () => string | null;
  cancel: () => void;
  clear: () => void;
  addError: (message: string) => void;
}

/**
 * Token 统计
 */
export interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  turnCount: number;
}

/**
 * 历史对话元信息
 */
export interface ConversationMeta {
  id: string;
  title: string;
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}
