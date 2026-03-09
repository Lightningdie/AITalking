import { useState, useCallback, useEffect } from 'react';
import { ChatContainer, Sidebar, SwitchModelConfirmModal } from './components';
import { useChat, useLocalStorage, useSessions } from './hooks';
import { PROVIDERS, type ProviderKey } from './components/Sidebar';
import { getModelConfig } from './config/modelConfig';
import './styles/components.css';
import './styles/code-highlight.css';

function migrateOldApiKey() {
  const old = localStorage.getItem('ai_api_key');
  if (!old) return;
  try {
    const value = JSON.parse(old) as string;
    if (value) {
      const prov = localStorage.getItem('ai_provider');
      const provKey = prov ? (JSON.parse(prov) as string) : 'zhipu';
      const targetKey = `${provKey}_api_key`;
      if (!localStorage.getItem(targetKey)) {
        localStorage.setItem(targetKey, old);
      }
    }
    localStorage.removeItem('ai_api_key');
  } catch { /* ignore */ }
}
migrateOldApiKey();

function App() {
  const [provider, setProvider] = useLocalStorage<ProviderKey>('ai_provider', 'zhipu');
  const [zhipuApiKey, setZhipuApiKey] = useLocalStorage('zhipu_api_key', '');
  const [sparkApiKey, setSparkApiKey] = useLocalStorage('spark_api_key', '');
  const [model, setModel] = useLocalStorage('ai_model', 'glm-4.5-flash');
  const [temperature, setTemperature] = useLocalStorage('ai_temperature', 0.7);
  const [maxTokens, setMaxTokens] = useLocalStorage('ai_max_tokens', 2048);
  const [contextLength, setContextLength] = useLocalStorage('context_length', 10);
  const [includeSystemInContext, setIncludeSystemInContext] = useLocalStorage(
    'context_include_system',
    true
  );
  const [streamMode, setStreamMode] = useLocalStorage('stream_mode', true);
  const [systemPrompt, setSystemPrompt] = useLocalStorage('system_prompt', '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{ provider: ProviderKey; model: string } | null>(null);

  const apiKeyMap: Record<ProviderKey, string> = { zhipu: zhipuApiKey, spark: sparkApiKey };
  const setApiKeyMap: Record<ProviderKey, (v: string) => void> = { zhipu: setZhipuApiKey, spark: setSparkApiKey };
  const apiKey = apiKeyMap[provider];
  const setApiKey = setApiKeyMap[provider];

  const {
    sessions,
    currentSessionId,
    currentSessionData,
    createSession,
    deleteSession,
    switchSession,
    saveCurrentSessionMessages
  } = useSessions();

  const {
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
  } = useChat({
    apiKey,
    model,
    provider,
    contextLength,
    contextTokenLimit: 128000,
    tokenWarningThreshold: 0.8,
    includeSystemInContext,
    temperature,
    maxTokens,
    systemPrompt,
    sessionId: currentSessionId,
    initialMessages: currentSessionData?.messages ?? []
  });

  const applySwitch = useCallback(
    (newProvider: ProviderKey, newModel: string) => {
      setProvider(newProvider);
      setModel(newModel);
      const modelId = `${newProvider}:${newModel}`;
      const config = getModelConfig(modelId);
      setTemperature(config.temperature);
      setMaxTokens(config.maxTokens);
      setStreamMode(config.streamSupported);
      setPendingSwitch(null);
    },
    [setProvider, setModel, setTemperature, setMaxTokens]
  );

  const requestModelSwitch = useCallback(
    (newProvider: ProviderKey, newModel: string) => {
      if (status === 'requesting' || status === 'streaming') return;
      if (messages.length > 0) {
        setPendingSwitch({ provider: newProvider, model: newModel });
        return;
      }
      applySwitch(newProvider, newModel);
    },
    [status, messages.length, applySwitch]
  );

  const handleProviderChange = useCallback(
    (newProvider: ProviderKey) => {
      const defaultModel = PROVIDERS[newProvider]?.models[0]?.value ?? '';
      requestModelSwitch(newProvider, defaultModel);
    },
    [requestModelSwitch]
  );

  const handleModelChange = useCallback(
    (newModel: string) => {
      requestModelSwitch(provider, newModel);
    },
    [provider, requestModelSwitch]
  );

  const handleSwitchKeep = useCallback(() => {
    if (pendingSwitch) {
      applySwitch(pendingSwitch.provider, pendingSwitch.model);
    }
  }, [pendingSwitch, applySwitch]);

  const handleSwitchClear = useCallback(() => {
    if (pendingSwitch) {
      applySwitch(pendingSwitch.provider, pendingSwitch.model);
      clear();
    }
  }, [pendingSwitch, applySwitch, clear]);

  const handleSwitchCancel = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  useEffect(() => {
    if (status !== 'requesting' && status !== 'streaming') {
      saveCurrentSessionMessages(messages);
    }
  }, [messages, status]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      try {
        if (streamMode) {
          await sendMessageStream(content);
        } else {
          await sendMessageNonStream(content);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          addError((error as Error).message || '请求失败');
        }
      }
    },
    [streamMode, sendMessageStream, sendMessageNonStream, addError]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      retryAndResend(messageId, streamMode);
    },
    [retryAndResend, streamMode]
  );

  const handleSendAndCloseSidebar = useCallback(
    async (content: string) => {
      setSidebarOpen(false);
      await handleSendMessage(content);
    },
    [handleSendMessage]
  );

  return (
    <div className="app">
      <div className="bg-effects">
        <div className="bg-grid" />
        <div className="bg-glow bg-glow--blue" />
        <div className="bg-glow bg-glow--purple" />
      </div>

      <SwitchModelConfirmModal
        visible={pendingSwitch != null}
        onKeep={handleSwitchKeep}
        onClear={handleSwitchClear}
        onCancel={handleSwitchCancel}
        targetModelLabel={
          pendingSwitch
            ? PROVIDERS[pendingSwitch.provider]?.name +
              ' · ' +
              (PROVIDERS[pendingSwitch.provider]?.models.find((m) => m.value === pendingSwitch.model)?.label ?? pendingSwitch.model)
            : undefined
        }
      />

      <button
        type="button"
        className="hamburger-btn"
        onClick={() => setSidebarOpen((v) => !v)}
        aria-label={sidebarOpen ? '关闭侧边栏' : '打开侧边栏'}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        className={sidebarOpen ? 'sidebar--open' : ''}
        provider={provider}
        onProviderChange={handleProviderChange}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        model={model}
        onModelChange={handleModelChange}
        contextLength={contextLength}
        onContextLengthChange={setContextLength}
        temperature={temperature}
        onTemperatureChange={setTemperature}
        maxTokens={maxTokens}
        onMaxTokensChange={setMaxTokens}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        stats={stats}
        onClear={clear}
        onExport={exportToMarkdown}
        hasMessages={messages.length > 0}
        isOffline={isOffline}
        status={status}
        contextTokens={contextTokens}
        tokenWarningReached={tokenWarningReached}
        contextTokenLimit={128000}
        tokenWarningThreshold={0.8}
        contextMessages={contextMessages}
        includeSystemInContext={includeSystemInContext}
        onIncludeSystemInContextChange={setIncludeSystemInContext}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onCreateSession={createSession}
        onSwitchSession={switchSession}
        onDeleteSession={deleteSession}
      />

      <ChatContainer
        messages={messages}
        streamingMessage={streamingMessage}
        status={status}
        lastErrorMessage={lastErrorMessage}
        onSendMessage={handleSendAndCloseSidebar}
        onCancel={cancel}
        onRetry={handleRetry}
        streamMode={streamMode}
        onStreamModeChange={setStreamMode}
        sendDisabled={!apiKey}
      />
    </div>
  );
}

export default App;
