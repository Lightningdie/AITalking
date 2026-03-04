import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Message, ChatStatus, UseChatConfig } from '../types';
import { ApiError } from '../types/api';
import { createMessage } from '../utils/message';
import { checkOnline } from '../utils/network';
import { estimateMessagesTokens, initTokenTokenizer } from '../utils/tokenEstimate';
import { requestModel } from '../services/modelService';

const STREAM_UPDATE_THROTTLE_MS = 80;

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
    () =>
      contextMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      })),
    [contextMessages]
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

  const sendMessageStream = useCallback(
    async (content: string) => {
      if (!apiKey) throw new Error('请先设置 API Key');
      if (!checkOnline()) throw new Error('网络连接已断开，请检查网络后重试');

      setStatus('requesting');
      setLastErrorMessage(null);

      const userMessage = createMessage({ role: 'user', content, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [...getContextMessages(), { role: 'user' as const, content }];
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

      try {
        await requestModel(
          {
            modelId,
            messages: contextMessages,
            stream: true
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
              setStatus('error');
              const errMsg = err instanceof ApiError ? err.message : err.message;
              setLastErrorMessage(errMsg);
              failedMessageContentRef.current = fullContent || errMsg;
              setMessages((prev) => [
                ...prev,
                {
                  ...assistantMessage,
                  content: failedMessageContentRef.current ?? errMsg,
                  status: 'error'
                }
              ]);
              setStreamingMessage(null);
              failedMessageContentRef.current = null;
            }
          },
          { signal, apiKey }
        );
      } catch {
        // onError 已处理，仅清理 ref
      } finally {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (throttleTimerRef.current !== null) {
          clearTimeout(throttleTimerRef.current);
          throttleTimerRef.current = null;
        }
        pendingStreamContentRef.current = '';
        abortControllerRef.current = null;
      }
    },
    [apiKey, model, provider, getContextMessages, throttledUpdateStreamContent]
  );

  const sendMessageNonStream = useCallback(
    async (content: string) => {
      if (!apiKey) throw new Error('请先设置 API Key');
      if (!checkOnline()) throw new Error('网络连接已断开，请检查网络后重试');

      setStatus('requesting');
      setLastErrorMessage(null);

      const userMessage = createMessage({ role: 'user', content, status: 'done' });
      setMessages((prev) => [...prev, userMessage]);

      const contextMessages = [...getContextMessages(), { role: 'user' as const, content }];
      const assistantMessage = createMessage({
        role: 'assistant',
        content: '',
        status: 'streaming'
      });
      setStreamingMessage(assistantMessage);

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      const modelId = `${provider}:${model}`;

      try {
        await requestModel(
          {
            modelId,
            messages: contextMessages,
            stream: false
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
              setMessages((prev) => [
                ...prev,
                {
                  ...assistantMessage,
                  content: err instanceof ApiError ? err.message : err.message,
                  status: 'error'
                }
              ]);
              setStreamingMessage(null);
              setStatus('error');
              setLastErrorMessage(err instanceof ApiError ? err.message : err.message);
            }
          },
          { signal, apiKey }
        );
      } catch {
        // onError 已处理
      } finally {
        pendingStreamContentRef.current = '';
        abortControllerRef.current = null;
      }
    },
    [apiKey, model, provider, getContextMessages]
  );

  const exportToMarkdown = useCallback((): string | null => {
    if (messages.length === 0) return null;
    const now = new Date();
    const dateStr = now.toLocaleString('zh-CN');
    let markdown = `# 对话记录\n\n> 导出时间: ${dateStr}\n\n---\n\n`;
    for (const msg of messages) {
      const role =
        msg.role === 'user' ? '👤 用户' : msg.role === 'assistant' ? '🤖 助手' : '⚠️ 错误';
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
  }, [messages]);

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
    contextTokens,
    tokenWarningReached,
    contextMessages
  };
}

export default useChat;
