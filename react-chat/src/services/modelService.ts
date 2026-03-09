/**
 * 统一模型请求入口：仅做适配器分发，不包含具体请求逻辑
 * 新模型 = 新 adapter 文件 + adapters/index 注册，本文件 0 改动
 */
import type { ModelRequestParams, ModelCallbacks, RequestModelOptions } from '../types/model';
import { getAdapter } from '../adapters';

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

export type { RequestModelOptions } from '../types/model';

export async function requestModel(
  params: ModelRequestParams,
  callbacks: ModelCallbacks,
  options?: RequestModelOptions
): Promise<void> {
  const { modelId } = params;
  const { provider } = parseModelId(modelId);
  const adapter = getAdapter(provider);

  await adapter(params, callbacks, options);
}
