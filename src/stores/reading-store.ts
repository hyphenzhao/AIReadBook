import { create } from "zustand";
import type { Book, Chapter, ChatMode } from "@/types";

interface ReadingState {
  // Current book context
  currentBook: Book | null;
  currentChapter: Chapter | null;
  chapters: Chapter[];

  // Reading position
  cfi: string;
  percentage: number;

  // View settings
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  viewMode: "scroll" | "paginated";

  // AI mode
  aiMode: ChatMode;

  // Actions
  setBook: (book: Book) => void;
  setChapters: (chapters: Chapter[]) => void;
  setChapter: (chapter: Chapter) => void;
  setLocation: (cfi: string, percentage: number) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setFontFamily: (family: string) => void;
  setViewMode: (mode: "scroll" | "paginated") => void;
  setAiMode: (mode: ChatMode) => void;
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
  reset: () => set(initialState),
}));
