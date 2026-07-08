import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StoredBook {
  id: string;
  title: string;
  author: string | null;
  language: string;
  totalChapters: number;
  chapters: StoredChapter[];
  metadata: Record<string, unknown>;
  uploadedAt: string;
}

interface StoredChapter {
  id: string;
  index: number;
  title: string;
  plainText: string;
  wordCount: number;
}

interface LibraryState {
  books: StoredBook[];
  addBook: (book: StoredBook) => void;
  removeBook: (id: string) => void;
  getBook: (id: string) => StoredBook | undefined;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      addBook: (book) =>
        set((state) => ({
          books: [
            { ...book, uploadedAt: new Date().toISOString() },
            ...state.books.filter((b) => b.id !== book.id),
          ],
        })),
      removeBook: (id) =>
        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
        })),
      getBook: (id) => get().books.find((b) => b.id === id),
    }),
    { name: "aireadbook-library" },
  ),
);
