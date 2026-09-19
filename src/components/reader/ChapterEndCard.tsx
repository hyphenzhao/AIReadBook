"use client";

import { FileText } from "lucide-react";
import { KnowledgeActions } from "@/components/ai/KnowledgeActions";
import { useReadingStore } from "@/stores/reading-store";
import { useUIStore } from "@/stores/ui-store";

/**
 * Sits in the text flow where a chapter ends — the moment a reader naturally
 * wants to consolidate — instead of being tucked away in the side panel.
 */
export function ChapterEndCard({ bookId, chapterId }: { bookId: string; chapterId: string }) {
  const setAiMode = useReadingStore((s) => s.setAiMode);

  return (
    <section className="not-prose mt-10 rounded-xl border border-dashed border-[var(--border)] p-4">
      <p className="mb-3 text-sm text-[var(--muted-foreground)]">读完这一章了。趁印象还新：</p>
      <button
        onClick={() => {
          setAiMode("summary");
          useUIStore.setState({ rightPanelOpen: true });
        }}
        className="mb-1.5 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--accent)]"
      >
        <FileText className="h-3.5 w-3.5" />看本章摘要，并就本章提问
      </button>
      <KnowledgeActions bookId={bookId} chapterId={chapterId} />
    </section>
  );
}
