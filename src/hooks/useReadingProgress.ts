"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";

interface Locator { chapterIndex: number; ratio: number }
interface Stored extends Locator { savedAt: number }

const SAVE_DELAY_MS = 1500;
const key = (bookId: string) => `aireadbook-progress-${bookId}`;

function readLocal(bookId: string): Stored | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(bookId)) ?? "null");
    return value && Number.isInteger(value.chapterIndex) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Remembers where the reader is — chapter and scroll position — and brings
 * them back to it. localStorage makes the restore instant; the server copy
 * makes it follow the account across devices (whichever is newer wins).
 *
 * `enabled` is false until the book is loaded, and while something else (a
 * citation deep link) is deciding where to go.
 */
export function useReadingProgress(options: {
  bookId: string;
  enabled: boolean;
  chapterCount: number;
  chapterIndex: number | null;
  scrollRef: RefObject<HTMLElement | null>;
  /** Content of the visible chapter; scroll is restored once it has rendered. */
  contentKey: string;
  goToChapter: (index: number) => void;
}) {
  const { bookId, enabled, chapterCount, chapterIndex, scrollRef, contentKey, goToChapter } = options;
  const pendingRatio = useRef<number | null>(null);
  const restored = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Locator | null>(null);

  // 1. Restore, once per book.
  useEffect(() => { restored.current = false; }, [bookId]);
  useEffect(() => {
    if (!enabled || restored.current || chapterCount === 0) return;
    restored.current = true;
    let cancelled = false;

    const apply = (locator: Locator) => {
      if (locator.chapterIndex >= chapterCount) return;
      pendingRatio.current = locator.ratio;
      goToChapter(locator.chapterIndex);
    };
    const local = readLocal(bookId);
    if (local) apply(local);

    fetch(`/api/v2/books/${bookId}/progress`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.locator) return;
        const serverTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        // Only a clearly newer server copy (another device) overrides what is on screen.
        if (!local || serverTime > local.savedAt + 5000) apply(data.locator);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, bookId, chapterCount, goToChapter]);

  // 2. After the chapter's text is on screen, put the scroll position back.
  useEffect(() => {
    const ratio = pendingRatio.current;
    const element = scrollRef.current;
    if (ratio === null || !element || !contentKey) return;
    pendingRatio.current = null;
    requestAnimationFrame(() => {
      element.scrollTop = ratio * Math.max(0, element.scrollHeight - element.clientHeight);
    });
  }, [contentKey, scrollRef]);

  // 3. Save: at once locally, debounced to the server.
  const save = useCallback(() => {
    const element = scrollRef.current;
    if (!enabled || !restored.current || chapterIndex === null || !element) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    const locator = { chapterIndex, ratio: scrollable > 0 ? element.scrollTop / scrollable : 0 };
    latest.current = locator;
    try { localStorage.setItem(key(bookId), JSON.stringify({ ...locator, savedAt: Date.now() })); } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/v2/books/${bookId}/progress`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locator), keepalive: true,
      }).catch(() => {});
    }, SAVE_DELAY_MS);
  }, [enabled, bookId, chapterIndex, scrollRef]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.addEventListener("scroll", save, { passive: true });
    return () => element.removeEventListener("scroll", save);
  }, [save, scrollRef]);

  // A chapter change is progress too, even without scrolling.
  useEffect(() => {
    if (pendingRatio.current === null) save();
  }, [chapterIndex, save]);

  // 4. Leaving the page: the debounce may not get to fire, so send it now.
  useEffect(() => {
    const flush = () => {
      if (!latest.current) return;
      navigator.sendBeacon(
        `/api/v2/books/${bookId}/progress`,
        new Blob([JSON.stringify(latest.current)], { type: "application/json" }),
      );
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [bookId]);
}
