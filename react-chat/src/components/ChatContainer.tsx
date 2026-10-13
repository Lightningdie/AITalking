import { useRef, useEffect, useState, useCallback } from 'react';
import { ChatBubble } from './ChatBubble';
import { ChatInput } from './ChatInput';
import type { Message, ChatStatus } from '../types';
import type { VoicePlayMode } from '../hooks/useVoicePlayback';

export interface ChatContainerProps {
  messages: Message[];
  streamingMessage: Message | null;
  /** 全局对话状态，UI loading/禁用均由此派生 */
  status: ChatStatus;
  lastErrorMessage: string | null;
  onSendMessage: (content: string, images?: string[]) => void;
  onCancel?: () => void;
  streamMode: boolean;
  onStreamModeChange: (enabled: boolean) => void;
  /** 是否显示思考过程预览 */
  showThinking: boolean;
  onShowThinkingChange: (enabled: boolean) => void;
  /** 语音朗读模式：off 关闭 / browser 浏览器朗读 / server 服务端高清语音 */
  voiceMode: VoicePlayMode;
  onVoiceModeChange: (mode: VoicePlayMode) => void;
  /** 是否正在朗读（显示停止按钮） */
  speaking: boolean;
  onStopSpeaking?: () => void;
  /** 语音输入是否优先走服务端 ASR（语音服务在线时为 true） */
  preferServerAsr?: boolean;
  /** 额外禁用条件（如未配置 API Key） */
  disabled?: boolean;
}

/** 输入区是否应禁用：由全局 status 派生 */
function isInputDisabled(disabled?: boolean, status?: ChatStatus): boolean {
  if (disabled) return true;
  return status === 'requesting' || status === 'streaming';
}

/** 是否显示加载中：由全局 status 派生 */
function isLoading(status: ChatStatus): boolean {
  return status === 'requesting';
}

