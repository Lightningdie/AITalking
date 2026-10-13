import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatContainer, Sidebar } from './components';
import { useChat, useLocalStorage, useVoicePlayback, type VoicePlayMode } from './hooks';
import {
  listConversations,
  fetchConversation,
  saveConversation,
  deleteConversation
} from './services/historyApi';
import { checkVoiceService } from './services/voiceApi';
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
  // 思考深度：max=思考最久（官方推荐），default=不传参数走模型默认档
  const [reasoningEffort, setReasoningEffort] = useLocalStorage('ai_reasoning_effort', 'max');
  const [contextLength, setContextLength] = useLocalStorage('context_length', 10);
  const [streamMode, setStreamMode] = useState(true);
  const [showThinking, setShowThinking] = useLocalStorage('show_thinking', true);

  // ===== 语音能力（方案A 开箱即用，方案B 需启动 voice-service）=====
  // 朗读模式：off 关闭 / browser 浏览器朗读 / server 服务端高清语音
  const [voiceMode, setVoiceMode] = useLocalStorage<VoicePlayMode>('voice_mode', 'off');
  // 服务端语音服务在线状态
  const [voiceServiceOk, setVoiceServiceOk] = useState(false);

  const voice = useVoicePlayback({ mode: voiceMode });

  // 探测语音服务是否在线（决定麦克风是否走服务端 ASR）
  useEffect(() => {
    checkVoiceService().then((info) => setVoiceServiceOk(info.ok));
  }, []);

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
  } = useChat({ apiKey, model, provider, contextLength, reasoningEffort });

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

  // ===== 语音朗读：把流式回复喂给 TTS =====
  // 流式期间持续喂入增量文本，hook 内部按句切分，边生成边说
  useEffect(() => {
    if (!streamingMessage) return;
    voice.feed(streamingMessage.id, streamingMessage.content, false);
  }, [streamingMessage?.id, streamingMessage?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // 消息完成/中断后冲刷最后一句（仅对当轮已喂过的消息生效，历史加载不受影响）
  useEffect(() => {
    if (status !== 'idle' || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant') return;
    voice.feed(last.id, last.content, true);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendMessage = useCallback(
    async (content: string, images?: string[]) => {
      voice.stop(); // 插话即停：发送新消息时中断朗读
      try {
        if (streamMode) {
          await sendMessageStream(content, images);
        } else {
          await sendMessageNonStream(content, images);
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
    voice.stop();
    skipAutoSaveRef.current = true;
    setConversationId(null);
    clear();
  }, [clear]);

  /** 切换朗读模式：服务端模式需要语音服务在线，否则回退浏览器并提示 */
  const handleVoiceModeChange = useCallback(
    (mode: VoicePlayMode) => {
      if (mode === 'server') {
        checkVoiceService().then((info) => {
          if (!info.ok) {
            window.alert(
              '服务端语音服务未启动或不可用。\n\n' +
                '请在项目根目录运行: npm run voice\n' +
                '（首次运行会自动下载 ASR 模型，需要等待一段时间）\n\n' +
                '本次已回退到浏览器朗读。'
            );
            return;
          }
          setVoiceServiceOk(true);
          setVoiceMode(mode);
        });
      } else {
        setVoiceMode(mode);
      }
    },
    [setVoiceMode]
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
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={setReasoningEffort}
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
        voiceMode={voiceMode}
        onVoiceModeChange={handleVoiceModeChange}
        speaking={voice.speaking}
        onStopSpeaking={voice.stop}
        preferServerAsr={voiceServiceOk}
        disabled={!apiKey}
      />
    </div>
  );
}

export default App;
