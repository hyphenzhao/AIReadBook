"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Minus, Plus, Search, X } from "lucide-react";
import "pdfjs-dist/web/pdf_viewer.css";

/** A box on a page in PDF points, origin top-left — the same convention the server stores. */
export type PageBox = [x0: number, y0: number, x1: number, y1: number];

export interface PdfLocator { page: number; scale: number | string; offsetRatio: number }
export interface PdfSelection { text: string; page: number; boxes: PageBox[]; x: number; y: number }
export interface PdfHighlight { id: string; page: number; boxes: PageBox[]; color: string }

export interface PdfViewerHandle {
  goToPage: (page: number) => void;
  /** Scrolls to a passage and flashes it — what a citation click does. */
  flash: (page: number, boxes: PageBox[]) => void;
}

interface Props {
  url: string;
  initial?: PdfLocator | null;
  highlights?: PdfHighlight[];
  onLocatorChange?: (locator: PdfLocator) => void;
  onSelection?: (selection: PdfSelection | null) => void;
  onPageCount?: (count: number) => void;
}

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "rgba(250, 204, 21, 0.38)", green: "rgba(74, 222, 128, 0.35)", blue: "rgba(96, 165, 250, 0.35)",
  pink: "rgba(244, 114, 182, 0.35)", orange: "rgba(251, 146, 60, 0.38)", cite: "rgba(99, 102, 241, 0.30)",
};

/**
 * The original PDF, rendered by pdf.js's own viewer component: only the pages
 * near the viewport are rendered, the file is fetched in ranges as they are
 * needed, and the text layer makes the PDF selectable and searchable. Nothing
 * here parses the document for the AI — that was done once, at upload.
 */
