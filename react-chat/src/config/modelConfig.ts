/**
 * 模型参数默认值：不同模型不同默认值，切换时同步更新 UI
 */
export interface ModelParamsConfig {
  temperature: number;
  maxTokens: number;
  streamSupported: boolean;
}

const DEFAULT_CONFIG: ModelParamsConfig = {
  temperature: 0.7,
  maxTokens: 2048,
  streamSupported: true
};

/** 按 modelId（provider:model）配置默认参数，未配置的用 DEFAULT_CONFIG */
const MODEL_CONFIGS: Record<string, Partial<ModelParamsConfig>> = {
  'zhipu:glm-4.5-flash': { temperature: 0.7, maxTokens: 4096, streamSupported: true },
  'zhipu:glm-4-flash': { temperature: 0.7, maxTokens: 4096, streamSupported: true },
  'zhipu:glm-4-plus': { temperature: 0.7, maxTokens: 2048, streamSupported: true },
  'zhipu:glm-4': { temperature: 0.7, maxTokens: 2048, streamSupported: true },
  'spark:lite': { temperature: 0.5, maxTokens: 2048, streamSupported: true },
  'spark:generalv3': { temperature: 0.5, maxTokens: 4096, streamSupported: true },
  'spark:pro-128k': { temperature: 0.5, maxTokens: 8192, streamSupported: true },
  'spark:max-32k': { temperature: 0.5, maxTokens: 4096, streamSupported: true },
  'spark:4.0Ultra': { temperature: 0.5, maxTokens: 4096, streamSupported: true },
  'mock:delay': { ...DEFAULT_CONFIG },
  'mock:error': { ...DEFAULT_CONFIG },
  'mock:abort': { ...DEFAULT_CONFIG }
};

export function getModelConfig(modelId: string): ModelParamsConfig {
  const key = modelId.toLowerCase();
  const overrides = MODEL_CONFIGS[key];
  if (overrides) {
    return { ...DEFAULT_CONFIG, ...overrides };
  }
  const [provider] = key.split(':');
  const providerDefaults = Object.entries(MODEL_CONFIGS).find(([k]) => k.startsWith(provider + ':'));
  const base = providerDefaults ? MODEL_CONFIGS[providerDefaults[0]] : undefined;
  return { ...DEFAULT_CONFIG, ...base };
}
