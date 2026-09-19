"use client";

import { type ReactNode, useRef, useState } from "react";

export type SheetSnap = "half" | "full";

/** Sheet height per snap point, as a fraction of the viewport height. */
export const SNAP_HEIGHT: Record<SheetSnap, number> = { half: 0.52, full: 0.9 };

interface Props {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onClose: () => void;
  /** Distance from the bottom of the screen, e.g. the height of a tab bar. */
  bottomOffset?: string;
  children: ReactNode;
}

/**
 * Phone-only container for the AI panel. At "half" the book stays readable and
 * scrollable above it — asking while reading is the point — so there is no
 * scrim; at "full" the scrim appears and a tap on it drops back to half.
 * Dragging the handle moves between the snap points; dragging down past half closes.
 */
export function BottomSheet({ snap, onSnapChange, onClose, bottomOffset = "0px", children }: Props) {
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  const viewport = () => window.visualViewport?.height ?? window.innerHeight;

  function onPointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: viewport() * SNAP_HEIGHT[snap] };
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current) return;
    const height = drag.current.startHeight + (drag.current.startY - event.clientY);
    setDragHeight(Math.max(80, Math.min(viewport() * 0.95, height)));
  }
  function onPointerUp() {
    if (!drag.current) return;
    const fraction = (dragHeight ?? drag.current.startHeight) / viewport();
    drag.current = null;
    setDragHeight(null);
    if (fraction < 0.3) onClose();
    else onSnapChange(fraction > (SNAP_HEIGHT.half + SNAP_HEIGHT.full) / 2 ? "full" : "half");
  }

  return (
    <>
      {snap === "full" && (
        <button
          aria-label="收起 AI 面板"
          onClick={() => onSnapChange("half")}
          className="fixed inset-0 z-30 bg-black/40"
        />
      )}
      <section
        aria-label="AI 助手"
        className={`fixed inset-x-0 z-40 flex flex-col overflow-hidden rounded-t-2xl border-t border-[var(--border)] bg-[var(--background)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ${
          dragHeight === null ? "transition-[height] duration-200" : ""
        }`}
        style={{ bottom: bottomOffset, height: dragHeight ?? `${SNAP_HEIGHT[snap] * 100}dvh` }}
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // touch-none: the drag must not also scroll the page underneath.
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整高度"
        >
          <span className="h-1.5 w-10 rounded-full bg-[var(--border)]" />
        </div>
        {/* A flex column, so the panel is sized by flex rather than by a percentage height. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </section>
    </>
  );
}
