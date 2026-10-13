import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, MessageRole, MessageStatus, ChatStatus, ToolCallInfo } from '../types';

// ==================== 常量配置 ====================
// agent 端点 = /api/chat 的超集（同事件协议 + toolCall/toolResult），
// 模型未调用工具时行为与旧端点完全一致
const API_ENDPOINT = '/api/agent/chat';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// ==================== 消息创建 ====================

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

interface CreateMessageParams {
  role: MessageRole;
  content: string;
  /** 附带的图片（data URL 列表），仅用户消息使用 */
  images?: string[];
  status?: MessageStatus;
  id?: string;
  createdAt?: number;
}

function createMessage({
  role,
  content,
  images,
  status = 'done',
  id,
  createdAt
}: CreateMessageParams): Message {
  return {
    id: id || generateMessageId(),
    role,
    content: content || '',
    images: images && images.length > 0 ? images : undefined,
    status,
    createdAt: createdAt || Date.now()
  };
}

// ==================== 工具函数 ====================

/**
 * 把消息转成上游 API 内容格式：
 * 带图片时输出 OpenAI 多模态内容块（text + image_url），否则输出纯文本
 */
function buildApiContent(content: string, images?: string[]) {
  if (!images || images.length === 0) return content;
  return [
    { type: 'text' as const, text: content || '（图片）' },
    ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))
  ];
}

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
  provider?: 'zhipu';
  contextLength?: number;
  /** 思考深度：low / high / max / default（default=走模型默认档，不传该参数） */
  reasoningEffort?: string;
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
  contextLength = 10,
  reasoningEffort
}: UseChatConfig) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [stats, setStats] = useState(initialStats);

  const abortControllerRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);

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
    // 回传 role/content（带图消息转为多模态内容块），不传思考过程等本地字段
    return messages.slice(-maxMessages).map(({ role, content, images }) => ({
      role,
      content: buildApiContent(content, images)
    }));
  }, [messages, contextLength]);

  const pendingStreamContentRef = useRef('');
  const pendingStreamReasoningRef = useRef('');
  const pendingToolCallsRef = useRef<ToolCallInfo[]>([]);

  const throttledUpdateStream = useCallback(
    (content: string, reasoning: string, toolCalls?: ToolCallInfo[]) => {
      pendingStreamContentRef.current = content;
      pendingStreamReasoningRef.current = reasoning;
      if (toolCalls) pendingToolCallsRef.current = toolCalls;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        setStreamingMessage((prev) =>
          prev
            ? {
                ...prev,
                content: pendingStreamContentRef.current,
                reasoningContent: pendingStreamReasoningRef.current || undefined,
                toolCalls: pendingToolCallsRef.current.length
                  ? [...pendingToolCallsRef.current]
                  : undefined
              }
            : null
        );
        rafIdRef.current = null;
      });
    },
    []
  );

  const sendMessageStream = useCallback(
    async (content: string, images?: string[]) => {
      if (!apiKey) {
        throw new Error('请先设置 API Key');
      }

      if (!checkOnline()) {
        throw new Error('网络连接已断开，请检查网络后重试');
      }

      setStatus('requesting');
      setLastErrorMessage(null);

      const userMessage = createMessage({ role: 'user', content, images, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [
        ...getContextMessages(),
        { role: 'user' as const, content: buildApiContent(content, images) }
      ];

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
            stream: true,
            ...(reasoningEffort && reasoningEffort !== 'default'
              ? { reasoningEffort }
              : {})
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
        let fullReasoning = '';
        let streamError: string | null = null;
        let fullCalls: ToolCallInfo[] = [];

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
                    reasoning?: string;
                    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
                    error?: string;
                    toolCall?: { id?: string; name?: string; argsSummary?: string };
                    toolResult?: { id?: string; name?: string; ok?: boolean; summary?: string; url?: string };
                  };

                  if (parsed.content || parsed.reasoning) {
                    if (parsed.content) fullContent += parsed.content;
                    if (parsed.reasoning) fullReasoning += parsed.reasoning;
                    throttledUpdateStream(fullContent, fullReasoning, fullCalls);
                  }

                  if (parsed.toolCall) {
                    const call = parsed.toolCall;
                    fullCalls.push({
                      id: call.id || '',
                      name: call.name || '',
                      status: 'running',
                      argsSummary: call.argsSummary
                    });
                    throttledUpdateStream(fullContent, fullReasoning, fullCalls);
                  }

                  if (parsed.toolResult) {
                    const result = parsed.toolResult;
                    const matched = fullCalls.find((c) => c.id === result.id);
                    if (matched) {
                      matched.status = result.ok === false ? 'error' : 'ok';
                      matched.resultSummary = result.summary;
                      matched.resultUrl = result.url;
                      throttledUpdateStream(fullContent, fullReasoning, fullCalls);
                    }
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
            if (fullContent) {
              setMessages((prev) => [
                ...prev,
                {
                  ...assistantMessage,
                  content: fullContent,
                  reasoningContent: fullReasoning || undefined,
                  toolCalls: fullCalls.length ? fullCalls : undefined,
                  status: 'done'
                }
              ]);
            }
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
              {
                ...assistantMessage,
                content: contentWithWarning,
                reasoningContent: fullReasoning || undefined,
                toolCalls: fullCalls.length ? fullCalls : undefined,
                status: 'done'
              }
            ]);
            setStreamingMessage(null);
            return;
          }

          if (streamError) {
            throw new Error(streamError);
          }

          if (isConnectionError) {
            throw new Error('连接中断，请检查网络后重试');
          }

          throw readError;
        }

        if (fullContent || fullCalls.length > 0) {
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          setMessages((prev) => [
            ...prev,
            {
              ...assistantMessage,
              content: fullContent,
              reasoningContent: fullReasoning || undefined,
              toolCalls: fullCalls.length ? fullCalls : undefined,
              status: 'done'
            }
          ]);
        }
        setStreamingMessage(null);
        setStatus('idle');
      } catch (err) {
        setStatus('error');
        setLastErrorMessage((err as Error).message);
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
        pendingStreamReasoningRef.current = '';
        abortControllerRef.current = null;
      }
    },
    [apiKey, model, provider, reasoningEffort, getContextMessages, throttledUpdateStream]
  );

  const sendMessageNonStream = useCallback(
    async (content: string, images?: string[]) => {
      if (!apiKey) {
        throw new Error('请先设置 API Key');
      }

      if (!checkOnline()) {
        throw new Error('网络连接已断开，请检查网络后重试');
      }

      setStatus('requesting');
      setLastErrorMessage(null);

      const userMessage = createMessage({ role: 'user', content, images, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [
        ...getContextMessages(),
        { role: 'user' as const, content: buildApiContent(content, images) }
      ];

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
            stream: false,
            ...(reasoningEffort && reasoningEffort !== 'default'
              ? { reasoningEffort }
              : {})
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
        let fullReasoning = '';

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as {
              content?: string;
              reasoning?: string;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };

            if (parsed.content) {
              fullContent += parsed.content;
            }
            if (parsed.reasoning) {
              fullReasoning += parsed.reasoning;
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
            {
              ...assistantMessage,
              content: fullContent,
              reasoningContent: fullReasoning || undefined,
              status: 'done'
            }
          ]);
        }
        setStreamingMessage(null);
        setStatus('idle');
      } catch (err) {
        setStreamingMessage(null);
        setStatus('error');
        setLastErrorMessage((err as Error).message);
        throw err;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [apiKey, model, provider, reasoningEffort, getContextMessages]
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

  /** 加载历史对话（替换当前消息列表） */
  const loadMessages = useCallback((history: Message[]) => {
    setMessages(history);
    setStreamingMessage(null);
    setStatus('idle');
    setLastErrorMessage(null);
  }, []);

  /** 追加一条本地消息（如图片生成的占位），返回该消息对象 */
  const appendLocalMessage = useCallback(
    (content: string, role: MessageRole = 'assistant'): Message => {
      const msg: Message = {
        id: generateMessageId(),
        role,
        content,
        status: 'done',
        createdAt: Date.now()
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    []
  );

  /** 更新某条本地消息（如图片生成完成后替换占位内容） */
  const updateMessage = useCallback(
    (id: string, patch: Partial<Message>) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    },
    []
  );

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
    loadMessages,
    appendLocalMessage,
    updateMessage,
    addError
  };
}

export default useChat;
