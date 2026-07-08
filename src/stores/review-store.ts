import { create } from "zustand";
import { persist } from "zustand/middleware";
import { sm2 } from "@/lib/spaced-repetition/sm2";

export interface ReviewCard {
  id: string;
  userId: string;
  bookId: string;
  bookTitle: string;
  sourceType: "annotation" | "knowledge_card" | "manual";
  sourceId: string | null;
  front: string;
  back: string;
  tags: string[];
  // SM-2 state
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReview: string | null;
  createdAt: string;
}

interface ReviewState {
  cards: ReviewCard[];

  // CRUD
  addCard: (card: Omit<ReviewCard, "id" | "easeFactor" | "interval" | "repetitions" | "nextReview" | "lastReview" | "createdAt">) => string;
  addCards: (cards: Omit<ReviewCard, "id" | "easeFactor" | "interval" | "repetitions" | "nextReview" | "lastReview" | "createdAt">[]) => void;
  removeCard: (id: string) => void;
  updateCard: (id: string, updates: Partial<ReviewCard>) => void;

  // Review
  gradeCard: (id: string, quality: number) => void;
  getDueCards: (bookId?: string) => ReviewCard[];
  getStats: () => { total: number; due: number; reviewedToday: number; avgEase: number };
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      cards: [],

      addCard: (input) => {
        const id = crypto.randomUUID();
        const card: ReviewCard = {
          ...input,
          id,
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReview: new Date().toISOString(),
          lastReview: null,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ cards: [card, ...s.cards] }));
        return id;
      },

      addCards: (inputs) => {
        const newCards: ReviewCard[] = inputs.map((input) => ({
          ...input,
          id: crypto.randomUUID(),
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReview: new Date().toISOString(),
          lastReview: null,
          createdAt: new Date().toISOString(),
        }));
        set((s) => ({ cards: [...newCards, ...s.cards] }));
      },

      removeCard: (id) => set((s) => ({ cards: s.cards.filter((c) => c.id !== id) })),
      updateCard: (id, updates) =>
        set((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      gradeCard: (id, quality) => {
        set((s) => {
          const card = s.cards.find((c) => c.id === id);
          if (!card) return s;

          const result = sm2(
            {
              easeFactor: card.easeFactor,
              interval: card.interval,
              repetitions: card.repetitions,
            },
            quality,
          );

          return {
            cards: s.cards.map((c) =>
              c.id === id
                ? {
                    ...c,
                    easeFactor: result.easeFactor,
                    interval: result.interval,
                    repetitions: result.repetitions,
                    nextReview: result.nextReview.toISOString(),
                    lastReview: new Date().toISOString(),
                  }
                : c,
            ),
          };
        });
      },

      getDueCards: (bookId) => {
        const now = new Date();
        let due = get().cards.filter((c) => new Date(c.nextReview) <= now);
        if (bookId) due = due.filter((c) => c.bookId === bookId);
        return due.sort(
          (a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime(),
        );
      },

      getStats: () => {
        const cards = get().cards;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const due = cards.filter((c) => new Date(c.nextReview) <= now);
        const reviewedToday = cards.filter(
          (c) => c.lastReview && new Date(c.lastReview) >= today,
        );
        const avgEase =
          cards.length > 0
            ? cards.reduce((sum, c) => sum + c.easeFactor, 0) / cards.length
            : 2.5;

        return {
          total: cards.length,
          due: due.length,
          reviewedToday: reviewedToday.length,
          avgEase: Math.round(avgEase * 100) / 100,
        };
      },
    }),
    { name: "aireadbook-review" },
  ),
);
