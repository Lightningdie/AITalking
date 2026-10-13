/**
 * 对话历史记录 API 封装
 */
import type { ConversationMeta, Message } from '../types';

const BASE = '/api/conversations';

interface ConversationRow {
  id: string;
  title: string;
  provider: string;
  model: string;
  created_at: number;
  updated_at: number;
  message_count: number;
}

interface MessageRow {
  id: string;
  role: Message['role'];
  content: string;
  reasoning_content: string | null;
  images: string | null;
  created_at: number;
}

function toMeta(row: ConversationRow): ConversationMeta {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count
  };
}

function toMessage(row: MessageRow): Message {
  let images: string[] | undefined;
  if (row.images) {
    try { images = JSON.parse(row.images); } catch { images = undefined; }
  }
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    reasoningContent: row.reasoning_content || undefined,
    images,
    status: 'done',
    createdAt: row.created_at
  };
}

/** 获取历史对话列表 */
export async function listConversations(): Promise<ConversationMeta[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`获取历史对话失败: HTTP ${res.status}`);
  const data = await res.json() as { conversations: ConversationRow[] };
  return data.conversations.map(toMeta);
}

/** 获取单个对话（含消息） */
export async function fetchConversation(id: string): Promise<Message[]> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error(`加载对话失败: HTTP ${res.status}`);
  const data = await res.json() as { messages: MessageRow[] };
  return data.messages.map(toMessage);
}

/** 保存对话（整体覆盖） */
export async function saveConversation(payload: {
  id: string;
  title: string;
  provider: string;
  model: string;
  messages: Message[];
}): Promise<void> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: payload.id,
      title: payload.title,
      provider: payload.provider,
      model: payload.model,
      messages: payload.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        reasoningContent: m.reasoningContent,
        images: m.images,
        createdAt: m.createdAt
      }))
    })
  });
  if (!res.ok) throw new Error(`保存对话失败: HTTP ${res.status}`);
}

/** 删除对话 */
export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除对话失败: HTTP ${res.status}`);
}
