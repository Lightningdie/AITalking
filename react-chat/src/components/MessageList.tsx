import type { ReactNode } from 'react';
import { MessageItem } from './MessageItem';
import type { Message } from '../types';

export interface MessageListProps {
  messages: Message[];
  emptyContent?: ReactNode;
}

/** 仅负责渲染消息列表；滚动由父级 messages-area 的 onScroll + useEffect 控制 */
export function MessageList({ messages, emptyContent }: MessageListProps) {
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
    </div>
  );
}

export default MessageList;
