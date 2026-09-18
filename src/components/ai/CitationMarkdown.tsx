"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SourceRef } from "@/lib/api-client-v2";
import { CITE_PREFIX, linkifyCitations } from "@/lib/text/citations";

interface Props {
  content: string;
  sources?: SourceRef[];
  onCite?: (source: SourceRef) => void;
}

/**
 * Markdown for AI answers in which [c481] / [w2] become chips: a passage chip
 * jumps to the text it cites, a web chip opens the page.
 */
export function CitationMarkdown({ content, sources = [], onCite }: Props) {
  const linked = useMemo(() => linkifyCitations(content), [content]);
  const byId = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-[var(--foreground)] prose-p:leading-relaxed prose-li:leading-relaxed prose-code:rounded prose-code:bg-[var(--accent)] prose-code:px-1 prose-code:text-xs prose-pre:rounded-lg prose-pre:bg-[var(--accent)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (!href?.startsWith(CITE_PREFIX)) {
              return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
            }
            const source = byId.get(href.slice(CITE_PREFIX.length));
            // A marker the model invented: show nothing rather than a dead chip.
            if (!source) return null;
            const label = source.kind === "web"
              ? source.site || "网页"
              : source.chapterTitle || `第${(source.chapterIndex ?? 0) + 1}章`;
            const className =
              "not-prose mx-0.5 inline-flex max-w-[12rem] cursor-pointer items-center gap-1 truncate rounded-full border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 align-baseline text-[11px] font-normal text-[var(--primary)] no-underline hover:bg-[var(--primary)]/10";
            if (source.kind === "web") {
              return <a href={source.url} target="_blank" rel="noreferrer noopener" title={source.title} className={className}>↗ {label}</a>;
            }
            return (
              <button type="button" title={source.preview} onClick={() => onCite?.(source)} className={className}>
                ¶ {label}
              </button>
            );
          },
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}
