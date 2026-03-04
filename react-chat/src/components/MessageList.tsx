import { useRef, useEffect, type ReactNode } from 'react';
import { MessageItem } from './MessageItem';
import type { Message } from '../types';

export interface MessageListProps {
  messages: Message[];
  emptyContent?: ReactNode;
}

/** 仅负责渲染消息列表与滚动锚点，无流式/业务逻辑 */
export function MessageList({ messages, emptyContent }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages-list">
      {messages.length === 0 ? (
        emptyContent
      ) : (
        <>
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              role={msg.role}
              content={msg.content}
              isStreaming={msg.status === 'streaming'}
              messageStatus={msg.status}
            />
          ))}
        </>
      )}
      <div ref={endRef} />
    </div>
  );
}

export default MessageList;
