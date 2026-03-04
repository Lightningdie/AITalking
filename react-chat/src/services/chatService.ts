import type { ChatRequestParams, ChatChunkPayload, UsagePayload } from '../types/api';
import { requestChatStream, requestChat } from '../api/chat';

export interface StreamCallbacks {
  onChunk: (content: string) => void;
  onUsage?: (usage: UsagePayload) => void;
}

/**
 * 流式发送：读 SSE、解析 data、按 chunk/usage 回调，不抛时表示正常结束
 * Abort 或读错时抛错，由调用方决定如何入列消息（aborted / error）
 */
export async function sendStream(
  params: ChatRequestParams,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const response = await requestChatStream(params, signal);
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无响应体');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let streamError: string | null = null;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value && value.length > 0) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line?.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as ChatChunkPayload;
            if (parsed.content) {
              fullContent += parsed.content;
              callbacks.onChunk(fullContent);
            }
            if (parsed.usage && callbacks.onUsage) {
              callbacks.onUsage(parsed.usage);
            }
            if (parsed.error) {
              streamError = parsed.error;
              throw new Error(parsed.error);
            }
          } catch (e) {
            if (e instanceof Error && !e.message.includes('JSON')) throw e;
          }
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

/**
 * 非流式发送：请求一次，返回聚合 content + usage
 */
export async function sendNonStream(
  params: ChatRequestParams,
  signal?: AbortSignal
): Promise<{ content: string; usage?: UsagePayload }> {
  return requestChat(params, signal);
}
