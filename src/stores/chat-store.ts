import { create } from "zustand";
import * as api from "@/lib/api-client-v2";

export interface ChatMessage { id: string; role: string; content: string; createdAt: string; annotations?: unknown[]; }
export interface ChatSession {
  id: string; bookId: string; chapterId: string | null; chapterTitle: string | null;
  mode: string; title: string; messages: ChatMessage[];
  createdAt: string; updatedAt: string;
}

interface ChatState {
  sessions: ChatSession[];
  ready: boolean;
  load: (bookId: string) => Promise<void>;
  addSession: (input: Omit<ChatSession, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  deleteSession: (id: string) => Promise<void>;
  addMessage: (sessionId: string, role: string, content: string) => void;
  updateSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
  getBookSessions: (bookId: string) => ChatSession[];
}

export const useChatStore = create<ChatState>()((set, get) => ({
  sessions: [],
  ready: false,

  load: async (bookId) => {
    try {
      const sessions = await api.apiGetChatSessions(bookId);
      set(s => ({ sessions: [...sessions, ...s.sessions.filter(x => !sessions.find((y: any) => y.id === x.id))], ready: true }));
    } catch { set({ ready: true }); }
  },

  addSession: async (input) => {
    const result = await api.apiCreateChatSession(input);
    const now = new Date().toISOString();
    const session: ChatSession = { ...input, id: result.id, createdAt: now, updatedAt: now };
    set(s => ({ sessions: [session, ...s.sessions] }));
    return result.id;
  },

  deleteSession: async (id) => {
    set(s => ({ sessions: s.sessions.filter(x => x.id !== id) }));
    try { await api.apiDeleteChatSession(id); } catch {}
  },

  addMessage: (sessionId, role, content) => {
    const msg: ChatMessage = { id: Math.random().toString(36), role, content, createdAt: new Date().toISOString() };
    set(s => ({
      sessions: s.sessions.map(session =>
        session.id === sessionId
          ? { ...session, messages: [...session.messages, msg], updatedAt: new Date().toISOString() }
          : session
      ),
    }));
    // Async sync to server
    api.apiAddChatMessage(sessionId, role, content).catch(() => {});
  },

  updateSessionMessages: (sessionId, messages) => {
    set(s => ({
      sessions: s.sessions.map(session =>
        session.id === sessionId ? { ...session, messages, updatedAt: new Date().toISOString() } : session
      ),
    }));
    // Sync last message to MySQL
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.id !== "welcome") {
      api.apiAddChatMessage(sessionId, lastMsg.role, lastMsg.content, lastMsg.annotations).catch(() => {});
    }
  },

  getBookSessions: (bookId) =>
    get().sessions.filter(s => s.bookId === bookId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
}));
