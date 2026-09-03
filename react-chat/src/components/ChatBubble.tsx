import { memo, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MessageContent } from './MessageContent';
import type { MessageRole } from '../types';

// Milkdown 体积较大，懒加载为独立 chunk，首屏不加载
const MilkdownView = lazy(() =>
  import('./MilkdownView').then((m) => ({ default: m.MilkdownView }))
);

export interface ChatBubbleProps {
  role: MessageRole;
  content: string;
  reasoningContent?: string;
  isStreaming?: boolean;
  /** 是否显示思考过程（全局开关） */
  showThinking?: boolean;
}

export const ChatBubble = memo(function ChatBubble({
  role,
  content,
  reasoningContent,
  isStreaming = false,
  showThinking = true
}: ChatBubbleProps) {
  const roleClass = role === 'error' ? 'error' : role;
  const avatar = role === 'user' ? '👤' : role === 'error' ? '⚠️' : '🤖';

  // 流式期间第一条思考内容到达时自动展开，之后由用户手动控制
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (showThinking && reasoningContent && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setThinkingOpen(true);
    }
  }, [showThinking, reasoningContent]);

  const hasThinking = showThinking && !!reasoningContent;

  return (
    <div className={`chat-bubble chat-bubble--${roleClass}`}>
      <div className="chat-bubble__avatar">{avatar}</div>
      <div className="chat-bubble__content">
        {hasThinking && (
          <details
            className={`thinking-block ${isStreaming ? 'thinking-block--streaming' : ''}`}
            open={thinkingOpen}
            onClick={(e) => {
              e.preventDefault();
              setThinkingOpen((o) => !o);
            }}
          >
            <summary className="thinking-block__summary">
              💭 思考过程{isStreaming && !content ? '中…' : ''}
            </summary>
            <div className="thinking-block__content">{reasoningContent}</div>
          </details>
        )}
        {isStreaming && !content ? (
          <TypingDots />
        ) : role === 'assistant' && !isStreaming && content ? (
          // 已完成的回复用 Milkdown 富文本呈现（chunk 加载完成前先降级轻量渲染）
          <Suspense fallback={<MessageContent content={content} />}>
            <MilkdownView content={content} />
          </Suspense>
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
