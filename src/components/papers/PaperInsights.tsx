"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-client-v2";
import { waitForJob } from "@/lib/api-knowledge";
import {
  apiDismissPaperLink, apiGetPaperAnalysis, apiReanalyzePaper, LINK_LABELS,
  type AnalysisItem, type PaperAnalysisData, type PaperLinkView, type PaperView,
} from "@/lib/api-papers";

const LINK_STYLE: Record<string, string> = {
  AGREES: "bg-green-500/10 text-green-700 dark:text-green-400",
  CONTRADICTS: "bg-red-500/10 text-red-700 dark:text-red-400",
  EXTENDS: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  CITES: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

/** What a link rests on, in a sentence. */
function evidenceText(link: PaperLinkView, thisPaperId: number) {
  const e = link.evidence;
  if (e.explanation) return e.explanation;
  if (e.nodes?.length) return e.nodes.map((node) => node.name).slice(0, 6).join("、");
  if (e.similarity) return `全文语义相似度 ${Math.round(e.similarity * 100)}%`;
  if (e.cited) return e.cited === thisPaperId ? "对方引用了本文" : "本文引用了对方";
  return e.note ?? "";
}

/**
 * The AI's structured reading of the paper — question, methods, data,
 * findings, limitations — each linked to the page it was read from, and the
 * other papers in the library this one relates to.
 */
export function PaperInsights({ paper, onGoToPage }: { paper: PaperView; onGoToPage: (page: number) => void }) {
  const [analysis, setAnalysis] = useState<PaperAnalysisData | null>(null);
  const [links, setLinks] = useState<PaperLinkView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiGetPaperAnalysis(paper.id);
      setAnalysis(data.analysis?.data ?? null);
      setLinks(data.links);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "无法读取精读结果"));
    } finally {
      setLoaded(true);
    }
  }, [paper.id]);
  // Reload when background processing moves on: the reading appears by itself.
  useEffect(() => { void load(); }, [load, paper.stage]);

  async function reanalyze() {
    setBusy(true);
    setError("");
    try {
      const { job } = await apiReanalyzePaper(paper.id);
      const done = await waitForJob(job.id);
      if (done.status === "FAILED") setError(done.error ? `精读失败：${done.error.slice(0, 100)}` : "精读失败，请重试");
      await load();
    } catch (e) {
      setError(errorMessage(e, "无法开始精读"));
    } finally {
      setBusy(false);
    }
  }

  const Item = ({ item }: { item: AnalysisItem }) => (
    <li className="rounded-md bg-[var(--accent)] px-2.5 py-2">
      {item.name && <p className="font-medium">{item.name}</p>}
      <p>{item.text}</p>
      {item.page && (
        <button onClick={() => onGoToPage(item.page!)} className="mt-1 text-xs text-[var(--primary)] underline" title={item.quote ?? undefined}>
          第 {item.page} 页 →
        </button>
      )}
    </li>
  );
  const Section = ({ title, items }: { title: string; items: AnalysisItem[] }) =>
    items.length ? (
      <section>
        <h3 className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">{title}</h3>
        <ul className="space-y-1.5">{items.map((item, i) => <Item key={i} item={item} />)}</ul>
      </section>
    ) : null;

  if (!loaded) return <p className="flex items-center gap-2 p-4 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />读取中…</p>;
  const working = busy || paper.stage === "ANALYZING" || paper.stage === "LINKING";

  return (
    <div className="space-y-4 p-3 text-sm">
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {!analysis ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center">
          <p className="mb-3 text-[var(--muted-foreground)]">
            {working ? "AI 正在精读这篇文献…" : paper.processing ? "文字提取完成后会自动精读。" : paper.stageError ?? "还没有精读结果。"}
          </p>
          {!paper.processing && <Button size="sm" onClick={reanalyze} disabled={working} className="gap-1">{working && <Loader2 className="h-4 w-4 animate-spin" />}开始精读</Button>}
        </div>
      ) : (
        <>
          {analysis.researchQuestion && <Section title="研究问题" items={[analysis.researchQuestion]} />}
          <Section title="方法" items={analysis.methods} />
          <Section title="数据 / 样本" items={analysis.datasets} />
          <Section title="主要发现" items={analysis.findings} />
          <Section title="局限" items={analysis.limitations} />
          {analysis.keywords.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">关键词</h3>
              <div className="flex flex-wrap gap-1">{analysis.keywords.map((k) => <span key={k} className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs">{k}</span>)}</div>
            </section>
          )}
        </>
      )}

      <section>
        <h3 className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">与库中其他文献的关联（{links.length}）</h3>
        {links.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">暂时没有。库里的文献越多，这里越有用：相同的方法、数据、结论，以及谁引用了谁，都会自动连起来。</p>
        ) : (
          <ul className="space-y-1.5">
            {links.map((link) => (
              <li key={link.id} className="rounded-md border border-[var(--border)] p-2">
                <div className="flex items-start gap-1.5">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${LINK_STYLE[link.type] ?? "bg-[var(--accent)] text-[var(--muted-foreground)]"}`}>{LINK_LABELS[link.type]}</span>
                  <Link href={`/papers/${link.other.id}`} className="min-w-0 flex-1 text-sm leading-snug hover:underline">
                    <span className="line-clamp-2">{link.other.title}</span>
                  </Link>
                  <button
                    aria-label="这条关联不对，移除"
                    title="这条关联不对，移除"
                    onClick={async () => { try { await apiDismissPaperLink(link.id); setLinks((list) => list.filter((l) => l.id !== link.id)); } catch (e) { setError(errorMessage(e)); } }}
                    className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{evidenceText(link, paper.id)}</p>
                {link.evidence.findings && (
                  <div className="mt-1.5 space-y-1 border-l-2 border-[var(--border)] pl-2 text-xs">
                    <p><span className="text-[var(--muted-foreground)]">本文：</span>{link.evidence.findings[String(paper.id)]}</p>
                    <p><span className="text-[var(--muted-foreground)]">对方：</span>{link.evidence.findings[String(link.other.id)]}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {analysis && !paper.processing && (
        <button onClick={reanalyze} disabled={working} className="flex min-h-9 items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${working ? "animate-spin" : ""}`} />{working ? "精读中…" : "重新精读并刷新关联"}
        </button>
      )}
    </div>
  );
}
