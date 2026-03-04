import type { ChatRequestParams, ChatResponse } from '../types/api';
import { request, parseErrorResponse } from './client';

const CHAT_ENDPOINT = '/api/chat';

/**
 * 流式请求：返回 Response，调用方自行读取 body 并解析 SSE
 * 便于后续切换为其它流式接口（如 WebSocket）时只改本层
 */
export async function requestChatStream(
  params: ChatRequestParams,
  signal?: AbortSignal
): Promise<Response> {
  const response = await request({
    url: CHAT_ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({ ...params, stream: true }),
    signal
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  return response;
}

/**
 * 非流式请求：返回聚合的 content + 可选 usage，统一错误格式
 */
export async function requestChat(
  params: ChatRequestParams,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const response = await request({
    url: CHAT_ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify({ ...params, stream: false }),
    signal
  });

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  const text = await response.text();
  const lines = text.split('\n').filter((l) => l.startsWith('data: '));
  let content = '';
  let usage: ChatResponse['usage'];

  for (const line of lines) {
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data) as { content?: string; usage?: ChatResponse['usage'] };
      if (parsed.content) content += parsed.content;
      if (parsed.usage) usage = parsed.usage;
    } catch {
      // ignore invalid JSON lines
    }
  }

  return { content, usage };
}
