import { useState, useCallback, useEffect } from 'react';
import type { Message, SessionData, SessionMeta } from '../types';
import {
  getSessionList,
  getCurrentSessionId,
  setCurrentSessionId as setCurrentIdStorage,
  getSession,
  saveSession,
  createSession as createSessionStorage,
  deleteSession as deleteSessionStorage
} from '../utils/sessionStorage';

export interface UseSessionsReturn {
  sessions: SessionMeta[];
  currentSessionId: string;
  currentSessionData: SessionData | null;
  createSession: () => string;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  saveCurrentSessionMessages: (messages: Message[]) => void;
  refreshSessionList: () => void;
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<SessionMeta[]>(() => getSessionList());
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => getCurrentSessionId());
  const [currentSessionData, setCurrentSessionData] = useState<SessionData | null>(() =>
    getSession(getCurrentSessionId())
  );

  const refreshSessionList = useCallback(() => {
    setSessions(getSessionList());
  }, []);

  useEffect(() => {
    setCurrentSessionData(getSession(currentSessionId));
    setCurrentIdStorage(currentSessionId);
  }, [currentSessionId]);

  const createSession = useCallback((): string => {
    const id = createSessionStorage();
    setCurrentSessionId(id);
    setCurrentSessionData(getSession(id));
    setSessions(getSessionList());
    return id;
  }, []);

  const deleteSession = useCallback((id: string) => {
    deleteSessionStorage(id);
    setSessions(getSessionList());
    if (currentSessionId === id) {
      const nextId = getCurrentSessionId();
      setCurrentSessionId(nextId);
      setCurrentSessionData(getSession(nextId));
    }
  }, [currentSessionId]);

  const switchSession = useCallback((id: string) => {
    setCurrentSessionId(id);
    setCurrentSessionData(getSession(id));
  }, []);

  const saveCurrentSessionMessages = useCallback((messages: Message[]) => {
    saveSession(currentSessionId, {
      messages,
      createdAt: currentSessionData?.createdAt ?? Date.now(),
      updatedAt: Date.now()
    });
    setSessions(getSessionList());
    setCurrentSessionData(getSession(currentSessionId));
  }, [currentSessionId, currentSessionData?.createdAt]);

  return {
    sessions,
    currentSessionId,
    currentSessionData,
    createSession,
    deleteSession,
    switchSession,
    saveCurrentSessionMessages,
    refreshSessionList
  };
}

export default useSessions;
