import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, MessageRole, MessageStatus, ChatStatus } from '../types';

// ==================== 常量配置 ====================
const API_ENDPOINT = '/api/chat';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// ==================== 消息创建 ====================

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

interface CreateMessageParams {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  id?: string;
  createdAt?: number;
}

function createMessage({
  role,
  content,
  status = 'done',
  id,
  createdAt
}: CreateMessageParams): Message {
  return {
    id: id || generateMessageId(),
    role,
    content: content || '',
    status,
    createdAt: createdAt || Date.now()
  };
}

// ==================== 工具函数 ====================

function checkOnline(): boolean {
  return navigator.onLine;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (!checkOnline()) {
      throw new Error('网络连接已断开，请检查网络后重试');
    }

    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.warn(`请求失败 (尝试 ${attempt}/${maxRetries}):`, (error as Error).message);

      if ((error as Error).name === 'AbortError') {
        throw error;
      }

      if (attempt < maxRetries) {
        const waitTime = RETRY_DELAY * attempt;
        console.log(`${waitTime}ms 后重试...`);
        await delay(waitTime);
      }
    }
  }

  if (!checkOnline()) {
    throw new Error('网络连接已断开，请检查网络后重试');
  }
  throw new Error(lastError?.message || '请求失败，请稍后重试');
}

// ==================== 主 Hook ====================

export interface UseChatConfig {
  apiKey: string;
  model: string;
  provider?: 'zhipu' | 'spark';
  contextLength?: number;
}

const initialStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  turnCount: 0
};

