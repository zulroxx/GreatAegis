import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Conversation, ChatMessage } from "../types/api";

const STORAGE_KEY = "GREATAEGIS_CHAT_HISTORY";
const ACTIVE_KEY = "GREATAEGIS_ACTIVE_CONVERSATION";

interface ChatHistoryContextValue {
  conversations: Conversation[];
  activeConversationId: string | null;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  selectConversation: (id: string | null) => void;
  updateMessages: (id: string, messages: ChatMessage[]) => void;
  getActiveConversation: () => Conversation | undefined;
}

const ChatHistoryContext = createContext<ChatHistoryContextValue | null>(null);

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore corrupt data */
  }
  return [];
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    /* storage full or unavailable */
  }
}

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_KEY);
      if (stored) {
        const convs = loadConversations();
        if (convs.some((c) => c.id === stored)) return stored;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    try {
      if (activeConversationId) {
        localStorage.setItem(ACTIVE_KEY, activeConversationId);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [activeConversationId]);

  const createConversation = useCallback((): string => {
    const id = `conv-${Date.now()}`;
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: "New Chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(id);
    return id;
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveConversationId((prev) => (prev === id ? null : prev));
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, title: title.trim() || "Untitled", updatedAt: Date.now() } : c,
      ),
    );
  }, []);

  const selectConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
  }, []);

  const updateMessages = useCallback((id: string, messages: ChatMessage[]) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, messages, updatedAt: Date.now(), title: c.title === "New Chat" && messages.length > 0 ? titleFromMessages(messages) : c.title }
          : c,
      ),
    );
  }, []);

  const getActiveConversation = useCallback((): Conversation | undefined => {
    if (!activeConversationId) return undefined;
    return conversations.find((c) => c.id === activeConversationId);
  }, [conversations, activeConversationId]);

  return (
    <ChatHistoryContext.Provider
      value={{
        conversations,
        activeConversationId,
        createConversation,
        deleteConversation,
        renameConversation,
        selectConversation,
        updateMessages,
        getActiveConversation,
      }}
    >
      {children}
    </ChatHistoryContext.Provider>
  );
}

export function useChatHistory(): ChatHistoryContextValue {
  const ctx = useContext(ChatHistoryContext);
  if (!ctx) throw new Error("useChatHistory must be used within a ChatHistoryProvider");
  return ctx;
}

function titleFromMessages(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New Chat";
  const text = firstUser.content.trim();
  return text.length > 50 ? text.slice(0, 50) + "..." : text;
}
