/**
 * 全局对话状态（UI 的 loading / 禁用全部由此派生）
 */
export type ChatStatus = 'idle' | 'requesting' | 'streaming' | 'error';

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

/**
 * 单条消息状态（验收：中断、报错能准确反映到某一条消息）
 */
export type MessageStatus = 'streaming' | 'done' | 'aborted' | 'error';

/**
 * 统一的消息数据结构（验收：不再用纯 string 存消息，UI 只依赖此结构）
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
  /** 上下文 token 上限，用于统计与超限预警，默认 128000 */
  contextTokenLimit?: number;
  tokenWarningThreshold?: number;
  includeSystemInContext?: boolean;
  /** 当前会话 ID，切换时 useChat 会据此重置消息状态 */
  sessionId?: string;
  /** 当前会话的初始消息（从本地存储加载），随 sessionId 一起传入 */
  initialMessages?: Message[];
}

/**
 * useChat 返回接口
 *
 * 验收（消息数组与流式 buffer 拆分）：
 * - messages：历史消息（稳定），流式中不写入，生成完成后才追加
 * - streamingMessage：当前生成中的一条消息（流式 buffer），生成结束置为 null
 */
export interface UseChatReturn {
  /** 历史消息，流式过程中不污染 */
  messages: Message[];
  /** 当前生成中的消息，仅用于展示；完成后会并入 messages 并置为 null */
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
  /** 当前上下文估算 token 数（每轮对话前计算） */
  contextTokens: number;
  tokenWarningReached: boolean;
  /** 当前会发给模型的上下文消息（只读，用于可视化） */
  contextMessages: Message[];
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
 * 会话：按会话 ID 存储，用于本地持久化与会话管理
 */
export interface SessionData {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/** 会话列表项（不含 messages） */
export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type { ChatRequestParams, ChatResponse, UsagePayload } from './api';
export { ApiError } from './api';
export type { ModelRequestParams, ModelCallbacks, ModelMessage, ModelUsage } from './model';
