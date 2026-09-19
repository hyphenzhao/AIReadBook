"use client";

import { Brain, ChevronLeft, ChevronRight, Home, PanelBottom, PanelLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useUIStore } from "@/stores/ui-store";
import { useReadingStore } from "@/stores/reading-store";
import { UserMenu } from "@/components/shared/UserMenu";
import { ReadingSettings } from "@/components/reader/ReadingSettings";

// 40px targets: comfortable for a finger, still compact in a desktop toolbar.
const iconButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30";

export function ReadingHeader() {
  const { leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel, aiPanelPosition, toggleAiPanelPosition } = useUIStore();
  const { currentBook, currentChapter, chapters, setChapter } = useReadingStore();

  const chapterIndex = currentChapter?.index ?? 0;
  const hasPrev = chapterIndex > 0;
  const hasNext = chapterIndex < chapters.length - 1;

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--background)] px-1 sm:px-2">
      {/* On a phone the tab bar already has 目录 / 书库 / 知识 / AI. */}
      <button onClick={toggleLeftPanel} className={`${iconButton} hidden md:flex`} title={leftPanelOpen ? "关闭目录" : "打开目录"} aria-pressed={leftPanelOpen}>
        <PanelLeft className={`h-4 w-4 ${leftPanelOpen ? "text-[var(--primary)]" : ""}`} />
      </button>
      <Link href="/library" className={`${iconButton} hidden md:flex`} title="返回书库"><Home className="h-4 w-4" /></Link>
      {currentBook && (
        <Link href={`/read/${currentBook.id}/knowledge`} className={`${iconButton} hidden md:flex`} title="知识卡片"><Brain className="h-4 w-4" /></Link>
      )}

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2 text-sm">
        <span className="hidden truncate font-medium sm:inline">{currentBook?.title ?? "加载中…"}</span>
        {currentChapter?.title && (
          <>
            <span className="hidden text-[var(--muted-foreground)] sm:inline">/</span>
            <span className="truncate text-[var(--muted-foreground)]">{currentChapter.title}</span>
          </>
        )}
      </div>

      <button disabled={!hasPrev} onClick={() => hasPrev && setChapter(chapters[chapterIndex - 1])} className={iconButton} title="上一章" aria-label="上一章">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-[var(--muted-foreground)]">{chapterIndex + 1}/{chapters.length}</span>
      <button disabled={!hasNext} onClick={() => hasNext && setChapter(chapters[chapterIndex + 1])} className={iconButton} title="下一章" aria-label="下一章">
        <ChevronRight className="h-4 w-4" />
      </button>

      <ReadingSettings />

      <button onClick={toggleAiPanelPosition} className={`${iconButton} hidden md:flex`} title={aiPanelPosition === "right" ? "AI 面板移到底部" : "AI 面板移到右侧"}>
        <PanelBottom className={`h-4 w-4 ${aiPanelPosition === "bottom" ? "text-[var(--primary)]" : ""}`} />
      </button>
      <button onClick={toggleRightPanel} className={`${iconButton} hidden md:flex`} title={rightPanelOpen ? "关闭 AI 面板" : "打开 AI 面板"} aria-pressed={rightPanelOpen}>
        <Sparkles className={`h-4 w-4 ${rightPanelOpen ? "text-[var(--primary)]" : ""}`} />
      </button>
      <div className="hidden md:block"><UserMenu /></div>
    </header>
  );
}
