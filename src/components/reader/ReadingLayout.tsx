"use client";

import { type ReactNode, useRef, useCallback, useEffect } from "react";
import { useUIStore } from "@/stores/ui-store";

interface ReadingLayoutProps {
  leftPanel: ReactNode;
  centerPanel: ReactNode;
  rightPanel: ReactNode;
}

export function ReadingLayout({ leftPanel, centerPanel, rightPanel }: ReadingLayoutProps) {
  const {
    leftPanelOpen, rightPanelOpen,
    leftPanelWidth, rightPanelWidth,
    aiPanelPosition, aiPanelSize,
    setLeftPanelWidth, setRightPanelWidth, setAiPanelSize,
  } = useUIStore();

  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);
  const bottomHandleRef = useRef<HTMLDivElement>(null);

  // --- Drag resize logic ---
  const handleDrag = useCallback(
    (e: MouseEvent, target: "left" | "right" | "bottom") => {
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeftW = leftPanelWidth;
      const startRightW = target === "bottom" ? aiPanelSize : rightPanelWidth;
      const startBottomH = aiPanelSize;
      const containerW = window.innerWidth;
      const containerH = window.innerHeight;

      function onMove(ev: MouseEvent) {
        if (target === "left") {
          const dx = ev.clientX - startX;
          setLeftPanelWidth(startLeftW + dx / containerW);
        } else if (target === "right") {
          const dx = startX - ev.clientX;
          setRightPanelWidth(startRightW + dx / containerW);
        } else if (target === "bottom") {
          const dy = startY - ev.clientY;
          setAiPanelSize(Math.max(200, Math.min(600, startBottomH + dy)));
        }
      }

      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = target === "bottom" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
    },
    [leftPanelWidth, rightPanelWidth, aiPanelSize, setLeftPanelWidth, setRightPanelWidth, setAiPanelSize],
  );

  const leftW = leftPanelOpen ? `${leftPanelWidth * 100}%` : "0px";
  const rightW = rightPanelOpen && aiPanelPosition === "right" ? `${rightPanelWidth * 100}%` : "0px";
  const bottomH = rightPanelOpen && aiPanelPosition === "bottom" ? `${aiPanelSize}px` : "0px";

  // Right position: classic 3-column
  if (aiPanelPosition === "right") {
    return (
      <div className="flex h-screen overflow-hidden bg-[var(--background)]">
        {/* Left Panel */}
        <div className="relative shrink-0 overflow-hidden border-r border-[var(--border)] transition-[width] duration-200" style={{ width: leftW }}>
          {leftPanelOpen && <div className="h-full w-full overflow-y-auto">{leftPanel}</div>}
          {/* Left drag handle */}
          {leftPanelOpen && (
            <div
              ref={leftHandleRef}
              onMouseDown={(e) => { e.preventDefault(); handleDrag(e as unknown as MouseEvent, "left"); }}
              className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--primary)] hover:opacity-50"
            />
          )}
        </div>

        {/* Center */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{centerPanel}</div>

        {/* Right Panel (AI) */}
        <div className="relative shrink-0 overflow-hidden border-l border-[var(--border)] transition-[width] duration-200" style={{ width: rightW }}>
          {rightPanelOpen && <div className="h-full w-full overflow-hidden">{rightPanel}</div>}
          {rightPanelOpen && (
            <div
              ref={rightHandleRef}
              onMouseDown={(e) => { e.preventDefault(); handleDrag(e as unknown as MouseEvent, "right"); }}
              className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-[var(--primary)] hover:opacity-50"
            />
          )}
        </div>
      </div>
    );
  }

  // Bottom position: panels above, AI below
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)]">
      {/* Top area: left panel + center */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="shrink-0 overflow-hidden border-r border-[var(--border)] transition-[width] duration-200" style={{ width: leftW }}>
          {leftPanelOpen && <div className="h-full w-full overflow-y-auto">{leftPanel}</div>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{centerPanel}</div>
      </div>

      {/* Bottom AI Panel */}
      <div className="relative shrink-0 overflow-hidden border-t border-[var(--border)] transition-[height] duration-200" style={{ height: bottomH }}>
        {/* Drag handle */}
        {rightPanelOpen && (
          <div
            ref={bottomHandleRef}
            onMouseDown={(e) => { e.preventDefault(); handleDrag(e as unknown as MouseEvent, "bottom"); }}
            className="absolute left-0 top-0 z-10 h-1 w-full cursor-row-resize hover:bg-[var(--primary)] hover:opacity-50"
          />
        )}
        {rightPanelOpen && <div className="h-full w-full overflow-hidden">{rightPanel}</div>}
      </div>
    </div>
  );
}
