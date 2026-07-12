import { create } from "zustand";
import * as api from "@/lib/api-client-v2";

interface StoredBook {
  id: string; title: string; author: string | null; coverUrl: string | null;
  language: string; totalChapters: number;
  chapters: { id: string; index: number; title: string; plainText: string; wordCount: number }[];
  metadata: Record<string, unknown>; uploadedAt: string;
}

interface LibraryState {
  books: StoredBook[];
  ready: boolean;
  load: (userId: number) => Promise<void>;
  addBook: (book: StoredBook) => Promise<string>;
  removeBook: (id: string) => Promise<void>;
  updateCover: (id: string, coverUrl: string) => void;
  getBook: (id: string) => StoredBook | undefined;
}

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  books: [],
  ready: false,

  load: async (userId) => {
    api.setUserId(userId);
    try {
      const books = await api.apiGetBooks();
      if (books.length === 0) {
        // Auto-migrate from localStorage if MySQL is empty
        const old = localStorage.getItem("aireadbook-library");
        if (old) {
          try {
            const parsed = JSON.parse(old);
            const oldBooks = parsed?.state?.books || [];
            if (oldBooks.length > 0) {
              for (const b of oldBooks) {
                await api.apiCreateBook(b);
              }
              const reloaded = await api.apiGetBooks();
              set({ books: reloaded, ready: true });
              return;
            }
          } catch {}
        }
      }
      set({ books, ready: true });
    } catch { set({ ready: true }); }
  },

  addBook: async (book) => {
    try {
      const result = await api.apiCreateBook(book);
      const newBook = { ...book, id: result.id, uploadedAt: new Date().toISOString() };
      set(s => ({ books: [newBook, ...s.books] }));
      return result.id;
    } catch {
      // Fallback: local-only
      const id = crypto.randomUUID?.() || Math.random().toString(36);
      set(s => ({ books: [{ ...book, id }, ...s.books] }));
      return id;
    }
  },

  removeBook: async (id) => {
    set(s => ({ books: s.books.filter(b => b.id !== id) }));
    try { await api.apiDeleteBook(id); } catch {}
  },

  updateCover: (id, coverUrl) =>
    set(s => ({ books: s.books.map(b => b.id === id ? { ...b, coverUrl } : b) })),

  getBook: (id) => get().books.find(b => b.id === id),
}));
