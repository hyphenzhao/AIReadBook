"use client";

import { BookOpen, MessageCircle, Brain, Library } from "lucide-react";
import Link from "next/link";
import { useUIStore } from "@/stores/ui-store";
import { useReadingStore } from "@/stores/reading-store";

export function MobileNav() {
  const bookId = useReadingStore((s) => s.currentBook?.id);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-[var(--border)] bg-[var(--background)] safe-area-bottom md:hidden">
      <Link
        href="/library"
        className="flex flex-col items-center gap-0.5 text-xs text-[var(--muted-foreground)]"
      >
        <Library className="h-5 w-5" />
        <span>书库</span>
      </Link>

      <button
        onClick={() => useUIStore.getState().toggleLeftPanel()}
        className="flex flex-col items-center gap-0.5 text-xs text-[var(--muted-foreground)]"
      >
        <BookOpen className="h-5 w-5" />
        <span>目录</span>
      </button>

      {bookId && (
        <Link
          href={`/read/${bookId}/knowledge`}
          className="flex flex-col items-center gap-0.5 text-xs text-[var(--muted-foreground)]"
        >
          <Brain className="h-5 w-5" />
          <span>知识</span>
        </Link>
      )}

      <button
        onClick={() => useUIStore.getState().toggleRightPanel()}
        className="flex flex-col items-center gap-0.5 text-xs text-[var(--muted-foreground)]"
      >
        <MessageCircle className="h-5 w-5" />
        <span>AI</span>
      </button>
    </nav>
  );
}
