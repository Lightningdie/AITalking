import { ApiError } from '../types/api';
import { checkOnline, delay } from '../utils/network';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export interface RequestConfig extends RequestInit {
  url: string;
}

/**
 * 统一请求入口：带重试的 fetch，网络/HTTP 错误转为 ApiError，便于上层无感切换接口
 */
export async function request(config: RequestConfig): Promise<Response> {
  const { url, ...init } = config;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (!checkOnline()) {
      throw new ApiError('OFFLINE', '网络连接已断开，请检查网络后重试');
    }

    try {
      const response = await fetch(url, init);
      return response;
    } catch (error) {
      lastError = error as Error;
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY * attempt);
      }
    }
  }

  if (!checkOnline()) {
    throw new ApiError('OFFLINE', '网络连接已断开，请检查网络后重试');
  }
  throw new ApiError(
    'NETWORK_ERROR',
    lastError?.message ?? '请求失败，请稍后重试'
  );
}

/**
 * 从 Response 解析统一错误体（后端返回 { error: string } 或类似）
 */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return new ApiError(
      `HTTP_${response.status}`,
      body.error ?? `请求失败 (${response.status})`
    );
  } catch {
    return new ApiError(`HTTP_${response.status}`, `请求失败 (${response.status})`);
  }
}
