/**
 * Adapter 注册表：新模型 = 新 adapter 文件 + 本文件增加一行注册，原有 adapter 与 modelService 0 改动
 */
import type { ModelAdapter } from '../types/model';
import { openaiLikeAdapter } from './openaiLike';
import { mockAdapter } from './mock';

const registry: Record<string, ModelAdapter> = {
  zhipu: openaiLikeAdapter,
  spark: openaiLikeAdapter,
  mock: mockAdapter
};

export function getAdapter(provider: string): ModelAdapter {
  const adapter = registry[provider];
  if (!adapter) {
    return registry.zhipu;
  }
  return adapter;
}

export { openaiLikeAdapter } from './openaiLike';
export { mockAdapter } from './mock';
