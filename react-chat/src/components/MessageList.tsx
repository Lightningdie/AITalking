import { memo, type ReactNode } from 'react';
import { MessageItem } from './MessageItem';
import type { Message } from '../types';

export interface MessageListProps {
  messages: Message[];
  emptyContent?: ReactNode;
  /** 超过条数时只渲染最后 N 条，并显示「上方还有 X 条」；0 表示不限制 */
  virtualThreshold?: number;
  /** 重试回调：传入失败消息的 id */
  onRetry?: (messageId: string) => void;
}

/** 仅负责渲染消息列表；滚动由父级 messages-area 的 onScroll + useEffect 控制 */
function MessageListInner({ messages, emptyContent, virtualThreshold = 0, onRetry }: MessageListProps) {
  const visibleMessages =
    virtualThreshold > 0 && messages.length > virtualThreshold
      ? messages.slice(-virtualThreshold)
      : messages;
  const collapsedCount =
    virtualThreshold > 0 && messages.length > virtualThreshold
      ? messages.length - virtualThreshold
      : 0;

  return (
    <div className="messages-list">
      {visibleMessages.length === 0 ? (
        emptyContent
      ) : (
        <>
          {collapsedCount > 0 && (
            <div className="messages-list__fold" role="status">
              上方还有 {collapsedCount} 条消息，仅展示最近 {virtualThreshold} 条
            </div>
          )}
          {visibleMessages.map((msg) => (
            <MessageItem
              key={msg.id}
              role={msg.role}
              content={msg.content}
              isStreaming={msg.status === 'streaming'}
              messageStatus={msg.status}
              retryable={msg.retryable}
              errorCategory={msg.errorCategory}
              onRetry={msg.retryable && onRetry ? () => onRetry(msg.id) : undefined}
            />
          ))}
        </>
      )}
    </div>
  );
}

export const MessageList = memo(MessageListInner);

export default MessageList;
