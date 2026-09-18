"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Globe } from "lucide-react";
import type { SourceRef } from "@/lib/api-client-v2";

export interface SourcesAnnotation {
  type: "sources";
  tier: "chapter" | "book" | "overview" | "none";
  webSearched: boolean;
  sources: SourceRef[];
}

export function sourcesOf(annotations: unknown): SourcesAnnotation | null {
  if (!Array.isArray(annotations)) return null;
  const found = annotations.find((item) => item && typeof item === "object" && (item as any).type === "sources");
  return found ? (found as SourcesAnnotation) : null;
}

const TIER_LABEL = { chapter: "本章", book: "全书", overview: "全书概览", none: "未找到原文" } as const;

/** One line saying what the answer rests on; expands to the passages themselves. */
export function SourcesStrip({ data, currentChapterId, onCite }: {
  data: SourcesAnnotation;
  currentChapterId: string | null;
  onCite?: (source: SourceRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const passages = data.sources.filter((source) => source.kind === "passage");
  const web = data.sources.filter((source) => source.kind === "web");
  const here = passages.filter((source) => String(source.chapterId) === currentChapterId).length;

  const parts = [
    here ? `本章 ${here} 段` : "",
    passages.length - here ? `其他章节 ${passages.length - here} 段` : "",
    web.length ? `网络 ${web.length} 条` : data.webSearched ? "联网无结果" : "",
  ].filter(Boolean);
  const summary = parts.length ? parts.join(" · ") : TIER_LABEL[data.tier];

  return (
    <div className="mb-2 rounded-md border border-[var(--border)] bg-[var(--background)]/60 text-[11px] text-[var(--muted-foreground)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={!data.sources.length}
        className="flex min-h-8 w-full items-center gap-1.5 px-2 py-1 text-left"
        aria-expanded={open}
      >
        <BookOpen className="h-3 w-3 shrink-0" />
        <span className="truncate">依据：{summary}</span>
        {data.sources.length > 0 && <ChevronDown className={`ml-auto h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <ul className="max-h-56 space-y-1 overflow-y-auto border-t border-[var(--border)] p-1.5">
          {data.sources.map((source) => (
            <li key={source.id}>
              {source.kind === "web" ? (
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="block rounded p-1.5 hover:bg-[var(--accent)]">
                  <span className="flex items-center gap-1 text-[var(--primary)]"><Globe className="h-3 w-3" />{source.site}</span>
                  <span className="line-clamp-1 text-[var(--foreground)]">{source.title}</span>
                  <span className="line-clamp-2">{source.preview}</span>
                </a>
              ) : (
                <button type="button" onClick={() => onCite?.(source)} className="block w-full rounded p-1.5 text-left hover:bg-[var(--accent)]">
                  <span className="text-[var(--primary)]">¶ {source.chapterTitle}</span>
                  <span className="line-clamp-2">{source.preview}…</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
