"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Highlighter, Info, Library, PanelBottom, PanelLeft, Sparkles, X } from "lucide-react";
import { ReadingLayout } from "@/components/reader/ReadingLayout";
import { AssistantPanel, type AssistantContext } from "@/components/ai/AssistantPanel";
import { PaperSidePanel } from "@/components/papers/PaperSidePanel";
import type { PdfHighlight, PdfLocator, PdfSelection, PdfViewerHandle } from "@/components/papers/PdfViewer";
import { useUIStore } from "@/stores/ui-store";
import { useChatStore } from "@/stores/chat-store";
import { useIsMobile } from "@/hooks/useIsMobile";
import { errorMessage, type SourceRef } from "@/lib/api-client-v2";
import {
  apiAddPaperAnnotation, apiDeletePaperAnnotation, apiGetPaper, apiGetPaperProgress, apiListPaperAnnotations,
  paperFileUrl, STAGE_LABELS, type PaperAnnotationView, type PaperView,
} from "@/lib/api-papers";
import type { ChatMode } from "@/types";

// pdf.js needs the DOM and a worker; it never renders on the server.
const PdfViewer = dynamic(() => import("@/components/papers/PdfViewer").then((m) => m.PdfViewer), { ssr: false });

const NAV_HEIGHT = "calc(3.5rem + env(safe-area-inset-bottom, 0px))";
const FLASH_KEY = "aireadbook-paper-flash";
const progressKey = (id: number) => `aireadbook-paper-progress-${id}`;
const COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;
const SWATCH: Record<string, string> = { yellow: "bg-yellow-300", green: "bg-green-300", blue: "bg-blue-300", pink: "bg-pink-300", orange: "bg-orange-300" };

