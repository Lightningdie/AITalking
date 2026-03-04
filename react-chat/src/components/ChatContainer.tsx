import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import type { Message, ChatStatus } from '../types';

export interface ChatContainerProps {
  messages: Message[];
  streamingMessage: Message | null;
  status: ChatStatus;
  lastErrorMessage: string | null;
  onSendMessage: (content: string) => void;
  onCancel?: () => void;
  streamMode: boolean;
  onStreamModeChange: (enabled: boolean) => void;
  disabled?: boolean;
}

function isInputDisabled(disabled?: boolean, status?: ChatStatus): boolean {
  if (disabled) return true;
  return status === 'requesting' || status === 'streaming';
}

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
  disabled
}: ChatContainerProps) {
  const displayMessages = [
    ...messages,
    ...(streamingMessage ? [streamingMessage] : [])
  ];

  const inputDisabled = isInputDisabled(disabled, status);
  const showLoading = isLoading(status);
  const showCancel = status === 'streaming' && onCancel;

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1 className="chat-title">🤖 AI Chat</h1>
        <div className="chat-controls">
          <StreamToggle
            enabled={streamMode}
            onChange={onStreamModeChange}
            disabled={status === 'requesting' || status === 'streaming'}
          />
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

      <div className="messages-area">
        <MessageList messages={displayMessages} emptyContent={<WelcomeMessage />} />
      </div>

      <InputBox
        onSend={onSendMessage}
        disabled={inputDisabled}
        loading={showLoading}
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

function WelcomeMessage() {
  return (
    <div className="welcome-message">
      <div className="welcome-icon">✨</div>
      <h2>欢迎使用 AI 对话</h2>
      <p>在左侧选择 API 提供商并配置 API Key 开始对话</p>
      <div className="feature-list">
        <div className="feature-item">🔄 支持智谱 AI / 讯飞星火切换</div>
        <div className="feature-item">📥 对话历史导出 Markdown</div>
        <div className="feature-item">🔁 断网自动重试</div>
        <div className="feature-item">💻 代码块语法高亮</div>
      </div>
    </div>
  );
}

export default ChatContainer;
