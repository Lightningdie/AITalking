/**
 * 按会话 ID 使用 localStorage 存储会话数据；会话列表单独存一份
 */
import type { Message, SessionData, SessionMeta } from '../types';

const SESSION_LIST_KEY = 'chat_session_list';
const SESSION_PREFIX = 'chat_session_';
const DEFAULT_TITLE = '新对话';
const TITLE_MAX_LEN = 28;

interface SessionListState {
  currentId: string;
  ids: string[];
}

function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

function generateSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionListState(): SessionListState {
  try {
    const raw = localStorage.getItem(SESSION_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SessionListState;
      if (parsed.currentId && Array.isArray(parsed.ids)) return parsed;
    }
  } catch (e) {
    console.warn('sessionStorage: read list failed', e);
  }
  const newId = generateSessionId();
  const state: SessionListState = { currentId: newId, ids: [newId] };
  localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(state));
  const now = Date.now();
  try {
    localStorage.setItem(sessionKey(newId), JSON.stringify({
      id: newId,
      title: DEFAULT_TITLE,
      messages: [],
      createdAt: now,
      updatedAt: now
    } as SessionData));
  } catch (e) {
    console.warn('sessionStorage: init session failed', e);
  }
  return state;
}

function setSessionListState(state: SessionListState): void {
  try {
    localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('sessionStorage: write list failed', e);
  }
}

export function getSessionList(): SessionMeta[] {
  const { ids } = getSessionListState();
  const list: SessionMeta[] = [];
  for (const id of ids) {
    const data = getSession(id);
    if (data) list.push({ id: data.id, title: data.title, createdAt: data.createdAt, updatedAt: data.updatedAt });
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  return list;
}

export function getCurrentSessionId(): string {
  return getSessionListState().currentId;
}

export function setCurrentSessionId(id: string): void {
  const state = getSessionListState();
  if (state.ids.includes(id)) {
    state.currentId = id;
    setSessionListState(state);
  }
}

export function getSession(id: string): SessionData | null {
  try {
    const raw = localStorage.getItem(sessionKey(id));
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    if (data.id && Array.isArray(data.messages)) return data;
  } catch (e) {
    console.warn('sessionStorage: getSession failed', id, e);
  }
  return null;
}

function titleFromMessages(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser && firstUser.content) {
    const text = firstUser.content.trim().replace(/\s+/g, ' ');
    const firstLine = text.split('\n')[0] ?? text;
    const t = firstLine.slice(0, TITLE_MAX_LEN);
    return t + (firstLine.length > TITLE_MAX_LEN ? '…' : '');
  }
  return DEFAULT_TITLE;
}

export function saveSession(id: string, data: Omit<SessionData, 'id' | 'title'> & { title?: string }): void {
  const existing = getSession(id);
  const now = Date.now();
  const derivedTitle = titleFromMessages(data.messages);
  const title =
    data.title ??
    (data.messages?.length && derivedTitle !== DEFAULT_TITLE ? derivedTitle : existing?.title) ??
    DEFAULT_TITLE;
  const session: SessionData = {
    id,
    title,
    messages: data.messages,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  try {
    localStorage.setItem(sessionKey(id), JSON.stringify(session));
  } catch (e) {
    console.warn('sessionStorage: saveSession failed', id, e);
  }
}

export function createSession(): string {
  const id = generateSessionId();
  const state = getSessionListState();
  if (!state.ids.includes(id)) {
    state.ids.unshift(id);
    state.currentId = id;
    setSessionListState(state);
  }
  const now = Date.now();
  saveSession(id, { messages: [], createdAt: now, updatedAt: now, title: DEFAULT_TITLE });
  return id;
}

export function deleteSession(id: string): void {
  const state = getSessionListState();
  state.ids = state.ids.filter((x) => x !== id);
  if (state.currentId === id) {
    state.currentId = state.ids[0] ?? createSession();
  }
  setSessionListState(state);
  try {
    localStorage.removeItem(sessionKey(id));
  } catch (e) {
    console.warn('sessionStorage: deleteSession failed', id, e);
  }
}

export { generateSessionId };
