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
