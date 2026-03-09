import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Message, ChatStatus, UseChatConfig } from '../types';
import { createMessage } from '../utils/message';
import { checkOnline } from '../utils/network';
import { classifyError } from '../utils/errorMessage';
import { estimateMessagesTokens, initTokenTokenizer } from '../utils/tokenEstimate';
import { requestModel } from '../services/modelService';

const STREAM_UPDATE_THROTTLE_MS = 80;
/** 自动重试仅针对网络异常，最多重试次数（不含首次请求，即最多 1+2=3 次请求） */
const MAX_AUTO_RETRIES = 2;

type ApiMessage = { role: 'user' | 'assistant' | 'system'; content: string };

const initialStats = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  turnCount: 0
};

const DEFAULT_CONTEXT_TOKEN_LIMIT = 128000;
const DEFAULT_TOKEN_WARNING_THRESHOLD = 0.8;

export type { UseChatConfig };

export function useChat({
  apiKey,
  model,
  provider = 'zhipu',
  contextLength = 10,
  contextTokenLimit = DEFAULT_CONTEXT_TOKEN_LIMIT,
  tokenWarningThreshold = DEFAULT_TOKEN_WARNING_THRESHOLD,
  includeSystemInContext = true,
  temperature,
  maxTokens,
  systemPrompt,
  sessionId,
  initialMessages
}: UseChatConfig) {
  const [messages, setMessages] = useState<Message[]>(() => initialMessages ?? []);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [stats, setStats] = useState(initialStats);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingStreamContentRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  const lastFlushTimeRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedMessageContentRef = useRef<string | null>(null);
  const performStreamRequestRef = useRef<(apiMessages: ApiMessage[], retryCount: number) => void>(() => {});
  const performNonStreamRequestRef = useRef<(apiMessages: ApiMessage[], retryCount: number) => void>(() => {});

  useEffect(() => {
    initTokenTokenizer();
  }, []);

  const prevSessionIdRef = useRef<string | undefined>(sessionId);
  useEffect(() => {
    if (sessionId != null && prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      setMessages(initialMessages ?? []);
      setStreamingMessage(null);
      setStatus('idle');
      setLastErrorMessage(null);
    }
  }, [sessionId, initialMessages]);

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

  /** 当前会发给模型的上下文消息（最近 N 轮，可选排除 system），用于展示与请求 */
  const contextMessages = useMemo(() => {
    const maxMessages = contextLength * 2;
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
      .filter((m) => includeSystemInContext || m.role !== 'system')
      .slice(-maxMessages);
  }, [messages, contextLength, includeSystemInContext]);

  const getContextMessages = useCallback(
    () => {
      const mapped = contextMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      }));
      if (systemPrompt && systemPrompt.trim()) {
        return [{ role: 'system' as const, content: systemPrompt.trim() }, ...mapped];
      }
      return mapped;
    },
    [contextMessages, systemPrompt]
  );

  /**
   * 从给定消息列表构建 API 上下文（与 getContextMessages 逻辑一致），用于重试时不重复插入 user 消息
   */
  const buildContextFromMessages = useCallback(
    (msgList: Message[]): ApiMessage[] => {
      const maxMessages = contextLength * 2;
      const filtered = msgList
        .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
        .filter((m) => includeSystemInContext || m.role !== 'system')
        .slice(-maxMessages);
      const mapped = filtered.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      }));
      if (systemPrompt && systemPrompt.trim()) {
        return [{ role: 'system' as const, content: systemPrompt.trim() }, ...mapped];
      }
      return mapped;
    },
    [contextLength, includeSystemInContext, systemPrompt]
  );

  const contextTokens = useMemo(
    () => estimateMessagesTokens(getContextMessages()),
    [getContextMessages]
  );

  const tokenWarningReached = useMemo(() => {
    return contextTokenLimit > 0 && contextTokens >= contextTokenLimit * tokenWarningThreshold;
  }, [contextTokens, contextTokenLimit, tokenWarningThreshold]);

  const flushStreamContent = useCallback(() => {
    const text = pendingStreamContentRef.current;
    setStreamingMessage((prev) => (prev ? { ...prev, content: text } : null));
    lastFlushTimeRef.current = Date.now();
    rafIdRef.current = null;
    throttleTimerRef.current = null;
  }, []);

  const throttledUpdateStreamContent = useCallback(
    (content: string) => {
      pendingStreamContentRef.current = content;
      const now = Date.now();
      const elapsed = now - lastFlushTimeRef.current;

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (throttleTimerRef.current !== null) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }

      if (lastFlushTimeRef.current === 0 || elapsed >= STREAM_UPDATE_THROTTLE_MS) {
        rafIdRef.current = requestAnimationFrame(flushStreamContent);
        return;
      }
      const delay = STREAM_UPDATE_THROTTLE_MS - elapsed;
      throttleTimerRef.current = setTimeout(() => {
        rafIdRef.current = requestAnimationFrame(flushStreamContent);
      }, delay);
    },
    [flushStreamContent]
  );

  /**
   * 内部流式请求：使用给定 apiMessages 发起请求，支持自动重试（仅网络异常，最多 MAX_AUTO_RETRIES 次）
   */
  const performStreamRequest = useCallback(
    (apiMessages: ApiMessage[], retryCount: number) => {
      setStatus('requesting');
      setLastErrorMessage(null);

      const assistantMessage = createMessage({
        role: 'assistant',
        content: '',
        status: 'streaming'
      });
      setStreamingMessage(assistantMessage);
      lastFlushTimeRef.current = 0;

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      const modelId = `${provider}:${model}`;

      requestModel(
        {
          modelId,
          messages: apiMessages,
          stream: true,
          temperature,
          maxTokens
        },
        {
          onChunk: throttledUpdateStreamContent,
          onComplete: (usage) => {
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            const fullContent = pendingStreamContentRef.current;
            if (fullContent) {
              setMessages((prev) => [
                ...prev,
                { ...assistantMessage, content: fullContent, status: 'done' }
              ]);
            }
            setStreamingMessage(null);
            setStatus('idle');
            pendingStreamContentRef.current = '';
            abortControllerRef.current = null;
            if (usage) {
              setStats((prev) => ({
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: prev.totalTokens + (usage.total_tokens ?? 0),
                turnCount: prev.turnCount + 1
              }));
            }
          },
          onError: (err) => {
            const isAbort = err.name === 'AbortError' || signal.aborted;
            const fullContent = pendingStreamContentRef.current;
            if (rafIdRef.current !== null) {
              cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
            }
            if (throttleTimerRef.current !== null) {
              clearTimeout(throttleTimerRef.current);
              throttleTimerRef.current = null;
            }
            if (isAbort) {
              setStatus('idle');
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
            const info = classifyError(err);
            if (info.category === 'network' && retryCount < MAX_AUTO_RETRIES) {
              setStreamingMessage(null);
              pendingStreamContentRef.current = '';
              abortControllerRef.current = null;
              performStreamRequestRef.current(apiMessages, retryCount + 1);
              return;
            }
            setStatus('error');
            setLastErrorMessage(info.message);
            failedMessageContentRef.current = fullContent || info.message;
            setMessages((prev) => [
              ...prev,
              {
                ...assistantMessage,
                content: failedMessageContentRef.current ?? info.message,
                status: 'error',
                retryable: info.retryable,
                errorCategory: info.category
              }
            ]);
            setStreamingMessage(null);
            failedMessageContentRef.current = null;
            pendingStreamContentRef.current = '';
            abortControllerRef.current = null;
          }
        },
        { signal, apiKey }
      );
    },
    [
      apiKey,
      model,
      provider,
      temperature,
      maxTokens,
      throttledUpdateStreamContent
    ]
  );
  performStreamRequestRef.current = performStreamRequest;

  const sendMessageStream = useCallback(
    async (content: string) => {
      if (!apiKey) throw new Error('请先设置 API Key');
      if (!checkOnline()) throw new Error('网络连接已断开，请检查网络后重试');

      const userMessage = createMessage({ role: 'user', content, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [...getContextMessages(), { role: 'user' as const, content }];
      performStreamRequest(contextMessages, 0);
    },
    [apiKey, getContextMessages, performStreamRequest]
  );

  /**
   * 内部非流式请求：使用给定 apiMessages 发起请求，支持自动重试（仅网络异常，最多 MAX_AUTO_RETRIES 次）
   */
  const performNonStreamRequest = useCallback(
    (apiMessages: ApiMessage[], retryCount: number) => {
      setStatus('requesting');
      setLastErrorMessage(null);

      const assistantMessage = createMessage({
        role: 'assistant',
        content: '',
        status: 'streaming'
      });
      setStreamingMessage(assistantMessage);

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      const modelId = `${provider}:${model}`;

      requestModel(
        {
          modelId,
          messages: apiMessages,
          stream: false,
          temperature,
          maxTokens
        },
        {
          onChunk: (chunk) => {
            pendingStreamContentRef.current = chunk;
            setStreamingMessage((prev) => (prev ? { ...prev, content: chunk } : null));
          },
          onComplete: (usage) => {
            const content = pendingStreamContentRef.current;
            if (content) {
              setMessages((prev) => [
                ...prev,
                { ...assistantMessage, content, status: 'done' }
              ]);
            }
            setStreamingMessage(null);
            setStatus('idle');
            pendingStreamContentRef.current = '';
            abortControllerRef.current = null;
            if (usage) {
              setStats((prev) => ({
                promptTokens: usage.prompt_tokens ?? 0,
                completionTokens: usage.completion_tokens ?? 0,
                totalTokens: prev.totalTokens + (usage.total_tokens ?? 0),
                turnCount: prev.turnCount + 1
              }));
            }
          },
          onError: (err) => {
            const info = classifyError(err);
            if (info.category === 'network' && retryCount < MAX_AUTO_RETRIES) {
              setStreamingMessage(null);
              pendingStreamContentRef.current = '';
              abortControllerRef.current = null;
              performNonStreamRequestRef.current(apiMessages, retryCount + 1);
              return;
            }
            setMessages((prev) => [
              ...prev,
              {
                ...assistantMessage,
                content: info.message,
                status: 'error',
                retryable: info.retryable,
                errorCategory: info.category
              }
            ]);
            setStreamingMessage(null);
            setStatus('error');
            setLastErrorMessage(info.message);
            pendingStreamContentRef.current = '';
            abortControllerRef.current = null;
          }
        },
        { signal, apiKey }
      );
    },
    [apiKey, model, provider, temperature, maxTokens]
  );
  performNonStreamRequestRef.current = performNonStreamRequest;

  const sendMessageNonStream = useCallback(
    async (content: string) => {
      if (!apiKey) throw new Error('请先设置 API Key');
      if (!checkOnline()) throw new Error('网络连接已断开，请检查网络后重试');

      const userMessage = createMessage({ role: 'user', content, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [...getContextMessages(), { role: 'user' as const, content }];
      performNonStreamRequest(contextMessages, 0);
    },
    [apiKey, getContextMessages, performNonStreamRequest]
  );

  const exportToMarkdown = useCallback((): string | null => {
    if (messages.length === 0) return null;
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN');
    const providerLabel = provider === 'zhipu' ? '智谱 AI' : provider === 'spark' ? '讯飞星火' : provider;
    let markdown = `# 对话记录\n\n> 导出时间: ${dateStr}\n> API 提供商: ${providerLabel}\n> 模型: ${model}\n\n---\n\n`;
    for (const msg of messages) {
      const roleMap: Record<string, string> = {
        user: '👤 用户',
        assistant: '🤖 助手',
        system: '⚙️ 系统',
        error: '⚠️ 错误'
      };
      const role = roleMap[msg.role] ?? msg.role;
      const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('zh-CN') : '';
      markdown += `### ${role}${time ? ` (${time})` : ''}\n\n${msg.content}\n\n`;
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
  }, [messages, provider, model]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
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
    setMessages((prev) => [
      ...prev,
      createMessage({ role: 'error', content: message, status: 'error' })
    ]);
  }, []);

  /**
   * 单条消息重试：移除失败消息后使用原 messages 上下文重新请求，不重复插入 user 消息
   */
  const retryAndResend = useCallback(
    (messageId: string, streamMode: boolean) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      const failedMsg = messages[idx];
      if (failedMsg.status !== 'error') return;
      const newMessages = messages.filter((m) => m.id !== messageId);
      const apiContext = buildContextFromMessages(newMessages);
      if (apiContext.length === 0) return;
      setMessages(newMessages);
      setStatus('idle');
      setLastErrorMessage(null);
      if (streamMode) {
        performStreamRequest(apiContext, 0);
      } else {
        performNonStreamRequest(apiContext, 0);
      }
    },
    [
      messages,
      buildContextFromMessages,
      performStreamRequest,
      performNonStreamRequest
    ]
  );

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
    addError,
    retryAndResend,
    contextTokens,
    tokenWarningReached,
    contextMessages
  };
}

export default useChat;