export function useChat({
  apiKey,
  model,
  provider = 'zhipu',
  contextLength = 10
}: UseChatConfig) {
  /** 历史消息（稳定）：仅在有完整内容时追加，流式中不写入 */
  const [messages, setMessages] = useState<Message[]>([]);
  /** 当前流式 buffer：仅用于展示，生成完成后并入 messages 并置为 null */
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [stats, setStats] = useState(initialStats);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingStreamContentRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  /** 流式报错时写入该条消息用的内容（供外层 catch 使用） */
  const failedMessageContentRef = useRef<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getContextMessages = useCallback(() => {
    const maxMessages = contextLength * 2;
    return messages.slice(-maxMessages);
  }, [messages, contextLength]);

  const throttledUpdateStreamContent = useCallback((content: string) => {
    pendingStreamContentRef.current = content;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const text = pendingStreamContentRef.current;
      setStreamingMessage((prev) => (prev ? { ...prev, content: text } : null));
      rafIdRef.current = null;
    });
  }, []);

  const sendMessageStream = useCallback(
    async (content: string) => {
      if (!apiKey) {
        throw new Error('请先设置 API Key');
      }

      if (!checkOnline()) {
        throw new Error('网络连接已断开，请检查网络后重试');
      }

      setStatus('requesting');
      setLastErrorMessage(null);

      /* 验收 5 - 用户消息入列：提交后立即加入 messages，状态标记为 done */
      const userMessage = createMessage({ role: 'user', content, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [...getContextMessages(), { role: 'user' as const, content }];

      /* 验收 6 - Assistant 占位：提前插入一条 assistant，content 空、status streaming，UI 先出气泡再打字 */
      const assistantMessage = createMessage({
        role: 'assistant',
        content: '',
        status: 'streaming'
      });
      setStreamingMessage(assistantMessage);

      abortControllerRef.current = new AbortController();

      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      try {
        const response = await fetchWithRetry(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          body: JSON.stringify({
            apiKey,
            model,
            provider,
            messages: contextMessages,
            stream: true
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        setStatus('streaming');
        reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let streamError: string | null = null;

        try {
          while (true) {
            if (abortControllerRef.current?.signal.aborted) {
              console.log('请求已中断，停止读取');
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            if (!value || value.length === 0) {
              continue;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line || line.trim() === '') continue;

              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();

                if (!data || data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data) as {
                    content?: string;
                    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
                    error?: string;
                  };

                  /* 验收 7 - 流式绑定占位：buffer 持续 append，同步更新同一占位 message，不重复、不跳跃 */
                  if (parsed.content) {
                    fullContent += parsed.content;
                    throttledUpdateStreamContent(fullContent);
                  }

                  if (parsed.usage) {
                    setStats((prev) => ({
                      promptTokens: parsed.usage!.prompt_tokens || 0,
                      completionTokens: parsed.usage!.completion_tokens || 0,
                      totalTokens: prev.totalTokens + (parsed.usage!.total_tokens || 0),
                      turnCount: prev.turnCount + 1
                    }));
                  }

                  if (parsed.error) {
                    streamError = parsed.error;
                    throw new Error(parsed.error);
                  }
                } catch (e) {
                  if (e instanceof Error && !e.message.includes('JSON')) {
                    throw e;
                  }
                }
              }
            }
          }
        } catch (readError) {
          console.error('流式读取错误:', readError);

          if (
            (readError as Error).name === 'AbortError' ||
            abortControllerRef.current?.signal.aborted
          ) {
            console.log('用户中断请求');
            setStatus('idle');
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            setMessages((prev) => [
              ...prev,
              {
                ...assistantMessage,
                content: fullContent
                  ? fullContent + '\n\n⚠️ [已停止生成]'
                  : '⚠️ [已停止生成]',
                status: 'aborted'
              }
            ]);
            setStreamingMessage(null);
            return;
          }

          const isConnectionError =
            (readError as Error).message?.includes('network') ||
            (readError as Error).message?.includes('aborted') ||
            (readError as Error).name === 'TypeError';

          if (fullContent && !streamError) {
            setStatus('idle');
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            const contentWithWarning = fullContent + '\n\n⚠️ [连接中断，内容可能不完整]';
            setMessages((prev) => [
              ...prev,
              { ...assistantMessage, content: contentWithWarning, status: 'error' }
            ]);
            setStreamingMessage(null);
            return;
          }

          if (streamError) {
            failedMessageContentRef.current = fullContent
              ? fullContent + '\n\n' + streamError
              : streamError;
            throw new Error(streamError);
          }

          if (isConnectionError) {
            failedMessageContentRef.current = fullContent || '连接中断，请检查网络后重试';
            throw new Error('连接中断，请检查网络后重试');
          }

          failedMessageContentRef.current = fullContent || (readError as Error).message;
          throw readError;
        }

        /* 验收 7 - 流式结束：占位消息并入 history 一条，无重复 */
        if (fullContent) {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          setMessages((prev) => [
            ...prev,
            { ...assistantMessage, content: fullContent, status: 'done' }
          ]);
        }
        setStreamingMessage(null);
        setStatus('idle');
      } catch (err) {
        setStatus('error');
        const errMsg = (err as Error).message;
        setLastErrorMessage(errMsg);
        const contentForMessage = failedMessageContentRef.current ?? errMsg;
        setMessages((prev) => [
          ...prev,
          { ...assistantMessage, content: contentForMessage, status: 'error' }
        ]);
        setStreamingMessage(null);
        failedMessageContentRef.current = null;
        throw err;
      } finally {
        try {
          if (reader) {
            reader.cancel().catch(() => {});
            reader.releaseLock();
          }
        } catch {
          // ignore
        }

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        pendingStreamContentRef.current = '';
        abortControllerRef.current = null;
      }
    },
    [apiKey, model, provider, getContextMessages, throttledUpdateStreamContent]
  );

  const sendMessageNonStream = useCallback(
    async (content: string) => {
      if (!apiKey) {
        throw new Error('请先设置 API Key');
      }

      if (!checkOnline()) {
        throw new Error('网络连接已断开，请检查网络后重试');
      }

      setStatus('requesting');
      setLastErrorMessage(null);

      /* 验收 5 - 用户消息入列 */
      const userMessage = createMessage({ role: 'user', content, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [...getContextMessages(), { role: 'user' as const, content }];

      /* 验收 6 - Assistant 占位，先出气泡再等响应 */
      const assistantMessage = createMessage({
        role: 'assistant',
        content: '',
        status: 'streaming'
      });
      setStreamingMessage(assistantMessage);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetchWithRetry(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          body: JSON.stringify({
            apiKey,
            model,
            provider,
            messages: contextMessages,
            stream: false
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          const error = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        const text = await response.text();
        const lines = text.split('\n').filter((l) => l.startsWith('data: '));

        let fullContent = '';

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };

            if (parsed.content) {
              fullContent += parsed.content;
            }

            if (parsed.usage) {
              setStats((prev) => ({
                promptTokens: parsed.usage!.prompt_tokens || 0,
                completionTokens: parsed.usage!.completion_tokens || 0,
                totalTokens: prev.totalTokens + (parsed.usage!.total_tokens || 0),
                turnCount: prev.turnCount + 1
              }));
            }
          } catch {
            // ignore
          }
        }

        if (fullContent) {
          setMessages((prev) => [
            ...prev,
            { ...assistantMessage, content: fullContent, status: 'done' }
          ]);
        }
        setStreamingMessage(null);
        setStatus('idle');
      } catch (err) {
        /* 验收 4：报错反映到该条消息 - 将失败的 assistant 入列，status error */
        setMessages((prev) => [
          ...prev,
          {
            ...assistantMessage,
            content: (err as Error).message,
            status: 'error'
          }
        ]);
        setStreamingMessage(null);
        setStatus('error');
        setLastErrorMessage((err as Error).message);
        throw err;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [apiKey, model, provider, getContextMessages]
  );

  const exportToMarkdown = useCallback((): string | null => {
    if (messages.length === 0) {
      return null;
    }

    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN');

    let markdown = `# 对话记录\n\n`;
    markdown += `> 导出时间: ${dateStr}\n\n`;
    markdown += `---\n\n`;

    for (const msg of messages) {
      const role =
        msg.role === 'user' ? '👤 用户' : msg.role === 'assistant' ? '🤖 助手' : '⚠️ 错误';

      const time = msg.createdAt
        ? new Date(msg.createdAt).toLocaleTimeString('zh-CN')
        : '';

      markdown += `### ${role}${time ? ` (${time})` : ''}\n\n`;
      markdown += `${msg.content}\n\n`;
    }

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `对话记录_${now.toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return markdown;
  }, [messages]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setStreamingMessage(null);
    setStatus('idle');
    setLastErrorMessage(null);
    setStats(initialStats);
  }, []);

  const addError = useCallback((message: string) => {
    setStatus('error');
    setLastErrorMessage(message);
    const errorMessage = createMessage({
      role: 'error',
      content: message,
      status: 'error'
    });
    setMessages((prev) => [...prev, errorMessage]);
  }, []);

  return {
    messages,
    streamingMessage,
    status,
    lastErrorMessage,
    isOffline,
    stats,
    sendMessageStream,
    sendMessageNonStream,
    exportToMarkdown,
    cancel,
    clear,
    addError
  };
}

export default useChat;