export function ChatContainer({
  messages,
  streamingMessage,
  status,
  lastErrorMessage,
  onSendMessage,
  onCancel,
  streamMode,
  onStreamModeChange,
  showThinking,
  onShowThinkingChange,
  voiceMode,
  onVoiceModeChange,
  speaking,
  onStopSpeaking,
  preferServerAsr,
  disabled
}: ChatContainerProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  /** 用户是否停在底部附近：只有贴底时流式内容才自动跟随滚动 */
  const stickToBottomRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  /** 距底部多少像素以内视为"贴底" */
  const STICK_THRESHOLD = 60;

  const displayMessages = [
    ...messages,
    ...(streamingMessage ? [streamingMessage] : [])
  ];

  const inputDisabled = isInputDisabled(disabled, status);
  const showLoading = isLoading(status);
  const showCancel = status === 'streaming' && onCancel;

  // 滚动时判断是否贴底：贴底 → 恢复跟随；离开底部 → 停止跟随并显示回底按钮
  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < STICK_THRESHOLD;
    stickToBottomRef.current = atBottom;
    setShowJumpButton(!atBottom);
  }, []);

  // 发送新消息视为主动回到对话现场，恢复贴底跟随
  const handleSendAndFollow = useCallback(
    (content: string, images?: string[]) => {
      stickToBottomRef.current = true;
      setShowJumpButton(false);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });
      onSendMessage(content, images);
    },
    [onSendMessage]
  );

  /** 点按钮回到最底部并恢复跟随 */
  const jumpToBottom = useCallback(() => {
    stickToBottomRef.current = true;
    setShowJumpButton(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // 消息/流式内容更新时：仅当用户停在底部才跟随滚动，不强制抢焦点
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1 className="chat-title">🤖 AI Chat</h1>
        <div className="chat-controls">
          <VoiceModeSelect value={voiceMode} onChange={onVoiceModeChange} />
          <StreamToggle
            enabled={streamMode}
            onChange={onStreamModeChange}
            disabled={status === 'requesting' || status === 'streaming'}
          />
          <ThinkingToggle enabled={showThinking} onChange={onShowThinkingChange} />
          {speaking && onStopSpeaking && (
            <button
              type="button"
              className="btn btn--ghost chat-cancel-btn"
              onClick={onStopSpeaking}
              aria-label="停止朗读"
            >
              🔇 停止朗读
            </button>
          )}
          {showCancel && (
            <button
              type="button"
              className="btn btn--ghost chat-cancel-btn"
              onClick={onCancel}
              aria-label="停止生成"
            >
              ⏹ 停止
            </button>
          )}
        </div>
      </header>

      {status === 'error' && lastErrorMessage && (
        <div className="chat-error-banner" role="alert">
          ⚠️ {lastErrorMessage}
        </div>
      )}

      <div className="messages-area" ref={scrollAreaRef} onScroll={handleScroll}>
        <div className="messages-list">
          {displayMessages.length === 0 ? (
            <WelcomeMessage />
          ) : (
            <>
              {displayMessages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  images={msg.images}
                  reasoningContent={msg.reasoningContent}
                  toolCalls={msg.toolCalls}
                  isStreaming={msg.status === 'streaming'}
                  showThinking={showThinking}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {showJumpButton && (
          <button
            type="button"
            className="jump-bottom-btn"
            onClick={jumpToBottom}
            aria-label="回到底部"
            title="回到底部并跟随最新消息"
          >
            ↓
          </button>
        )}
      </div>

      <ChatInput
        onSend={handleSendAndFollow}
        disabled={inputDisabled}
        loading={showLoading}
        preferServerAsr={preferServerAsr}
        onBeforeSend={onStopSpeaking}
      />
    </div>
  );
}

interface StreamToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function StreamToggle({ enabled, onChange, disabled }: StreamToggleProps) {
  return (
    <label className={`toggle ${disabled ? 'toggle--disabled' : ''}`}>
      <span>流式输出</span>
      <div
        className={`toggle__switch ${enabled ? 'toggle__switch--active' : ''}`}
        onClick={() => !disabled && onChange(!enabled)}
        role="switch"
        aria-checked={enabled}
        aria-disabled={disabled}
      />
    </label>
  );
}

interface ThinkingToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

function ThinkingToggle({ enabled, onChange }: ThinkingToggleProps) {
  return (
    <label className="toggle">
      <span>思考过程</span>
      <div
        className={`toggle__switch ${enabled ? 'toggle__switch--active' : ''}`}
        onClick={() => onChange(!enabled)}
        role="switch"
        aria-checked={enabled}
      />
    </label>
  );
}

interface VoiceModeSelectProps {
  value: VoicePlayMode;
  onChange: (mode: VoicePlayMode) => void;
}

function VoiceModeSelect({ value, onChange }: VoiceModeSelectProps) {
  return (
    <label className="toggle">
      <span>语音朗读</span>
      <select
        className="voice-select"
        value={value}
        onChange={(e) => onChange(e.target.value as VoicePlayMode)}
        aria-label="语音朗读模式"
      >
        <option value="off">关闭</option>
        <option value="browser">浏览器</option>
        <option value="server">服务端</option>
      </select>
    </label>
  );
}

function WelcomeMessage() {
  return (
    <div className="welcome-message">
      <div className="welcome-icon">✨</div>
      <h2>欢迎使用 AI 对话</h2>
      <p>在左侧选择 API 提供商并配置 API Key 开始对话</p>
      <div className="feature-list">
        <div className="feature-item">🖼️ 上传/粘贴图片，AI 识别图片内容</div>
        <div className="feature-item">📄 回复下方一键导出 Word / Excel / Markdown</div>
        <div className="feature-item">📥 对话历史自动保存，导出 Markdown</div>
        <div className="feature-item">🎙️ 语音输入 · AI 语音朗读回复</div>
        <div className="feature-item">💻 代码块自动跳过朗读 · 🧠 思考过程展示</div>
      </div>
    </div>
  );
}

export default ChatContainer;
