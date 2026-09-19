"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReadingLayout } from "@/components/reader/ReadingLayout";
import { ReadingHeader } from "@/components/reader/ReadingHeader";
import { LeftPanel } from "@/components/reader/panels/LeftPanel";
import { AIPanel } from "@/components/reader/ai/AIPanel";
import { SelectionToolbar } from "@/components/reader/SelectionToolbar";
import { MobileNav, MOBILE_NAV_HEIGHT } from "@/components/reader/MobileNav";
import { ChapterEndCard } from "@/components/reader/ChapterEndCard";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { errorMessage } from "@/lib/api-client-v2";
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
    setBook, setChapters, setChapter, currentChapter, chapters, currentBook, passageJump, clearPassageJump, jumpToPassage,
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // The library list carries only the table of contents; fetch this book's text.
  const textLoaded = useLibraryStore((s) => {
    const book = s.books.find((b) => b.id === bookId);
    return !!book && book.chapters.every((chapter) => chapter.plainText !== undefined);
  });
  const [textError, setTextError] = useState("");
  useEffect(() => {
    if (!libraryReady || textLoaded) return;
    setTextError("");
    useLibraryStore.getState().loadBookText(bookId).catch((error) => setTextError(errorMessage(error, "无法加载书籍正文")));
  }, [libraryReady, textLoaded, bookId]);

  // `selectionchange` rather than mouseup: it is the one event that also fires
  // for touch selection, where the handles are dragged after the long-press.
  // Debounced so the toolbar appears when the reader stops adjusting.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      const inside = sel && sel.rangeCount > 0 && textRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer);
      if (!sel || sel.isCollapsed || text.length < 2 || !inside) {
        // Typing a note moves focus into the toolbar and collapses the selection;
        // that must not close the toolbar it is being typed in.
        if (!document.activeElement?.closest("[data-selection-toolbar]")) setSelection(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelection({ text, x: rect.left + rect.width / 2, y: rect.top });
    };
    const onChange = () => { clearTimeout(timer); timer = setTimeout(read, 250); };
    document.addEventListener("selectionchange", onChange);
    return () => { clearTimeout(timer); document.removeEventListener("selectionchange", onChange); };
  }, []);

  useEffect(() => {
    if (!libraryReady) return;
    const book = getBook(bookId);
    if (!book) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    // The library list has no chapter text; wait for this book's to arrive.
    if (!textLoaded) return;

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
      plainText: ch.plainText ?? null,
      wordCount: ch.wordCount,
      summaryShort: null,
      summaryMedium: null,
      summaryDetailed: null,
      summaryGeneratedAt: null,
    }));

    setChapters(mappedChapters);
    // Open straight at the remembered chapter so the first chapter never
    // flashes by; useReadingProgress then restores the scroll position.
    let startIndex = 0;
    try {
      const saved = JSON.parse(localStorage.getItem(`aireadbook-progress-${bookId}`) ?? "null");
      if (Number.isInteger(saved?.chapterIndex) && saved.chapterIndex < mappedChapters.length) startIndex = saved.chapterIndex;
    } catch {}
    if (mappedChapters.length > 0) setChapter(mappedChapters[startIndex]);
  }, [bookId, getBook, libraryReady, textLoaded, setBook, setChapters, setChapter]);

  const hasDeepLink = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("chapter");
  const goToChapter = useCallback((index: number) => {
    const target = useReadingStore.getState().chapters[index];
    if (target) setChapter(target);
  }, [setChapter]);
  useReadingProgress({
    bookId,
    // A citation deep link decides where to go; do not pull the reader elsewhere.
    enabled: currentBook?.id === bookId && !hasDeepLink && !passageJump,
    chapterCount: chapters.length,
    chapterIndex: currentChapter?.index ?? null,
    scrollRef,
    contentKey: content,
    goToChapter,
  });

  // A new chapter starts at its top (progress restore and citation jumps run after this).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setSelection(null);
  }, [currentChapter?.id]);

  // Horizontal swipe turns the chapter, unless the reader is selecting text.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    swipe.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || !currentChapter || !window.getSelection()?.isCollapsed) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 2.5) return;
    goToChapter(currentChapter.index + (dx < 0 ? 1 : -1));
  };

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
    // On a phone a full-height AI sheet covers the text it just pointed at;
    // half height leaves both the answer and the passage in view.
    useUIStore.setState({ aiSheetSnap: "half" });
    requestAnimationFrame(() => {
      // Scroll the reading column only; scrollIntoView would move the whole layout with it.
      const column = scrollRef.current;
      const cited = column?.querySelector<HTMLElement>('[data-cited="true"]');
      if (!column || !cited) return;
      const offset = cited.getBoundingClientRect().top - column.getBoundingClientRect().top;
      const visible = column.clientHeight - parseFloat(getComputedStyle(column).paddingBottom || "0");
      column.scrollTo({ top: column.scrollTop + offset - Math.max(0, (visible - cited.offsetHeight) / 2), behavior: "smooth" });
    });
  }, [passageJump, chapters, currentChapter, content, setChapter, clearPassageJump]);

  // Deep link from a knowledge card or a graph node: /read/12?chapter=34&from=100&to=260.
  useEffect(() => {
    if (currentBook?.id !== bookId || chapters.length === 0) return;
    const query = new URLSearchParams(window.location.search);
    const chapterId = query.get("chapter");
    if (!chapterId) return;
    jumpToPassage({ chapterId, charStart: Number(query.get("from")) || 0, charEnd: Number(query.get("to")) || 0 });
    // Drop the parameters so a reload does not jump again.
    router.replace(`/read/${bookId}`, { scroll: false });
  }, [currentBook?.id, bookId, chapters.length, jumpToPassage, router]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!libraryReady || (!notFound && !textLoaded)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--background)] px-6 text-center text-sm text-[var(--muted-foreground)]">
        {textError ? (
          <>
            <p role="alert" className="text-red-500">{textError}</p>
            <button onClick={() => window.location.reload()} className="min-h-10 rounded-md border border-[var(--border)] px-4 hover:bg-[var(--accent)]">重试</button>
          </>
        ) : (
          "正在加载书籍…"
        )}
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
            <div
              ref={scrollRef}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              // The inset keeps the last lines clear of the phone tab bar and a half-open AI sheet.
              className="flex-1 overflow-y-auto overscroll-contain pb-[var(--reader-bottom-inset,0px)]"
            >
              <div className="relative mx-auto max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
                {selection && (
                  <SelectionToolbar
                    selectedText={selection.text}
                    position={selection}
                    mobileBottom="var(--reader-bottom-inset, 0px)"
                    onClose={() => setSelection(null)}
                  />
                )}
                <div
                  ref={textRef}
                  className="prose max-w-none"
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
                            className={`-mx-2 rounded px-2 leading-relaxed transition-colors duration-700 ${cited ? "bg-[var(--primary-soft)]" : ""}`}
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

                {currentChapter && content && <ChapterEndCard bookId={bookId} chapterId={currentChapter.id} />}

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
        mobileBottomOffset={MOBILE_NAV_HEIGHT}
      />
      <MobileNav />
    </>
  );
}
