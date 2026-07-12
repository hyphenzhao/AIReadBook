import { create } from "zustand";
import type { Book, Chapter, ChatMode } from "@/types";

interface ReadingState {
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];
  cfi: string;
  percentage: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  viewMode: "scroll" | "paginated";
  aiMode: ChatMode;

  // "Ask AI" event bus — replaces broken CustomEvent
  pendingAskAI: string | null;

  setBook: (book: Book) => void;
  setChapters: (chapters: Chapter[]) => void;
  setChapter: (chapter: Chapter) => void;
  setLocation: (cfi: string, percentage: number) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setFontFamily: (family: string) => void;
  setViewMode: (mode: "scroll" | "paginated") => void;
  setAiMode: (mode: ChatMode) => void;
  triggerAskAI: (selectedText: string) => void;
  clearAskAI: () => void;
  reset: () => void;
}

const initialState = {
  currentBook: null,
  currentChapter: null,
  chapters: [],
  cfi: "",
  percentage: 0,
  fontSize: 16,
  lineHeight: 1.6,
  fontFamily: "system",
  viewMode: "paginated" as const,
  aiMode: "companion" as ChatMode,
  pendingAskAI: null as string | null,
};

export const useReadingStore = create<ReadingState>()((set) => ({
  ...initialState,

  setBook: (book) => set({ currentBook: book }),
  setChapters: (chapters) => set({ chapters }),
  setChapter: (chapter) => set({ currentChapter: chapter }),
  setLocation: (cfi, percentage) => set({ cfi, percentage }),
  setFontSize: (fontSize) => set({ fontSize }),
  setLineHeight: (lineHeight) => set({ lineHeight }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setViewMode: (viewMode) => set({ viewMode }),
  setAiMode: (aiMode) => set({ aiMode }),
  triggerAskAI: (text) => set({ pendingAskAI: text, aiMode: "companion" }),
  clearAskAI: () => set({ pendingAskAI: null }),
  reset: () => set(initialState),
}));
