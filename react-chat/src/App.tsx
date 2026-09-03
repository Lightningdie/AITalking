import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatContainer, Sidebar } from './components';
import { useChat, useLocalStorage } from './hooks';
import {
  listConversations,
  fetchConversation,
  saveConversation,
  deleteConversation
} from './services/historyApi';
import type { ProviderKey } from './components/Sidebar';
import type { ConversationMeta } from './types';
import './styles/components.css';
import './styles/code-highlight.css';

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function App() {
  const [provider, setProvider] = useLocalStorage<ProviderKey>('ai_provider', 'zhipu');
  const [apiKey, setApiKey] = useLocalStorage('ai_api_key', 'sk-SCrplrnxAiCi7jf5bKYt2sjXBjCSIYIL32qFqIOKWxt3hF3G');
  const [model, setModel] = useLocalStorage('ai_model', 'glm-5.3-flash');
  const [contextLength, setContextLength] = useLocalStorage('context_length', 10);
  const [streamMode, setStreamMode] = useState(true);
  const [showThinking, setShowThinking] = useLocalStorage('show_thinking', true);

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
    loadMessages,
    addError
  } = useChat({ apiKey, model, provider, contextLength });

  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  // 加载历史对话时跳过一次自动保存（避免回写覆盖 updated_at）
  const skipAutoSaveRef = useRef(false);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch (error) {
      console.warn('加载历史对话列表失败:', error);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // 对话结束后自动保存（每轮完成/中断均落库，手动删除前一直保留）
  useEffect(() => {
    if (status !== 'idle' || messages.length === 0) return;

    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      const id = conversationId ?? generateConversationId();
      if (!conversationId) setConversationId(id);

      const firstUser = messages.find((m) => m.role === 'user');
      const title = (firstUser?.content || '未命名对话').slice(0, 30).replace(/\s+/g, ' ');

      try {
        await saveConversation({ id, title, provider, model, messages });
        refreshConversations();
      } catch (error) {
        console.warn('对话保存失败:', error);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [messages, status, conversationId, provider, model, refreshConversations]);

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

  /** 从历史列表加载某个对话 */
  const handleLoadConversation = useCallback(
    async (id: string) => {
      if (status !== 'idle') return;
      try {
        const history = await fetchConversation(id);
        skipAutoSaveRef.current = true;
        setConversationId(id);
        loadMessages(history);
      } catch (error) {
        addError((error as Error).message || '加载对话失败');
      }
    },
    [status, loadMessages, addError]
  );

  /** 手动删除历史对话 */
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (!window.confirm('确定删除这条对话记录吗？删除后不可恢复。')) return;
      try {
        await deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (id === conversationId) {
          skipAutoSaveRef.current = true;
          setConversationId(null);
          clear();
        }
      } catch (error) {
        addError((error as Error).message || '删除对话失败');
      }
    },
    [conversationId, clear, addError]
  );

  /** 清空对话：旧记录保留在数据库，新一轮对话从新 ID 开始 */
  const handleClear = useCallback(() => {
    skipAutoSaveRef.current = true;
    setConversationId(null);
    clear();
  }, [clear]);

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
        onClear={handleClear}
        onExport={exportToMarkdown}
        hasMessages={messages.length > 0}
        isOffline={isOffline}
        status={status}
        conversations={conversations}
        currentConversationId={conversationId}
        onLoadConversation={handleLoadConversation}
        onDeleteConversation={handleDeleteConversation}
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
        showThinking={showThinking}
        onShowThinkingChange={setShowThinking}
        disabled={!apiKey}
      />
    </div>
  );
}

export default App;
