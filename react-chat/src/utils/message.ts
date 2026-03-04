import type { Message, MessageRole, MessageStatus } from '../types';

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export interface CreateMessageParams {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  id?: string;
  createdAt?: number;
}

export function createMessage({
  role,
  content,
  status = 'done',
  id,
  createdAt
}: CreateMessageParams): Message {
  return {
    id: id || generateMessageId(),
    role,
    content: content || '',
    status,
    createdAt: createdAt ?? Date.now()
  };
}
