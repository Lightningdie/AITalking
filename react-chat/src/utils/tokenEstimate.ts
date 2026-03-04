/**
 * Token 估算：可选接入 gpt-tokenizer，未接入时使用启发式（中英混合约 2.5 字符/token）
 */

export interface MessageForToken {
  role: string;
  content: string;
}

const FALLBACK_CHARS_PER_TOKEN = 2.5;
const MESSAGE_OVERHEAD_TOKENS = 4;

function fallbackCountTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / FALLBACK_CHARS_PER_TOKEN);
}

let tokenizer: { countTokens: (text: string) => number } | null = null;

/**
 * 初始化 token 计算库（如 gpt-tokenizer），在 App 或 useChat 挂载时调用一次即可
 * 未安装库或加载失败时静默回退到启发式估算
 */
export function initTokenTokenizer(): void {
  if (tokenizer !== null) return;
  import('gpt-tokenizer')
    .then((mod) => {
      const fn = (mod as { countTokens?: (t: string) => number }).countTokens;
      if (typeof fn === 'function') tokenizer = { countTokens: fn };
    })
    .catch(() => {});
}

/**
 * 单段文本的 token 估算（已接入库则用库，否则启发式）
 */
export function estimateTokens(text: string): number {
  if (tokenizer && typeof tokenizer.countTokens === 'function') {
    try {
      return tokenizer.countTokens(text);
    } catch {
      return fallbackCountTokens(text);
    }
  }
  return fallbackCountTokens(text);
}

/**
 * 多条消息的上下文 token 估算（含每条 role/content 的格式开销）
 */
export function estimateMessagesTokens(messages: MessageForToken[]): number {
  let total = 0;
  for (const m of messages) {
    total += MESSAGE_OVERHEAD_TOKENS + estimateTokens(m.content);
  }
  return total;
}
