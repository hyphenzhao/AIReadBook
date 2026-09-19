"use client";

import { Brain, Library, List, Sparkles } from "lucide-react";
import Link from "next/link";
import { useUIStore } from "@/stores/ui-store";
import { useReadingStore } from "@/stores/reading-store";

/** Space the tab bar takes at the bottom of a phone screen, home indicator included. */
export const MOBILE_NAV_HEIGHT = "calc(3.5rem + env(safe-area-inset-bottom, 0px))";

const item = "flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]";

export function MobileNav() {
  const bookId = useReadingStore((s) => s.currentBook?.id);
  const { leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel } = useUIStore();
  const tone = (active: boolean) => (active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]");

  return (
    <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-[45] flex border-t border-[var(--border)] bg-[var(--background)] md:hidden">
      <Link href="/library" className={`${item} ${tone(false)}`}>
        <Library className="h-5 w-5" />书库
      </Link>
      <button onClick={toggleLeftPanel} aria-pressed={leftPanelOpen} className={`${item} ${tone(leftPanelOpen)}`}>
        <List className="h-5 w-5" />目录
      </button>
      {bookId && (
        <Link href={`/read/${bookId}/knowledge`} className={`${item} ${tone(false)}`}>
          <Brain className="h-5 w-5" />知识
        </Link>
      )}
      <button onClick={toggleRightPanel} aria-pressed={rightPanelOpen} className={`${item} ${tone(rightPanelOpen)}`}>
        <Sparkles className="h-5 w-5" />问 AI
      </button>
    </nav>
  );
}
