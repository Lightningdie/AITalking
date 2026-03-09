/**
 * OpenAI-like Adapter：对接现有 SSE 接口，拼接 messages，支持 stream / 非 stream，转换返回为统一协议
 * 新模型若走同一套 SSE 协议，可复用本 adapter 或复制后改请求构造
 */
import type {
  ModelRequestParams,
  ModelCallbacks,
  ModelUsage,
  RequestModelOptions,
  ModelAdapter
} from '../types/model';
import type { ChatRequestParams } from '../types/api';
import { sendStream, sendNonStream } from '../services/chatService';

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

function buildChatParams(params: ModelRequestParams, apiKey: string): ChatRequestParams {
  const { modelId, messages, stream = true } = params;
  const { provider, model } = parseModelId(modelId);
  return {
    apiKey,
    model,
    provider,
    messages,
    stream
  };
}

export const openaiLikeAdapter: ModelAdapter = async (params, callbacks, options) => {
  const apiKey = options?.apiKey ?? '';
  const signal = options?.signal;
  const chatParams = buildChatParams(params, apiKey);
  const stream = params.stream !== false;

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
};
