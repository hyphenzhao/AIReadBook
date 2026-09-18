"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReadingLayout } from "@/components/reader/ReadingLayout";
import { ReadingHeader } from "@/components/reader/ReadingHeader";
import { LeftPanel } from "@/components/reader/panels/LeftPanel";
import { AIPanel } from "@/components/reader/ai/AIPanel";
import { SelectionToolbar } from "@/components/reader/SelectionToolbar";
import { MobileNav } from "@/components/reader/MobileNav";
import { HighlightedText } from "@/components/reader/HighlightedText";
import { useReadingStore } from "@/stores/reading-store";
import { useLibraryStore } from "@/stores/library-store";
import { useAnnotationStore } from "@/stores/annotation-store";
import { useUserStore } from "@/stores/user-store";
import { useChatStore } from "@/stores/chat-store";
import { useUIStore } from "@/stores/ui-store";
import type { Chapter } from "@/types";
import { BookOpen } from "lucide-react";

export default function ReadPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.bookId as string;
  const getBook = useLibraryStore((s) => s.getBook);
  const libraryReady = useLibraryStore((s) => s.ready);
  const preferences = useUserStore((s) => s.preferences);
  const {
    setBook, setChapters, setChapter, currentChapter, chapters, currentBook, passageJump, clearPassageJump,
  } = useReadingStore();
  const { getBookAnnotations } = useAnnotationStore();
  const [content, setContent] = useState("");
  const bookAnnotations = currentBook ? getBookAnnotations(currentBook.id) : [];
  const [notFound, setNotFound] = useState(false);
  const [selection, setSelection] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 2) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  }, []);

  useEffect(() => {
    if (!libraryReady) return;
    const book = getBook(bookId);
    if (!book) {
      setNotFound(true);
      return;
    }
    setNotFound(false);

    // Convert stored book to reading store format
    setBook({
      id: book.id,
      userId: "",
      title: book.title,
      author: book.author,
      coverUrl: null,
      language: book.language,
      source: "upload",
      sourceId: null,
      filePath: null,
      fileSize: null,
      epubMetadata: book.metadata,
      totalChapters: book.totalChapters,
      ingestionStatus: "complete",
      createdAt: book.uploadedAt,
      updatedAt: book.uploadedAt,
    });

    const mappedChapters: Chapter[] = book.chapters.map((ch) => ({
      id: ch.id,
      bookId: book.id,
      index: ch.index,
      title: ch.title,
      rawText: null,
      plainText: ch.plainText,
      wordCount: ch.wordCount,
      summaryShort: null,
      summaryMedium: null,
      summaryDetailed: null,
      summaryGeneratedAt: null,
    }));

    setChapters(mappedChapters);
    if (mappedChapters.length > 0) {
      setChapter(mappedChapters[0]);
    }
  }, [bookId, getBook, libraryReady, setBook, setChapters, setChapter]);

  useEffect(() => {
    if (libraryReady && getBook(bookId)) {
      useChatStore.getState().load(bookId);
    }
  }, [bookId, getBook, libraryReady]);

  useEffect(() => {
    setContent(currentChapter?.plainText ?? "");
  }, [currentChapter]);

  // Paragraphs with their character offsets in the chapter, so a cited
  // passage (a character range) can be mapped onto what is rendered.
  const paragraphs = useMemo(() => {
    let offset = 0;
    return content.split("\n\n").map((text) => {
      const start = offset;
      offset += text.length + 2;
      return { text, start, end: start + text.length };
    });
  }, [content]);

  // An AI citation was clicked: open its chapter, scroll to the passage and
  // flash it. Re-runs as the chapter and then its content fall into place.
  const [flash, setFlash] = useState<{ start: number; end: number } | null>(null);
  useEffect(() => {
    if (!passageJump) return;
    const target = chapters.find((chapter) => chapter.id === passageJump.chapterId);
    if (!target) { clearPassageJump(); return; }
    if (currentChapter?.id !== target.id) { setChapter(target); return; }
    if (content !== (target.plainText ?? "")) return;

    setFlash({ start: passageJump.charStart, end: passageJump.charEnd });
    clearPassageJump();
    // On a phone the AI drawer covers the text it just pointed at.
    if (window.matchMedia("(max-width: 767px)").matches) useUIStore.setState({ rightPanelOpen: false });
    requestAnimationFrame(() => {
      document.querySelector('[data-cited="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [passageJump, chapters, currentChapter, content, setChapter, clearPassageJump]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!libraryReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
        正在加载书籍...
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
          <h2 className="text-lg font-medium">未找到书籍</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            该书可能已被删除或 ID 不正确
          </p>
          <button
            onClick={() => router.push("/library")}
            className="mt-4 rounded-md bg-[var(--primary)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            返回书库
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ReadingLayout
        leftPanel={<LeftPanel />}
        centerPanel={
          <>
            <ReadingHeader />
            <div className="flex-1 overflow-y-auto" onMouseUp={handleTextSelection}>
              <div className="relative mx-auto max-w-2xl px-8 py-8">
                {/* Selection toolbar */}
                {selection && (
                  <SelectionToolbar
                    selectedText={selection.text}
                    position={selection}
                    onClose={() => setSelection(null)}
                  />
                )}
                <div
                  className="prose prose-slate max-w-none dark:prose-invert"
                  style={{
                    fontSize: `${preferences.fontSize}px`,
                    lineHeight: preferences.lineHeight,
                    fontFamily: preferences.fontFamily === "system" ? undefined : preferences.fontFamily,
                  }}
                >
                  {currentChapter?.title && (
                    <h2 className="mb-6 text-center text-xl font-bold">
                      {currentChapter.title}
                    </h2>
                  )}
                  {content ? (
                    <div className="space-y-4">
                      {paragraphs.map((para, i) => {
                        if (!para.text.trim()) return null;
                        const cited = !!flash && para.start < flash.end && para.end > flash.start;
                        return (
                          <p
                            key={i}
                            data-cited={cited || undefined}
                            className={`-mx-2 rounded px-2 leading-relaxed transition-colors duration-700 ${cited ? "bg-[var(--primary)]/15" : ""}`}
                          >
                            <HighlightedText text={para.text} annotations={bookAnnotations} />
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-24 text-center text-[var(--muted-foreground)]">
                      选择左侧目录中的章节开始阅读
                    </div>
                  )}
                </div>

                {/* Chapter navigation */}
                {currentChapter && chapters.length > 1 && (
                  <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
                    <button
                      disabled={currentChapter.index === 0}
                      onClick={() => {
                        if (currentChapter.index > 0) {
                          setChapter(chapters[currentChapter.index - 1]);
                        }
                      }}
                      className="rounded px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30"
                    >
                      ← 上一章
                    </button>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {currentChapter.index + 1} / {chapters.length}
                    </span>
                    <button
                      disabled={currentChapter.index >= chapters.length - 1}
                      onClick={() => {
                        if (currentChapter.index < chapters.length - 1) {
                          setChapter(chapters[currentChapter.index + 1]);
                        }
                      }}
                      className="rounded px-3 py-1.5 text-sm hover:bg-[var(--accent)] disabled:opacity-30"
                    >
                      下一章 →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        }
        rightPanel={<AIPanel />}
      />
      <MobileNav />
    </>
  );
}
