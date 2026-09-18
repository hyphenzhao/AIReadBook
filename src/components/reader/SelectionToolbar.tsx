"use client";

import { useState, useRef, useEffect } from "react";
import { Highlighter, MessageCircle, X } from "lucide-react";
import { useAnnotationStore } from "@/stores/annotation-store";
import { useReadingStore } from "@/stores/reading-store";

const COLORS = ["yellow", "green", "blue", "pink", "orange"] as const;

interface SelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number };
  onClose: () => void;
}

export function SelectionToolbar({ selectedText, position, onClose }: SelectionToolbarProps) {
  const [showColors, setShowColors] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [selectedColor, setSelectedColor] = useState<(typeof COLORS)[number]>("yellow");
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const { currentBook, currentChapter } = useReadingStore();

  function handleHighlight(color: (typeof COLORS)[number]) {
    if (!currentBook) return;
    addAnnotation({
      bookId: currentBook.id,
      chapterId: currentChapter?.id ?? null,
      selectedText,
      note: note.trim() || "",
      color,
      tags: [],
    });
    onClose();
  }

  function handleAskAI() {
    useReadingStore.getState().triggerAskAI(selectedText);
    onClose();
  }

  // Position the toolbar near the selection
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(8, Math.min(position.x - 100, window.innerWidth - 208)),
    top: Math.max(8, position.y - 50),
    zIndex: 100,
  };

  return (
    <div
      style={style}
      className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="rounded p-1 hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Highlight button */}
      <button
        onClick={() => setShowColors(!showColors)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[var(--accent)]"
      >
        <Highlighter className="h-3.5 w-3.5" />
        划线
      </button>

      {/* Color picker */}
      {showColors && (
        <div className="flex gap-1 border-l border-[var(--border)] pl-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setSelectedColor(c); handleHighlight(c); }}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
                c === "yellow"
                  ? "bg-yellow-300 border-yellow-400"
                  : c === "green"
                    ? "bg-green-300 border-green-400"
                    : c === "blue"
                      ? "bg-blue-300 border-blue-400"
                      : c === "pink"
                        ? "bg-pink-300 border-pink-400"
                        : "bg-orange-300 border-orange-400"
              }`}
              title={c}
            />
          ))}
        </div>
      )}

      {/* Note toggle */}
      <button
        onClick={() => setShowNote(!showNote)}
        className="rounded px-2 py-1 text-xs hover:bg-[var(--accent)]"
      >
        批注
      </button>

      {/* Ask AI button */}
      <button
        onClick={handleAskAI}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-[var(--accent)] text-[var(--primary)]"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        问AI
      </button>

      {/* Note input */}
      {showNote && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="添加批注..."
            className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
            rows={2}
            autoFocus
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              onClick={() => setShowNote(false)}
              className="rounded px-2 py-0.5 text-xs hover:bg-[var(--accent)]"
            >
              取消
            </button>
            <button
              onClick={() => {
                handleHighlight(selectedColor);
                setShowNote(false);
              }}
              className="rounded bg-[var(--primary)] px-2 py-0.5 text-xs text-white"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
