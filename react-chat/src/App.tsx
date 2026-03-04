import { useState, useCallback } from 'react';
import { ChatContainer, Sidebar } from './components';
import { useChat, useLocalStorage } from './hooks';
import type { ProviderKey } from './components/Sidebar';
import './styles/components.css';
import './styles/code-highlight.css';

function App() {
  const [provider, setProvider] = useLocalStorage<ProviderKey>('ai_provider', 'zhipu');
  const [apiKey, setApiKey] = useLocalStorage('ai_api_key', '');
  const [model, setModel] = useLocalStorage('ai_model', 'glm-4.5-flash');
  const [contextLength, setContextLength] = useLocalStorage('context_length', 10);
  const [includeSystemInContext, setIncludeSystemInContext] = useLocalStorage(
    'context_include_system',
    true
  );
  const [streamMode, setStreamMode] = useState(true);

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
    includeSystemInContext
  });

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

  return (
    <div className="app">
      <div className="bg-effects">
        <div className="bg-grid" />
        <div className="bg-glow bg-glow--blue" />
        <div className="bg-glow bg-glow--purple" />
      </div>

      <Sidebar
        provider={provider}
        onProviderChange={setProvider}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        model={model}
        onModelChange={setModel}
        contextLength={contextLength}
        onContextLengthChange={setContextLength}
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
      />

      <ChatContainer
        messages={messages}
        streamingMessage={streamingMessage}
        status={status}
        lastErrorMessage={lastErrorMessage}
        onSendMessage={handleSendMessage}
        onCancel={cancel}
        streamMode={streamMode}
        onStreamModeChange={setStreamMode}
        disabled={!apiKey}
      />
    </div>
  );
}

export default App;
