import { memo } from 'react';
import { MessageContent } from './MessageContent';
import type { MessageRole, MessageStatus, ErrorCategory } from '../types';

/** 纯展示：仅根据 props 渲染气泡，无业务/流式逻辑 */
export interface MessageItemProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  messageStatus?: MessageStatus;
  retryable?: boolean;
  errorCategory?: ErrorCategory;
  onRetry?: () => void;
}

function getRoleClass(role: MessageRole): string {
  return role === 'error' ? 'error' : role;
}

function getAvatar(role: MessageRole): string {
  if (role === 'user') return '👤';
  if (role === 'error') return '⚠️';
  return '🤖';
}

function getStatusHint(messageStatus?: MessageStatus, role?: MessageRole): string | null {
  if (messageStatus === 'aborted') return '已中断';
  if (messageStatus === 'error' && role === 'assistant') return '请求失败';
  return null;
}

export const MessageItem = memo(function MessageItem({
  role,
  content,
  isStreaming = false,
  messageStatus,
  retryable,
  errorCategory,
  onRetry
}: MessageItemProps) {
  const roleClass = getRoleClass(role);
  const avatar = getAvatar(role);
  const statusHint = getStatusHint(messageStatus, role);
  const isError = messageStatus === 'error';

  return (
    <div className={`message-item message-item--${roleClass}${isError ? ' message-item--error' : ''}`}>
      <div className="message-item__avatar">{avatar}</div>
      <div className="message-item__content">
        {isStreaming && !content ? (
          <TypingDots />
        ) : (
          <>
            <MessageContent content={content} />
            {isStreaming && <span className="message-item__cursor" aria-hidden />}
            {statusHint && (
              <span className="message-item__status-hint" aria-label={statusHint}>
                {statusHint}
              </span>
            )}
            {isError && (
              <div className="message-item__error-bar">
                {errorCategory && (
                  <span className={`message-item__error-tag message-item__error-tag--${errorCategory}`}>
                    {errorCategory === 'network' && '网络'}
                    {errorCategory === 'auth' && '认证'}
                    {errorCategory === 'rate_limit' && '频率'}
                    {errorCategory === 'model' && '模型'}
                    {errorCategory === 'param' && '参数'}
                    {errorCategory === 'unknown' && '错误'}
                  </span>
                )}
                {retryable && onRetry && (
                  <button
                    type="button"
                    className="btn message-item__retry-btn"
                    onClick={onRetry}
                  >
                    🔄 重试
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

function TypingDots() {
  return (
    <div className="typing-dots">
      <span className="typing-dots__dot" />
      <span className="typing-dots__dot" />
      <span className="typing-dots__dot" />
    </div>
  );
}

export default MessageItem;
