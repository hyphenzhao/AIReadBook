"use client";

import { useEffect, useRef, useState } from "react";
import { useCompletion } from "@ai-sdk/react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CitationMarkdown } from "@/components/ai/CitationMarkdown";
import { apiGetChapterSummary, errorMessage, type SourceRef } from "@/lib/api-client-v2";

function errorText(error: Error) {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {}
  return error.message || "生成摘要失败";
}

/**
 * The chapter's summary: shown from cache when there is one, generated (and
 * then cached on the server) when there is not.
 */
export function SummaryView({ chapterId, chapterLabel, onCite, onAskAbout }: {
  chapterId: string;
  chapterLabel: string;
  onCite?: (source: SourceRef) => void;
  /** Called with a key point the reader wants to question. */
  onAskAbout?: (point: string) => void;
}) {
  const [cached, setCached] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { completion, complete, isLoading, error, setCompletion, stop } = useCompletion({
    api: "/api/summary",
    body: { chapterId },
  });

  // Reset and look for a cached summary whenever the chapter changes.
  const requested = useRef("");
  useEffect(() => {
    requested.current = chapterId;
    stop();
    setCompletion("");
    setCached(null);
    setLoadError("");
    setLoading(true);
    apiGetChapterSummary(chapterId)
      .then((data) => {
        if (requested.current !== chapterId) return;
        setCached(data.summary);
        setSources(data.sources);
      })
      .catch((e) => requested.current === chapterId && setLoadError(errorMessage(e, "无法读取摘要")))
      .finally(() => requested.current === chapterId && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const text = completion || cached || "";
  const generate = () => { setCached(null); void complete(""); };

  // The "关键要点" bullets double as one-tap follow-up questions.
  const points = text
    .split(/^##\s*关键要点\s*$/m)[1]
    ?.split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").replace(/\[[cw]\d+\]/g, "").trim())
    .filter((line) => line.length > 4) ?? [];

  if (loading) {
    return <p className="flex items-center gap-2 p-4 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />读取摘要…</p>;
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-medium">{chapterLabel} · 摘要</h3>
        {text && !isLoading && (
          <button type="button" onClick={generate} className="flex min-h-8 shrink-0 items-center gap-1 rounded px-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
            <RefreshCw className="h-3 w-3" />重新生成
          </button>
        )}
      </div>

      {(error || loadError) && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {error ? errorText(error) : loadError}
        </p>
      )}

      {text ? (
        <div className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm">
          <CitationMarkdown content={text} sources={sources} onCite={onCite} />
          {isLoading && <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]" />}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
          <p className="mb-3 text-sm text-[var(--muted-foreground)]">本章还没有摘要。生成一次后会保存，下次直接显示。</p>
          <Button onClick={generate} disabled={isLoading} className="gap-2">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成本章摘要
          </Button>
        </div>
      )}

      {!isLoading && points.length > 0 && onAskAbout && (
        <div>
          <p className="mb-1.5 text-xs text-[var(--muted-foreground)]">对哪一点有疑问？</p>
          <div className="flex flex-col gap-1">
            {points.slice(0, 6).map((point) => (
              <button
                key={point}
                type="button"
                onClick={() => onAskAbout(point)}
                className="min-h-9 rounded border border-[var(--border)] px-2.5 py-1.5 text-left text-xs hover:bg-[var(--accent)]"
              >
                <span className="line-clamp-2">{point}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
