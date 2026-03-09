import { ApiError } from '../types/api';
import type { ErrorCategory } from '../types/api';
import { checkOnline, delay } from '../utils/network';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const REQUEST_TIMEOUT_MS = 30000;

export interface RequestConfig extends RequestInit {
  url: string;
  timeoutMs?: number;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ApiError('TIMEOUT', '请求超时，请检查网络后重试', 'network', true));
    }, timeoutMs);

    fetch(url, init)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 统一请求入口：带超时 + 重试的 fetch，网络/HTTP 错误转为 ApiError（含分类与可重试标记）
 */
export async function request(config: RequestConfig): Promise<Response> {
  const { url, timeoutMs = REQUEST_TIMEOUT_MS, ...init } = config;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (!checkOnline()) {
      throw new ApiError('OFFLINE', '网络连接已断开，请检查网络后重试', 'network', true);
    }

    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      return response;
    } catch (error) {
      lastError = error as Error;
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      if (error instanceof ApiError) {
        if (attempt >= MAX_RETRIES) throw error;
      }
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt);
      }
    }
  }

  if (!checkOnline()) {
    throw new ApiError('OFFLINE', '网络连接已断开，请检查网络后重试', 'network', true);
  }
  throw new ApiError(
    'NETWORK_ERROR',
    lastError?.message ?? '网络请求失败，请稍后重试',
    'network',
    true
  );
}

function classifyHttpStatus(status: number): { category: ErrorCategory; retryable: boolean; hint: string } {
  if (status === 401 || status === 403) {
    return { category: 'auth', retryable: false, hint: 'API Key 无效或已过期，请检查后重新输入' };
  }
  if (status === 429) {
    return { category: 'rate_limit', retryable: true, hint: '请求过于频繁，请稍后再试' };
  }
  if (status === 400) {
    return { category: 'param', retryable: false, hint: '请求参数有误，请检查模型配置' };
  }
  if (status === 404) {
    return { category: 'model', retryable: false, hint: '模型不可用或接口地址错误' };
  }
  if (status === 503 || status === 502) {
    return { category: 'model', retryable: true, hint: '模型服务暂时不可用，请稍后重试' };
  }
  if (status >= 500) {
    return { category: 'model', retryable: true, hint: '模型服务内部错误，请稍后重试' };
  }
  return { category: 'unknown', retryable: false, hint: `请求失败 (${status})` };
}

/**
 * 从 Response 解析统一错误体，按 HTTP 状态码分类
 */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  const { category, retryable, hint } = classifyHttpStatus(response.status);
  try {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    const message = body.error ? `${hint}：${body.error}` : hint;
    return new ApiError(`HTTP_${response.status}`, message, category, retryable);
  } catch {
    return new ApiError(`HTTP_${response.status}`, hint, category, retryable);
  }
}
