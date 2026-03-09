/**
 * Mock Adapter：模拟延迟、异常、中断，用于联调与测试
 * 使用 modelId 选择行为：mock:delay | mock:error | mock:abort
 */
import type {
  ModelRequestParams,
  ModelCallbacks,
  RequestModelOptions,
  ModelAdapter
} from '../types/model';

const MOCK_DELAY_MS = 400;
const MOCK_PARTIAL = '这是一段模拟的流式内容…';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockAdapter: ModelAdapter = async (params, callbacks, options) => {
  const signal = options?.signal;
  const modelId = params.modelId.toLowerCase();
  const isAbort = modelId === 'mock:abort';
  const isError = modelId === 'mock:error';

  if (isError) {
    await delay(MOCK_DELAY_MS);
    callbacks.onError(new Error('模拟异常'));
    throw new Error('模拟异常');
  }

  if (isAbort) {
    await delay(MOCK_DELAY_MS / 2);
    if (signal?.aborted) {
      callbacks.onError(new DOMException('Aborted', 'AbortError'));
      throw new DOMException('Aborted', 'AbortError');
    }
    callbacks.onChunk(MOCK_PARTIAL);
    await delay(200);
    callbacks.onError(new DOMException('Aborted', 'AbortError'));
    throw new DOMException('Aborted', 'AbortError');
  }

  await delay(MOCK_DELAY_MS);
  if (signal?.aborted) {
    callbacks.onError(new DOMException('Aborted', 'AbortError'));
    throw new DOMException('Aborted', 'AbortError');
  }
  const content = `[Mock] 收到 ${params.messages.length} 条消息，stream=${params.stream ?? true}`;
  callbacks.onChunk(content);
  callbacks.onComplete({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
};
