import { create } from "zustand";
import * as api from "@/lib/api-client-v2";
import { uuid } from "@/lib/utils";

export interface Annotation {
  id: string; bookId: string; chapterId: string | null; selectedText: string;
  note: string; color: string; tags: string[];
  aiCategory: string | null; aiSummary: string | null; createdAt: string;
}

interface AnnotationState {
  annotations: Annotation[];
  ready: boolean;
  load: (userId: number) => Promise<void>;
  addAnnotation: (input: Omit<Annotation, "id" | "createdAt" | "aiCategory" | "aiSummary">) => string;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  getBookAnnotations: (bookId: string) => Annotation[];
  setAiStructure: (id: string, category: string, summary: string) => void;
}

export const useAnnotationStore = create<AnnotationState>()((set, get) => ({
  annotations: [],
  ready: false,

  load: async () => {
    try {
      const annotations = await api.apiGetAnnotations();
      if (annotations.length === 0) {
        const old = localStorage.getItem("aireadbook-annotations");
        if (old) {
          try {
            const parsed = JSON.parse(old);
            const oldList = parsed?.state?.annotations || [];
            for (const a of oldList) {
              await api.apiCreateAnnotation({ bookId: a.bookId, chapterId: a.chapterId, selectedText: a.selectedText, note: a.note, color: a.color });
            }
            const reloaded = await api.apiGetAnnotations();
            set({ annotations: reloaded, ready: true });
            return;
          } catch {}
        }
      }
      set({ annotations, ready: true });
    } catch { set({ ready: true }); }
  },

  addAnnotation: (input) => {
    const id = uuid();
    const annotation: Annotation = { ...input, id, aiCategory: null, aiSummary: null, createdAt: new Date().toISOString() };
    set(s => ({ annotations: [annotation, ...s.annotations] }));
    // Async sync
    api.apiCreateAnnotation({ bookId: input.bookId, chapterId: input.chapterId, selectedText: input.selectedText, note: input.note, color: input.color }).catch(() => {});
    return id;
  },

  updateAnnotation: (id, updates) => {
    set(s => ({ annotations: s.annotations.map(a => a.id === id ? { ...a, ...updates } : a) }));
    api.apiUpdateAnnotation(id, updates).catch(() => {});
  },

  removeAnnotation: (id) =>
    set(s => ({ annotations: s.annotations.filter(a => a.id !== id) })),

  getBookAnnotations: (bookId) => get().annotations.filter(a => a.bookId === bookId),

  setAiStructure: (id, category, summary) =>
    set(s => ({ annotations: s.annotations.map(a => a.id === id ? { ...a, aiCategory: category, aiSummary: summary } : a) })),
}));
