import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface KnowledgeCard {
  id: string;
  bookId: string;
  chapterId: string | null;
  cardType: "concept" | "argument" | "evidence" | "example" | "question";
  title: string;
  content: string;
  sourceChunks: string[];
  tags: string[];
  difficulty: "basic" | "intermediate" | "advanced";
  createdAt: string;
}

export interface MindMap {
  id: string;
  bookId: string;
  chapterId: string | null;
  title: string;
  data: MindMapNode;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
  cardId?: string;
  entityId?: string;
  collapsed?: boolean;
}

interface KnowledgeState {
  cards: KnowledgeCard[];
  mindMaps: MindMap[];

  // Cards
  addCard: (card: Omit<KnowledgeCard, "id" | "createdAt">) => string;
  addCards: (cards: Omit<KnowledgeCard, "id" | "createdAt">[]) => void;
  removeCard: (id: string) => void;
  updateCard: (id: string, updates: Partial<KnowledgeCard>) => void;
  getBookCards: (bookId: string) => KnowledgeCard[];
  getCardsByType: (bookId: string, type: string) => KnowledgeCard[];

  // Mind Maps
  addMindMap: (mm: Omit<MindMap, "id" | "createdAt" | "updatedAt">) => string;
  updateMindMap: (id: string, data: MindMapNode) => void;
  removeMindMap: (id: string) => void;
  getBookMindMaps: (bookId: string) => MindMap[];
  getChapterMindMap: (bookId: string, chapterId: string) => MindMap | undefined;
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      cards: [],
      mindMaps: [],

      addCard: (input) => {
        const id = crypto.randomUUID();
        const card: KnowledgeCard = { ...input, id, createdAt: new Date().toISOString() };
        set((s) => ({ cards: [card, ...s.cards] }));
        return id;
      },

      addCards: (inputs) => {
        const newCards: KnowledgeCard[] = inputs.map((input) => ({
          ...input,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        }));
        set((s) => ({ cards: [...newCards, ...s.cards] }));
      },

      removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
      updateCard: (id, updates) =>
        set((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      getBookCards: (bookId) => get().cards.filter((c) => c.bookId === bookId),
      getCardsByType: (bookId, type) =>
        get().cards.filter((c) => c.bookId === bookId && c.cardType === type),

      addMindMap: (input) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const mm: MindMap = { ...input, id, createdAt: now, updatedAt: now };
        set((s) => ({ mindMaps: [mm, ...s.mindMaps] }));
        return id;
      },

      updateMindMap: (id, data) =>
        set((s) => ({
          mindMaps: s.mindMaps.map((m) =>
            m.id === id ? { ...m, data, updatedAt: new Date().toISOString() } : m,
          ),
        })),

      removeMindMap: (id) => set((s) => ({ mindMaps: s.mindMaps.filter((m) => m.id !== id) })),

      getBookMindMaps: (bookId) => get().mindMaps.filter((m) => m.bookId === bookId),
      getChapterMindMap: (bookId, chapterId) =>
        get().mindMaps.find((m) => m.bookId === bookId && m.chapterId === chapterId),
    }),
    { name: "aireadbook-knowledge" },
  ),
);
