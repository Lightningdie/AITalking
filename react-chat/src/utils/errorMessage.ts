/**
 * 将 ApiError / 原生 Error 转为用户可读的「人话」提示，明确分类
 */
import { ApiError } from '../types/api';
import type { ErrorCategory } from '../types/api';

interface ErrorInfo {
  message: string;
  category: ErrorCategory;
  retryable: boolean;
}

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network: '🌐 网络异常',
  auth: '🔑 认证失败',
  rate_limit: '⏱️ 频率限制',
  model: '🤖 模型异常',
  param: '⚙️ 参数错误',
  unknown: '❌ 未知错误'
};

export function classifyError(err: Error): ErrorInfo {
  if (err instanceof ApiError) {
    const label = CATEGORY_LABELS[err.category] ?? CATEGORY_LABELS.unknown;
    return {
      message: `${label}：${err.message}`,
      category: err.category,
      retryable: err.retryable
    };
  }

  const msg = (err.message ?? '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('网络')) {
    return {
      message: `${CATEGORY_LABELS.network}：网络请求失败，请检查网络连接后重试`,
      category: 'network',
      retryable: true
    };
  }
  if (msg.includes('timeout') || msg.includes('超时')) {
    return {
      message: `${CATEGORY_LABELS.network}：请求超时，请稍后重试`,
      category: 'network',
      retryable: true
    };
  }
  if (msg.includes('api key') || msg.includes('apikey') || msg.includes('unauthorized') || msg.includes('401') || msg.includes('403')) {
    return {
      message: `${CATEGORY_LABELS.auth}：API Key 无效或已过期，请检查后重新输入`,
      category: 'auth',
      retryable: false
    };
  }
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('频率') || msg.includes('限流')) {
    return {
      message: `${CATEGORY_LABELS.rate_limit}：请求过于频繁，请稍后再试`,
      category: 'rate_limit',
      retryable: true
    };
  }
  if (msg.includes('model') || msg.includes('模型') || msg.includes('503') || msg.includes('502') || msg.includes('不可用')) {
    return {
      message: `${CATEGORY_LABELS.model}：模型服务异常，请稍后重试`,
      category: 'model',
      retryable: true
    };
  }
  if (msg.includes('param') || msg.includes('参数') || msg.includes('400')) {
    return {
      message: `${CATEGORY_LABELS.param}：请求参数有误，请检查模型配置`,
      category: 'param',
      retryable: false
    };
  }

  return {
    message: `${CATEGORY_LABELS.unknown}：${err.message || '请求失败，请稍后重试'}`,
    category: 'unknown',
    retryable: false
  };
}