export const PdfViewer = forwardRef<PdfViewerHandle, Props>(function PdfViewer(
  { url, initial, highlights = [], onLocatorChange, onSelection, onPageCount }, ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfViewerRef = useRef<any>(null);
  const eventBusRef = useRef<any>(null);
  const flashRef = useRef<{ page: number; boxes: PageBox[] } | null>(null);
  const highlightsRef = useRef(highlights);
  const callbacks = useRef({ onLocatorChange, onSelection, onPageCount });
  callbacks.current = { onLocatorChange, onSelection, onPageCount };

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorText, setErrorText] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scalePercent, setScalePercent] = useState(100);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCount, setFindCount] = useState<{ current: number; total: number } | null>(null);

  /** Draws user highlights and the citation flash on one rendered page. */
  function paintPage(pageNumber: number) {
    const pageView = pdfViewerRef.current?.getPageView(pageNumber - 1);
    const pageDiv: HTMLElement | undefined = pageView?.div;
    if (!pageDiv || !pageView.viewport) return;
    pageDiv.querySelectorAll(".arb-highlights").forEach((node) => node.remove());

    const items = [
      ...highlightsRef.current.filter((h) => h.page === pageNumber).map((h) => ({ boxes: h.boxes, color: HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.yellow, flash: false })),
      ...(flashRef.current?.page === pageNumber ? [{ boxes: flashRef.current.boxes, color: HIGHLIGHT_COLORS.cite, flash: true }] : []),
    ];
    if (items.length === 0) return;

    const layer = document.createElement("div");
    layer.className = "arb-highlights";
    layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:1;";
    // Stored boxes are PDF points from the top-left; the viewport scale turns them into CSS pixels.
    const scale = pageView.viewport.scale;
    for (const item of items) {
      for (const [x0, y0, x1, y1] of item.boxes) {
        const box = document.createElement("div");
        box.style.cssText = `position:absolute;left:${x0 * scale}px;top:${y0 * scale}px;width:${(x1 - x0) * scale}px;height:${(y1 - y0) * scale}px;background:${item.color};border-radius:2px;mix-blend-mode:multiply;`;
        if (item.flash) box.dataset.flash = "true";
        layer.appendChild(box);
      }
    }
    pageDiv.appendChild(layer);
  }

  const repaintAll = () => {
    const viewer = pdfViewerRef.current;
    if (!viewer) return;
    for (let n = 1; n <= viewer.pagesCount; n++) paintPage(n);
  };

  useEffect(() => {
    highlightsRef.current = highlights;
    repaintAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights]);

  useImperativeHandle(ref, () => ({
    goToPage(target) {
      const viewer = pdfViewerRef.current;
      if (viewer) viewer.currentPageNumber = Math.max(1, Math.min(viewer.pagesCount, target));
    },
    flash(target, boxes) {
      const viewer = pdfViewerRef.current;
      if (!viewer) return;
      flashRef.current = { page: target, boxes };
      const top = boxes.length ? Math.min(...boxes.map((b) => b[1])) : 0;
      const pageView = viewer.getPageView(target - 1);
      const pageHeight = pageView?.viewport ? pageView.viewport.height / pageView.viewport.scale : 0;
      // XYZ destinations count from the bottom-left; leave a little of the page above the passage.
      viewer.scrollPageIntoView({ pageNumber: target, destArray: [null, { name: "XYZ" }, 0, Math.max(0, pageHeight - top + 60), null] });
      repaintAll();
      setTimeout(() => {
        if (flashRef.current?.page === target) { flashRef.current = null; repaintAll(); }
      }, 4000);
    },
  }));

  // Load the document and wire the viewer up. Re-runs only when the file changes.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: any;
    const cleanups: (() => void)[] = [];
    setStatus("loading");

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const { EventBus, PDFFindController, PDFLinkService, PDFViewer: Viewer } = await import("pdfjs-dist/web/pdf_viewer.mjs");
      if (cancelled || !containerRef.current || !viewerRef.current) return;

      // Copied into public/ by scripts/copy-pdfjs-assets.mjs. The character maps
      // are what make Chinese and Japanese PDFs render with their own glyphs.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const findController = new PDFFindController({ eventBus, linkService });
      const viewer = new Viewer({
        container: containerRef.current,
        viewer: viewerRef.current,
        eventBus, linkService, findController,
        textLayerMode: 1,
        removePageBorders: false,
      });
      linkService.setViewer(viewer);
      pdfViewerRef.current = viewer;
      eventBusRef.current = eventBus;

      const report = () => {
        const container = containerRef.current;
        const pageView = viewer.getPageView(viewer.currentPageNumber - 1);
        if (!container || !pageView?.div) return;
        const offsetRatio = Math.max(0, Math.min(1, (container.scrollTop - pageView.div.offsetTop) / Math.max(1, pageView.div.offsetHeight)));
        callbacks.current.onLocatorChange?.({
          page: viewer.currentPageNumber,
          scale: /^(page-|auto)/.test(viewer.currentScaleValue) ? viewer.currentScaleValue : viewer.currentScale,
          offsetRatio,
        });
      };

      eventBus.on("pagesinit", () => {
        viewer.currentScaleValue = String(initial?.scale ?? "page-width");
        if (initial?.page) {
          viewer.currentPageNumber = Math.min(initial.page, viewer.pagesCount);
          // The page's own offset within it, once layout has settled.
          requestAnimationFrame(() => {
            const container = containerRef.current;
            const pageView = viewer.getPageView(viewer.currentPageNumber - 1);
            if (container && pageView?.div) container.scrollTop = pageView.div.offsetTop + (initial.offsetRatio ?? 0) * pageView.div.offsetHeight;
          });
        }
        setStatus("ready");
      });
      eventBus.on("pagechanging", (event: any) => { setPage(event.pageNumber); report(); });
      eventBus.on("scalechanging", (event: any) => { setScalePercent(Math.round(event.scale * 100)); report(); });
      eventBus.on("pagerendered", (event: any) => paintPage(event.pageNumber));
      eventBus.on("updatefindmatchescount", (event: any) => setFindCount(event.matchesCount));
      eventBus.on("updatefindcontrolstate", (event: any) => event.matchesCount && setFindCount(event.matchesCount));

      const container = containerRef.current;
      let scrollTimer: ReturnType<typeof setTimeout>;
      const onScroll = () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(report, 400); };
      container.addEventListener("scroll", onScroll, { passive: true });
      cleanups.push(() => { clearTimeout(scrollTimer); container.removeEventListener("scroll", onScroll); });

      // "page-width" has to be recomputed when the panels beside the viewer open or close.
      const resize = new ResizeObserver(() => {
        if (/^(page-|auto)/.test(viewer.currentScaleValue)) viewer.currentScaleValue = viewer.currentScaleValue;
      });
      resize.observe(container);
      cleanups.push(() => resize.disconnect());

      // Selection → the page it is on and its boxes in PDF points.
      let selectionTimer: ReturnType<typeof setTimeout>;
      const readSelection = () => {
        const selection = window.getSelection();
        const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
        if (!selection || selection.isCollapsed || text.length < 2 || !container.contains(selection.anchorNode)) {
          if (!document.activeElement?.closest("[data-selection-toolbar]")) callbacks.current.onSelection?.(null);
          return;
        }
        const range = selection.getRangeAt(0);
        const startNode = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const pageDiv = startNode?.closest<HTMLElement>(".page[data-page-number]");
        const pageNumber = Number(pageDiv?.dataset.pageNumber);
        const pageView = pageNumber ? viewer.getPageView(pageNumber - 1) : null;
        if (!pageDiv || !pageView?.viewport) return;
        const origin = pageDiv.getBoundingClientRect();
        const scale = pageView.viewport.scale;
        const boxes = [...range.getClientRects()]
          .filter((rect) => rect.width > 1 && rect.height > 1 && rect.bottom > origin.top && rect.top < origin.bottom)
          .map((rect): PageBox => [
            (rect.left - origin.left - pageDiv.clientLeft) / scale, (rect.top - origin.top - pageDiv.clientTop) / scale,
            (rect.right - origin.left - pageDiv.clientLeft) / scale, (rect.bottom - origin.top - pageDiv.clientTop) / scale,
          ].map((n) => Math.round(n * 100) / 100) as PageBox);
        const bounds = range.getBoundingClientRect();
        callbacks.current.onSelection?.({ text, page: pageNumber, boxes, x: bounds.left + bounds.width / 2, y: bounds.top });
      };
      const onSelectionChange = () => { clearTimeout(selectionTimer); selectionTimer = setTimeout(readSelection, 250); };
      document.addEventListener("selectionchange", onSelectionChange);
      cleanups.push(() => { clearTimeout(selectionTimer); document.removeEventListener("selectionchange", onSelectionChange); });

      // Two-finger pinch: a cheap CSS transform while the fingers move, one real re-render at the end.
      let pinch: { distance: number; scale: number } | null = null;
      const spread = (touches: TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
      const onTouchStart = (event: TouchEvent) => { if (event.touches.length === 2) pinch = { distance: spread(event.touches), scale: viewer.currentScale }; };
      const onTouchMove = (event: TouchEvent) => {
        if (!pinch || event.touches.length !== 2 || !viewerRef.current) return;
        event.preventDefault();
        viewerRef.current.style.transform = `scale(${spread(event.touches) / pinch.distance})`;
        viewerRef.current.style.transformOrigin = "center top";
      };
      const onTouchEnd = (event: TouchEvent) => {
        if (!pinch || event.touches.length >= 2 || !viewerRef.current) return;
        const ratio = Number(viewerRef.current.style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
        viewerRef.current.style.transform = "";
        viewer.currentScale = Math.max(0.4, Math.min(5, pinch.scale * ratio));
        pinch = null;
      };
      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: false });
      container.addEventListener("touchend", onTouchEnd);
      cleanups.push(() => {
        container.removeEventListener("touchstart", onTouchStart);
        container.removeEventListener("touchmove", onTouchMove);
        container.removeEventListener("touchend", onTouchEnd);
      });

      loadingTask = pdfjs.getDocument({
        url,
        withCredentials: true,
        // Fetch 1 MB at a time, and only what is looked at.
        rangeChunkSize: 1 << 20,
        disableAutoFetch: true,
        cMapUrl: "/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
      });
      const pdf = await loadingTask.promise;
      if (cancelled) return;
      viewer.setDocument(pdf);
      linkService.setDocument(pdf, null);
      setPageCount(pdf.numPages);
      callbacks.current.onPageCount?.(pdf.numPages);
    })().catch((error) => {
      if (cancelled) return;
      console.error("PDF failed to load", error);
      setErrorText(error?.status === 401 ? "登录已过期，请重新登录" : error?.name === "MissingPDFException" ? "服务器上找不到这个 PDF" : "PDF 无法打开");
      setStatus("error");
    });

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
      pdfViewerRef.current = null;
      loadingTask?.destroy?.();
    };
    // `initial` is read once, when the document opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const zoom = (factor: number) => {
    const viewer = pdfViewerRef.current;
    if (viewer) viewer.currentScale = Math.max(0.4, Math.min(5, viewer.currentScale * factor));
  };
  const find = (type: "" | "again", backwards = false) =>
    eventBusRef.current?.dispatch("find", {
      source: null, type, query: findQuery, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: backwards,
    });
  const closeFind = () => {
    setFindOpen(false);
    setFindCount(null);
    eventBusRef.current?.dispatch("findbarclose", { source: null });
  };

  const button = "flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-40";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--background)] px-1 text-sm">
        {findOpen ? (
          <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(event) => { event.preventDefault(); find("again"); }}>
            <input
              autoFocus
              value={findQuery}
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyUp={(event) => event.key !== "Enter" && find("")}
              placeholder="在文献中查找…"
              className="h-9 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">{findCount ? `${findCount.current}/${findCount.total}` : ""}</span>
            <button type="button" className={button} onClick={() => find("again", true)} aria-label="上一个"><ChevronUp className="h-4 w-4" /></button>
            <button type="submit" className={button} aria-label="下一个"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" className={button} onClick={closeFind} aria-label="关闭查找"><X className="h-4 w-4" /></button>
          </form>
        ) : (
          <>
            <button className={button} onClick={() => setFindOpen(true)} aria-label="查找" title="查找"><Search className="h-4 w-4" /></button>
            <span className="flex-1 text-center text-xs tabular-nums text-[var(--muted-foreground)]">
              {pageCount ? `第 ${page} / ${pageCount} 页` : ""}
            </span>
            <button className={button} onClick={() => zoom(1 / 1.15)} aria-label="缩小"><Minus className="h-4 w-4" /></button>
            <button
              className="h-10 min-w-[3.5rem] shrink-0 rounded px-1 text-xs tabular-nums hover:bg-[var(--accent)]"
              onClick={() => { if (pdfViewerRef.current) pdfViewerRef.current.currentScaleValue = "page-width"; }}
              title="适合宽度"
            >
              {scalePercent}%
            </button>
            <button className={button} onClick={() => zoom(1.15)} aria-label="放大"><Plus className="h-4 w-4" /></button>
          </>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-[var(--muted)]">
        {/* pdf.js requires its container to be absolutely positioned. */}
        <div ref={containerRef} className="absolute inset-0 overflow-auto overscroll-contain" tabIndex={0}>
          <div ref={viewerRef} className="pdfViewer" />
        </div>
        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--background)]/70 text-sm text-[var(--muted-foreground)]">
            {status === "loading" ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />正在打开 PDF…</span> : <span role="alert" className="text-red-500">{errorText}</span>}
          </div>
        )}
      </div>
    </div>
  );
});
