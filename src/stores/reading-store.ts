import { create } from "zustand";
import type { Book, Chapter, ChatMode } from "@/types";
import { useUIStore } from "@/stores/ui-store";

/** A passage an AI citation points at; the reader scrolls to it and flashes it. */
export interface PassageJump { chapterId: string; charStart: number; charEnd: number; nonce: number }

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

  // Text the reader selected and wants to ask about. The AI panel picks it up
  // as a quoted attachment on the next question.
  pendingAskAI: string | null;
  passageJump: PassageJump | null;

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
  jumpToPassage: (jump: Omit<PassageJump, "nonce">) => void;
  clearPassageJump: () => void;
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
  passageJump: null as PassageJump | null,
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
  triggerAskAI: (text) => {
    // The panel only mounts while open, so open it or nothing would happen.
    useUIStore.setState({ rightPanelOpen: true });
    set({ pendingAskAI: text, aiMode: "companion" });
  },
  clearAskAI: () => set({ pendingAskAI: null }),
  jumpToPassage: (jump) => set({ passageJump: { ...jump, nonce: Date.now() } }),
  clearPassageJump: () => set({ passageJump: null }),
  reset: () => set(initialState),
}));
