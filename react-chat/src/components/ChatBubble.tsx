import { memo } from 'react';
import { MessageContent } from './MessageContent';
import type { MessageRole } from '../types';

export interface ChatBubbleProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
}

export const ChatBubble = memo(function ChatBubble({
  role,
  content,
  isStreaming = false
}: ChatBubbleProps) {
  const roleClass = role === 'error' ? 'error' : role;
  const avatar = role === 'user' ? '👤' : role === 'error' ? '⚠️' : '🤖';

  return (
    <div className={`chat-bubble chat-bubble--${roleClass}`}>
      <div className="chat-bubble__avatar">{avatar}</div>
      <div className="chat-bubble__content">
        {isStreaming && !content ? (
          <TypingDots />
        ) : (
          <>
            <MessageContent content={content} />
            {isStreaming && <span className="typing-cursor" />}
          </>
        )}
      </div>
    </div>
  );
});

export function TypingDots() {
  return (
    <div className="typing-dots">
      <span className="typing-dots__dot" />
      <span className="typing-dots__dot" />
      <span className="typing-dots__dot" />
    </div>
  );
}

export default ChatBubble;