export default function PaperReaderPage() {
  const paperId = Number(useParams().id);
  const router = useRouter();
  const isMobile = useIsMobile();
  const { leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel, aiPanelPosition, toggleAiPanelPosition } = useUIStore();

  const [paper, setPaper] = useState<PaperView | null>(null);
  const [outline, setOutline] = useState<{ title: string; page: number }[]>([]);
  const [annotations, setAnnotations] = useState<PaperAnnotationView[]>([]);
  // undefined = not looked up yet; the viewer waits for it so it can open in place.
  const [initial, setInitial] = useState<PdfLocator | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [pickingColor, setPickingColor] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("companion");
  const viewerRef = useRef<PdfViewerHandle>(null);
  const infoFirst = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGetPaper(paperId);
      setPaper(data.paper);
      setOutline(data.outline);
      setError("");
      return data.paper;
    } catch (e) {
      setError(errorMessage(e, "无法打开这篇文献"));
      return null;
    }
  }, [paperId]);

  useEffect(() => {
    if (!Number.isInteger(paperId) || paperId <= 0) { setError("无效的文献"); return; }
    const query = new URLSearchParams(window.location.search);
    infoFirst.current = query.has("info");
    void load();
    apiListPaperAnnotations(paperId).then((data) => setAnnotations(data.annotations)).catch(() => {});
    void useChatStore.getState().load(`paper:${paperId}`);

    // Where to open: an explicit ?page= (a citation from another paper) wins,
    // then this device's memory, then the account's if another device is newer.
    const asked = Number(query.get("page"));
    let local: (PdfLocator & { savedAt: number }) | null = null;
    try { local = JSON.parse(localStorage.getItem(progressKey(paperId)) ?? "null"); } catch {}
    if (asked > 0) { setInitial({ page: asked, scale: local?.scale ?? "page-width", offsetRatio: 0 }); return; }
    apiGetPaperProgress(paperId)
      .then((data) => {
        const serverTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
        setInitial(data.locator && (!local || serverTime > local.savedAt + 5000) ? data.locator : local);
      })
      .catch(() => setInitial(local));
  }, [paperId, load]);

  // The outline and metadata appear when background processing finishes.
  useEffect(() => {
    if (!paper?.processing) return;
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [paper?.processing, load]);

  // Reading position: at once locally, debounced to the account, flushed on leave.
  const latest = useRef<PdfLocator | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLocator = useCallback((locator: PdfLocator) => {
    setPage(locator.page);
    latest.current = locator;
    try { localStorage.setItem(progressKey(paperId), JSON.stringify({ ...locator, savedAt: Date.now() })); } catch {}
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/papers/${paperId}/progress`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locator), keepalive: true }).catch(() => {});
    }, 1500);
  }, [paperId]);
  useEffect(() => {
    const flush = () => {
      if (latest.current) navigator.sendBeacon(`/api/papers/${paperId}/progress`, new Blob([JSON.stringify(latest.current)], { type: "application/json" }));
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [paperId]);

  // A citation into this paper flashes in place; one into another paper opens
  // that paper and flashes there.
  const handleCite = useCallback((source: SourceRef) => {
    if (source.kind !== "passage" || !source.page) return;
    const target = source.pageBoxes?.[0] ?? { page: source.page, boxes: [] };
    if (source.paperId && source.paperId !== paperId) {
      try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ paperId: source.paperId, ...target })); } catch {}
      router.push(`/papers/${source.paperId}?page=${target.page}`);
      return;
    }
    // On a phone, drop a full-height sheet to half so the passage is visible above it.
    useUIStore.setState({ aiSheetSnap: "half" });
    viewerRef.current?.flash(target.page, target.boxes);
  }, [paperId, router]);

  const handlePageCount = useCallback(() => {
    try {
      const pending = JSON.parse(sessionStorage.getItem(FLASH_KEY) ?? "null");
      if (pending?.paperId !== paperId) return;
      sessionStorage.removeItem(FLASH_KEY);
      setTimeout(() => viewerRef.current?.flash(pending.page, pending.boxes ?? []), 600);
    } catch {}
  }, [paperId]);

  const highlights = useMemo<PdfHighlight[]>(
    () => annotations.map((a) => ({ id: String(a.id), page: a.page, boxes: a.boxes, color: a.color })),
    [annotations],
  );

  const context = useMemo<AssistantContext | null>(() => paper && {
    kind: "paper", bookId: `paper:${paper.id}`, bookTitle: paper.title, paperId: paper.id, page,
    unitId: null, unitIndex: null, unitLabel: `第 ${page} 页`,
  }, [paper, page]);

  function clearSelection() {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setPickingColor(false);
  }
  async function addHighlight(color: string) {
    if (!selection) return;
    const picked = selection;
    clearSelection();
    try {
      const { annotation } = await apiAddPaperAnnotation(paperId, { page: picked.page, boxes: picked.boxes, text: picked.text, color });
      setAnnotations((list) => [...list, annotation].sort((a, b) => a.page - b.page || a.id - b.id));
    } catch (e) {
      setError(errorMessage(e, "划线没有保存成功"));
    }
  }

  if (error && !paper) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--background)] px-6 text-center">
        <p role="alert" className="text-sm text-red-500">{error}</p>
        <Link href="/papers" className="min-h-10 rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)]">返回文献库</Link>
      </div>
    );
  }
  if (!paper) return <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">正在打开文献…</div>;

  const iconButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]";
  const action = "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm hover:bg-[var(--accent)] md:min-h-9 md:flex-none md:text-xs";

  return (
    <>
      <ReadingLayout
        mobileBottomOffset={NAV_HEIGHT}
        leftPanel={
          <PaperSidePanel
            paper={paper} outline={outline} annotations={annotations}
            initialTab={infoFirst.current || !paper.hasFile ? "info" : "outline"}
            onGoToPage={(target) => { viewerRef.current?.goToPage(target); if (isMobile) toggleLeftPanel(); }}
            onShowAnnotation={(a) => { viewerRef.current?.flash(a.page, a.boxes); if (isMobile) toggleLeftPanel(); }}
            onDeleteAnnotation={async (a) => {
              if (!window.confirm("删除这条批注？")) return;
              try { await apiDeletePaperAnnotation(paperId, a.id); setAnnotations((list) => list.filter((x) => x.id !== a.id)); } catch (e) { setError(errorMessage(e, "删除失败")); }
            }}
            onPaperChange={setPaper}
          />
        }
        centerPanel={
          <>
            <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--background)] px-1 sm:px-2">
              <Link href="/papers" className={iconButton} title="返回文献库" aria-label="返回文献库"><ArrowLeft className="h-4 w-4" /></Link>
              <button onClick={toggleLeftPanel} className={`${iconButton} hidden md:flex`} title="大纲 / 批注 / 信息" aria-pressed={leftPanelOpen}>
                <PanelLeft className={`h-4 w-4 ${leftPanelOpen ? "text-[var(--primary)]" : ""}`} />
              </button>
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-sm font-medium">{paper.title}</p>
                {paper.processing && <p className="truncate text-[11px] text-[var(--primary)]">后台处理中：{STAGE_LABELS[paper.stage] ?? paper.stage}（不影响阅读）</p>}
              </div>
              <button onClick={toggleAiPanelPosition} className={`${iconButton} hidden md:flex`} title={aiPanelPosition === "right" ? "AI 面板移到底部" : "AI 面板移到右侧"}>
                <PanelBottom className={`h-4 w-4 ${aiPanelPosition === "bottom" ? "text-[var(--primary)]" : ""}`} />
              </button>
              <button onClick={toggleRightPanel} className={`${iconButton} hidden md:flex`} title="问 AI" aria-pressed={rightPanelOpen}>
                <Sparkles className={`h-4 w-4 ${rightPanelOpen ? "text-[var(--primary)]" : ""}`} />
              </button>
            </header>

            {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

            <div className="min-h-0 flex-1 pb-[var(--reader-bottom-inset,0px)]">
              {!paper.hasFile ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[var(--muted-foreground)]">
                  <p>这条文献还没有 PDF。</p>
                  <p>在文献库页面上传对应的 PDF，就会自动挂接到这一条。</p>
                </div>
              ) : initial === undefined ? null : (
                <PdfViewer
                  ref={viewerRef}
                  url={paperFileUrl(paper.id)}
                  initial={initial}
                  highlights={highlights}
                  onLocatorChange={handleLocator}
                  onSelection={(next) => { setSelection(next); if (!next) setPickingColor(false); }}
                  onPageCount={handlePageCount}
                />
              )}
            </div>
          </>
        }
        rightPanel={
          <AssistantPanel
            context={context}
            mode={mode}
            onModeChange={setMode}
            pendingSelection={pendingQuote}
            onSelectionConsumed={() => setPendingQuote(null)}
            onCite={handleCite}
          />
        }
      />

      {selection && (
        <div
          data-selection-toolbar
          onPointerDown={(event) => event.preventDefault()}
          className="fixed z-[60] rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl"
          style={isMobile
            ? { left: 8, right: 8, bottom: `calc(${NAV_HEIGHT} + ${rightPanelOpen ? "52dvh" : "0px"} + 8px)` }
            : { left: Math.max(8, Math.min(selection.x - 130, window.innerWidth - 280)), top: Math.max(8, selection.y - 56) }}
        >
          {pickingColor ? (
            <div className="flex items-center justify-around gap-1 px-1">
              {COLORS.map((color) => (
                <button key={color} onClick={() => addHighlight(color)} aria-label={`用${color}划线`} className="flex h-11 w-11 items-center justify-center">
                  <span className={`h-7 w-7 rounded-full border border-black/10 ${SWATCH[color]}`} />
                </button>
              ))}
              <button onClick={() => setPickingColor(false)} aria-label="返回" className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)]"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                className={`${action} font-medium text-[var(--primary)]`}
                onClick={() => { setPendingQuote(selection.text); useUIStore.setState({ rightPanelOpen: true }); clearSelection(); }}
              >
                <Sparkles className="h-4 w-4" />问 AI
              </button>
              <button className={action} onClick={() => setPickingColor(true)}><Highlighter className="h-4 w-4" />划线</button>
              <button onClick={clearSelection} aria-label="取消" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)] md:h-9 md:w-9"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      )}

      <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-[45] flex border-t border-[var(--border)] bg-[var(--background)] md:hidden">
        <Link href="/papers" className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-[var(--muted-foreground)]"><Library className="h-5 w-5" />文献库</Link>
        <button onClick={toggleLeftPanel} aria-pressed={leftPanelOpen} className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${leftPanelOpen ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}><Info className="h-5 w-5" />大纲·信息</button>
        <button onClick={toggleRightPanel} aria-pressed={rightPanelOpen} className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${rightPanelOpen ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`}><Sparkles className="h-5 w-5" />问 AI</button>
      </nav>
    </>
  );
}
