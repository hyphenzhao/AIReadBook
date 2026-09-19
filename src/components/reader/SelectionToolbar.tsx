"use client";

import { useState } from "react";
import { Highlighter, MessageSquareText, Sparkles, X } from "lucide-react";
import { useAnnotationStore } from "@/stores/annotation-store";
import { useReadingStore } from "@/stores/reading-store";
import { useIsMobile } from "@/hooks/useIsMobile";

const COLORS = [
  { id: "yellow", className: "bg-yellow-300 border-yellow-400" },
  { id: "green", className: "bg-green-300 border-green-400" },
  { id: "blue", className: "bg-blue-300 border-blue-400" },
  { id: "pink", className: "bg-pink-300 border-pink-400" },
  { id: "orange", className: "bg-orange-300 border-orange-400" },
] as const;
type Color = (typeof COLORS)[number]["id"];

interface SelectionToolbarProps {
  selectedText: string;
  /** Viewport coordinates of the selection's top centre (desktop placement). */
  position: { x: number; y: number };
  /** Phone: distance from the bottom of the screen, above the tab bar and AI sheet. */
  mobileBottom?: string;
  onClose: () => void;
}

/**
 * Actions for selected text. Next to the selection on a desktop; docked at the
 * bottom with thumb-sized targets on a phone, where a floating bar would sit
 * under the system's own copy/paste bubble.
 */
export function SelectionToolbar({ selectedText, position, mobileBottom = "0px", onClose }: SelectionToolbarProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<"actions" | "colors" | "note">("actions");
  const [note, setNote] = useState("");
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const { currentBook, currentChapter, triggerAskAI } = useReadingStore();

  function finish() {
    window.getSelection()?.removeAllRanges();
    onClose();
  }

  function highlight(color: Color) {
    if (!currentBook) return;
    addAnnotation({
      bookId: currentBook.id,
      chapterId: currentChapter?.id ?? null,
      selectedText,
      note: note.trim(),
      color,
      tags: [],
    });
    finish();
  }

  const action = "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm hover:bg-[var(--accent)] md:min-h-9 md:flex-none md:text-xs";

  const style: React.CSSProperties = isMobile
    ? { position: "fixed", left: 8, right: 8, bottom: `calc(${mobileBottom} + 8px)`, zIndex: 60 }
    : {
        position: "fixed",
        left: Math.max(8, Math.min(position.x - 150, window.innerWidth - 320)),
        top: Math.max(8, position.y - 56),
        zIndex: 60,
      };

  return (
    <div
      data-selection-toolbar
      style={style}
      // Keeps the tap from collapsing the selection before the button's click lands.
      onPointerDown={(event) => { if (!(event.target instanceof HTMLTextAreaElement)) event.preventDefault(); }}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-xl"
    >
      {mode === "actions" && (
        <div className="flex items-center gap-1">
          <button onClick={() => { triggerAskAI(selectedText); finish(); }} className={`${action} font-medium text-[var(--primary)]`}>
            <Sparkles className="h-4 w-4" />问 AI
          </button>
          <button onClick={() => setMode("colors")} className={action}><Highlighter className="h-4 w-4" />划线</button>
          <button onClick={() => setMode("note")} className={action}><MessageSquareText className="h-4 w-4" />批注</button>
          <button onClick={finish} aria-label="取消" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)] md:h-9 md:w-9">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode === "colors" && (
        <div className="flex items-center justify-around gap-2 px-2">
          {COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() => highlight(color.id)}
              aria-label={`用${color.id}划线`}
              className="flex h-11 w-11 items-center justify-center"
            >
              <span className={`h-7 w-7 rounded-full border-2 ${color.className}`} />
            </button>
          ))}
          <button onClick={() => setMode("actions")} aria-label="返回" className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode === "note" && (
        <div className="w-full p-1 md:w-72">
          <p className="mb-1 line-clamp-2 border-l-2 border-[var(--primary)] pl-2 text-xs text-[var(--muted-foreground)]">{selectedText}</p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="写下你的想法…"
            rows={3}
            autoFocus
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button onClick={() => setMode("actions")} className="min-h-9 rounded-md px-3 text-sm hover:bg-[var(--accent)]">取消</button>
            <button onClick={() => highlight("yellow")} className="min-h-9 rounded-md bg-[var(--primary)] px-3 text-sm text-[var(--primary-foreground)]">保存批注</button>
          </div>
        </div>
      )}
    </div>
  );
}
