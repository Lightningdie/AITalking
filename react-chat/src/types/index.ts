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
 * 统一的消息数据结构
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: number;
}

/**
 * useChat 配置参数
 */
export interface UseChatConfig {
  apiKey: string;
  model: string;
  provider?: 'zhipu' | 'spark';
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
  sendMessageStream: (content: string) => Promise<void>;
  sendMessageNonStream: (content: string) => Promise<void>;
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
