"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";
import { useIsMobile } from "@/hooks/useIsMobile";
import { BottomSheet, SNAP_HEIGHT } from "@/components/reader/BottomSheet";

interface ReadingLayoutProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
  /** Height of a fixed bar under the layout on phones (the tab bar). */
  mobileBottomOffset?: string;
}

type ResizeTarget = "left" | "right" | "bottom";

export function ReadingLayout({ leftPanel, centerPanel, rightPanel, mobileBottomOffset = "0px" }: ReadingLayoutProps) {
  const {
    leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel,
    leftPanelWidth, rightPanelWidth, aiPanelPosition, aiPanelSize,
    setLeftPanelWidth, setRightPanelWidth, setAiPanelSize,
    aiSheetSnap: sheetSnap, setAiSheetSnap: setSheetSnap,
  } = useUIStore();
  const isMobile = useIsMobile();

  // Panel state is remembered for the desktop. On a phone an open panel covers
  // the book, so reading always starts with the text.
  useEffect(() => {
    if (isMobile) useUIStore.setState({ leftPanelOpen: false, rightPanelOpen: false });
  }, [isMobile]);

  // Pointer events, so the handles work with touch and pen as well as a mouse.
  function startResize(event: React.PointerEvent, target: ResizeTarget) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = leftPanelWidth;
    const startRight = rightPanelWidth;
    const startBottom = aiPanelSize;
    const width = window.innerWidth;

    const onMove = (ev: PointerEvent) => {
      if (target === "left") setLeftPanelWidth(startLeft + (ev.clientX - startX) / width);
      else if (target === "right") setRightPanelWidth(startRight + (startX - ev.clientX) / width);
      else setAiPanelSize(Math.max(200, Math.min(600, startBottom + (startY - ev.clientY))));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    document.body.style.cursor = target === "bottom" ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }

  const handle = (target: ResizeTarget, className: string) => (
    <div
      onPointerDown={(event) => startResize(event, target)}
      className={`absolute z-10 touch-none hover:bg-[var(--primary)] hover:opacity-50 ${className}`}
    />
  );

  if (isMobile) {
    // The reading column reserves the sheet's height, so the last lines of a
    // chapter can still be scrolled into view above a half-open sheet.
    const reserved = rightPanelOpen ? `${SNAP_HEIGHT.half * 100}dvh` : "0px";
    return (
      <div
        className="relative flex h-dvh flex-col overflow-hidden bg-[var(--background)]"
        style={{ "--reader-bottom-inset": `calc(${mobileBottomOffset} + ${reserved})` } as CSSProperties}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{centerPanel}</div>

        {leftPanelOpen && (
          <>
            <button aria-label="关闭目录" onClick={toggleLeftPanel} className="fixed inset-0 z-40 bg-black/40" />
            <aside
              className="fixed inset-y-0 left-0 z-50 w-[min(85vw,20rem)] overflow-y-auto border-r border-[var(--border)] bg-[var(--background)] shadow-xl"
              style={{ paddingBottom: mobileBottomOffset }}
            >
              {leftPanel}
            </aside>
          </>
        )}

        {rightPanelOpen && (
          <BottomSheet snap={sheetSnap} onSnapChange={setSheetSnap} onClose={toggleRightPanel} bottomOffset={mobileBottomOffset}>
            {rightPanel}
          </BottomSheet>
        )}
      </div>
    );
  }

  const leftW = leftPanelOpen ? `${leftPanelWidth * 100}%` : "0px";
  const left = (
    <div className="relative shrink-0 overflow-hidden border-r border-[var(--border)] transition-[width] duration-200" style={{ width: leftW }}>
      {leftPanelOpen && <div className="h-full w-full overflow-y-auto">{leftPanel}</div>}
      {leftPanelOpen && handle("left", "right-0 top-0 h-full w-1.5 cursor-col-resize")}
    </div>
  );

  if (aiPanelPosition === "right") {
    return (
      <div className="relative flex h-dvh overflow-hidden bg-[var(--background)]">
        {left}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{centerPanel}</div>
        <div
          className="relative shrink-0 overflow-hidden border-l border-[var(--border)] transition-[width] duration-200"
          style={{ width: rightPanelOpen ? `${rightPanelWidth * 100}%` : "0px" }}
        >
          {rightPanelOpen && <div className="h-full w-full overflow-hidden">{rightPanel}</div>}
          {rightPanelOpen && handle("right", "left-0 top-0 h-full w-1.5 cursor-col-resize")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--background)]">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {left}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{centerPanel}</div>
      </div>
      <div
        className="relative shrink-0 overflow-hidden border-t border-[var(--border)] transition-[height] duration-200"
        style={{ height: rightPanelOpen ? `min(${aiPanelSize}px, calc(100dvh - 7rem))` : "0px" }}
      >
        {rightPanelOpen && handle("bottom", "left-0 top-0 h-1.5 w-full cursor-row-resize")}
        {rightPanelOpen && <div className="h-full w-full overflow-hidden">{rightPanel}</div>}
      </div>
    </div>
  );
}
