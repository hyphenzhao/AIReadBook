import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Annotation {
  id: string;
  bookId: string;
  chapterId: string | null;
  selectedText: string;
  note: string;
  color: "yellow" | "green" | "blue" | "pink" | "orange";
  tags: string[];
  aiCategory: string | null;
  aiSummary: string | null;
  createdAt: string;
}

interface AnnotationState {
  annotations: Annotation[];

  // CRUD
  addAnnotation: (a: Omit<Annotation, "id" | "createdAt" | "aiCategory" | "aiSummary">) => string;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;

  // Queries
  getBookAnnotations: (bookId: string) => Annotation[];
  getChapterAnnotations: (bookId: string, chapterId: string) => Annotation[];
  getByColor: (bookId: string, color: string) => Annotation[];

  // AI structuring
  setAiStructure: (id: string, category: string, summary: string) => void;
}

export const useAnnotationStore = create<AnnotationState>()(
  persist(
    (set, get) => ({
      annotations: [],

      addAnnotation: (input) => {
        const id = crypto.randomUUID();
        const annotation: Annotation = {
          ...input,
          id,
          aiCategory: null,
          aiSummary: null,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ annotations: [annotation, ...s.annotations] }));
        return id;
      },

      updateAnnotation: (id, updates) =>
        set((s) => ({
          annotations: s.annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      removeAnnotation: (id) =>
        set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),

      getBookAnnotations: (bookId) =>
        get().annotations.filter((a) => a.bookId === bookId),

      getChapterAnnotations: (bookId, chapterId) =>
        get().annotations.filter((a) => a.bookId === bookId && a.chapterId === chapterId),

      getByColor: (bookId, color) =>
        get().annotations.filter((a) => a.bookId === bookId && a.color === color),

      setAiStructure: (id, category, summary) =>
        set((s) => ({
          annotations: s.annotations.map((a) =>
            a.id === id ? { ...a, aiCategory: category, aiSummary: summary } : a,
          ),
        })),
    }),
    { name: "aireadbook-annotations" },
  ),
);
