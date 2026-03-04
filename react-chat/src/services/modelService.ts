/**
 * 统一模型协议实现：唯一与 fetch/API 交互的入口，UI 与 useChat 只依赖 ModelRequestParams + ModelCallbacks
 */
import type { ModelRequestParams, ModelCallbacks, ModelUsage } from '../types/model';
import type { ChatRequestParams } from '../types/api';
import { sendStream, sendNonStream } from './chatService';

export interface RequestModelOptions {
  signal?: AbortSignal;
  apiKey?: string;
}

const MODEL_ID_SEP = ':';

function parseModelId(modelId: string): { provider: string; model: string } {
  const idx = modelId.indexOf(MODEL_ID_SEP);
  if (idx <= 0) {
    return { provider: 'zhipu', model: modelId || 'glm-4-flash' };
  }
  return {
    provider: modelId.slice(0, idx),
    model: modelId.slice(idx + 1)
  };
}

/**
 * 统一模型请求：仅此函数内部调用 chatService（进而调用 fetch），UI 不直接接触网络
 */
export async function requestModel(
  params: ModelRequestParams,
  callbacks: ModelCallbacks,
  options?: RequestModelOptions
): Promise<void> {
  const { modelId, messages, stream = true } = params;
  const apiKey = options?.apiKey ?? '';
  const signal = options?.signal;

  const { provider, model } = parseModelId(modelId);
  const chatParams: ChatRequestParams = {
    apiKey,
    model,
    provider,
    messages,
    stream
  };

  try {
    if (stream) {
      let lastUsage: ModelUsage | undefined;
      await sendStream(
        chatParams,
        {
          onChunk: callbacks.onChunk,
          onUsage: (usage) => {
            lastUsage = {
              prompt_tokens: usage.prompt_tokens,
              completion_tokens: usage.completion_tokens,
              total_tokens: usage.total_tokens
            };
          }
        },
        signal
      );
      callbacks.onComplete(lastUsage);
    } else {
      const result = await sendNonStream(chatParams, signal);
      if (result.content) callbacks.onChunk(result.content);
      callbacks.onComplete(result.usage);
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}
