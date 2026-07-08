"use client";

import { PanelLeft, PanelRight, ChevronLeft, ChevronRight, BookOpen, Home, Brain, Settings } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useReadingStore } from "@/stores/reading-store";
import { UserMenu } from "@/components/shared/UserMenu";
import Link from "next/link";

export function ReadingHeader() {
  const { leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel } = useUIStore();
  const { currentBook, currentChapter, chapters, setChapter } = useReadingStore();

  const chapterIndex = currentChapter?.index ?? 0;
  const hasPrev = chapterIndex > 0;
  const hasNext = chapterIndex < chapters.length - 1;

  return (
    <header className="flex h-10 items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-3 gap-2">
      {/* Left: panel toggle + nav */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleLeftPanel}
          className="rounded p-1 hover:bg-[var(--accent)] shrink-0"
          title={leftPanelOpen ? "关闭左侧栏" : "打开左侧栏"}
        >
          <PanelLeft className={`h-4 w-4 ${leftPanelOpen ? "text-[var(--primary)]" : ""}`} />
        </button>
        <Link href="/library" className="rounded p-1 hover:bg-[var(--accent)] shrink-0 hidden sm:block" title="返回书库">
          <Home className="h-4 w-4" />
        </Link>
        {currentBook && (
          <Link
            href={`/read/${currentBook.id}/knowledge`}
            className="rounded p-1 hover:bg-[var(--accent)] shrink-0 hidden sm:block"
            title="知识管理"
          >
            <Brain className="h-4 w-4" />
          </Link>
        )}
      </div>

      {/* Center: book + chapter */}
      <div className="flex min-w-0 items-center gap-2 text-sm flex-1 justify-center">
        <span className="truncate font-medium hidden sm:inline">{currentBook?.title ?? "加载中..."}</span>
        {currentChapter?.title && (
          <>
            <span className="text-[var(--muted-foreground)] hidden sm:inline">/</span>
            <span className="truncate text-[var(--muted-foreground)]">{currentChapter.title}</span>
          </>
        )}
      </div>

      {/* Right: chapter nav + panel + user */}
      <div className="flex items-center gap-1">
        <button
          disabled={!hasPrev}
          onClick={() => hasPrev && setChapter(chapters[chapterIndex - 1])}
          className="rounded p-1 hover:bg-[var(--accent)] disabled:opacity-30"
          title="上一章"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-[var(--muted-foreground)] tabular-nums min-w-[3rem] text-center">
          {chapterIndex + 1}/{chapters.length}
        </span>
        <button
          disabled={!hasNext}
          onClick={() => hasNext && setChapter(chapters[chapterIndex + 1])}
          className="rounded p-1 hover:bg-[var(--accent)] disabled:opacity-30"
          title="下一章"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={toggleRightPanel}
          className="ml-1 rounded p-1 hover:bg-[var(--accent)]"
          title={rightPanelOpen ? "关闭 AI 面板" : "打开 AI 面板"}
        >
          <PanelRight className={`h-4 w-4 ${rightPanelOpen ? "text-[var(--primary)]" : ""}`} />
        </button>
        <div className="ml-1">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
