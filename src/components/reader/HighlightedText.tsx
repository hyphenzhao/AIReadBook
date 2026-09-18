"use client";

import { useMemo } from "react";
import type { Annotation } from "@/stores/annotation-store";

const COLORS: Record<string, string> = {
  yellow: "bg-yellow-200 dark:bg-yellow-900/40",
  green: "bg-green-200 dark:bg-green-900/40",
  blue: "bg-blue-200 dark:bg-blue-900/40",
  pink: "bg-pink-200 dark:bg-pink-900/40",
  orange: "bg-orange-200 dark:bg-orange-900/40",
};

interface HighlightedTextProps {
  text: string;
  annotations: Annotation[];
}

/**
 * Renders chapter text with highlights applied based on stored annotations.
 * Uses simple string matching — exact substring lookup.
 */
export function HighlightedText({ text, annotations }: HighlightedTextProps) {
  const segments = useMemo(() => {
    if (!annotations.length) return [{ text, color: null, note: null as string | null }];

    // Find all match ranges
    interface Match {
      start: number;
      end: number;
      color: string;
      note: string | null;
    }
    const matches: Match[] = [];

    for (const a of annotations) {
      let pos = 0;
      while (pos < text.length) {
        const idx = text.indexOf(a.selectedText, pos);
        if (idx === -1) break;
        matches.push({ start: idx, end: idx + a.selectedText.length, color: a.color, note: a.note || null });
        pos = idx + 1;
      }
    }

    if (matches.length === 0) return [{ text, color: null, note: null }];

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start);

    // Build segments
    const result: { text: string; color: string | null; note: string | null }[] = [];
    let cursor = 0;

    for (const m of matches) {
      if (m.start < cursor) continue; // skip overlapping
      if (m.start > cursor) {
        result.push({ text: text.slice(cursor, m.start), color: null, note: null });
      }
      result.push({ text: text.slice(m.start, m.end), color: m.color, note: m.note });
      cursor = m.end;
    }

    if (cursor < text.length) {
      result.push({ text: text.slice(cursor), color: null, note: null });
    }

    return result;
  }, [text, annotations]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.color ? (
          <mark
            key={i}
            className={`${COLORS[seg.color] || COLORS.yellow} rounded-sm px-0.5`}
            title={seg.note || ""}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
