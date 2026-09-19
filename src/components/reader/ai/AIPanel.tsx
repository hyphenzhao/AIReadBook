"use client";

import { useCallback, useMemo } from "react";
import { AssistantPanel, type AssistantContext } from "@/components/ai/AssistantPanel";
import { useReadingStore } from "@/stores/reading-store";
import type { SourceRef } from "@/lib/api-client-v2";

/** Binds the generic assistant to the book reader's state. */
export function AIPanel() {
  const { aiMode, setAiMode, currentBook, currentChapter, pendingAskAI, clearAskAI, jumpToPassage } = useReadingStore();

  const context = useMemo<AssistantContext | null>(() => {
    if (!currentBook) return null;
    return {
      bookId: currentBook.id,
      bookTitle: currentBook.title,
      unitId: currentChapter?.id ?? null,
      unitIndex: currentChapter?.index ?? null,
      unitLabel: currentChapter?.title || (currentChapter ? `第${currentChapter.index + 1}章` : "未选择章节"),
    };
  }, [currentBook, currentChapter]);

  const handleCite = useCallback((source: SourceRef) => {
    if (source.kind !== "passage" || source.chapterId == null) return;
    jumpToPassage({
      chapterId: String(source.chapterId),
      charStart: source.charStart ?? 0,
      charEnd: source.charEnd ?? 0,
    });
  }, [jumpToPassage]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AssistantPanel
        context={context}
        mode={aiMode}
        onModeChange={setAiMode}
        pendingSelection={pendingAskAI}
        onSelectionConsumed={clearAskAI}
        onCite={handleCite}
      />
    </div>
  );
}
