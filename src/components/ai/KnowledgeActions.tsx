"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Layers, Loader2, Network } from "lucide-react";
import { errorMessage } from "@/lib/api-client-v2";
import { apiExtractGraph, apiGenerateCards, waitForJob } from "@/lib/api-knowledge";

type Status = { kind: "busy" | "ok" | "error"; text: string; href?: string; linkLabel?: string } | null;

const STAGE_LABELS: Record<string, string> = {
  reading: "读取章节",
  extracting: "AI 抽取实体与关系",
  embedding: "比对已有节点",
  merging: "并入图谱",
  linking: "建立关系",
};

/**
 * The two "turn this chapter into knowledge" actions that replaced the old
 * 提取 mode: knowledge cards, and merging the chapter into the knowledge graph.
 */
export function KnowledgeActions({ bookId, chapterId }: { bookId: string; chapterId: string | null }) {
  const [cards, setCards] = useState<Status>(null);
  const [graph, setGraph] = useState<Status>(null);

  // Results belong to the chapter they were made for.
  const current = useRef(chapterId);
  useEffect(() => {
    current.current = chapterId;
    setCards(null);
    setGraph(null);
  }, [chapterId]);

  async function generateCards() {
    if (!chapterId) return;
    const forChapter = chapterId;
    setCards({ kind: "busy", text: "正在生成知识卡片…" });
    try {
      const result = await apiGenerateCards(forChapter);
      if (current.current !== forChapter) return;
      setCards({
        kind: "ok",
        text: result.created ? `已生成 ${result.created} 张卡片` : "本章的卡片已经生成过了",
        href: `/read/${bookId}/knowledge`,
        linkLabel: "查看",
      });
    } catch (error) {
      if (current.current === forChapter) setCards({ kind: "error", text: errorMessage(error, "生成失败，请重试") });
    }
  }

  async function addToGraph() {
    if (!chapterId) return;
    const forChapter = chapterId;
    setGraph({ kind: "busy", text: "已加入队列…" });
    try {
      const { job } = await apiExtractGraph(forChapter);
      const done = await waitForJob(job.id, (update) => {
        if (current.current !== forChapter || update.status !== "RUNNING") return;
        setGraph({ kind: "busy", text: `${STAGE_LABELS[update.stage ?? ""] ?? "处理中"}… ${update.progress}%` });
      });
      if (current.current !== forChapter) return;
      if (done.status === "DONE") {
        const counts = done.stage?.match(/(\d+) nodes, (\d+) relations/);
        setGraph({
          kind: "ok",
          text: counts ? `已并入图谱：${counts[1]} 个节点、${counts[2]} 条关系` : "已并入知识图谱",
          href: `/graph?bookId=${bookId}`,
          linkLabel: "打开图谱",
        });
      } else {
        setGraph({ kind: "error", text: done.error ? `抽取失败：${done.error.slice(0, 80)}` : "抽取失败，请重试" });
      }
    } catch (error) {
      if (current.current === forChapter) setGraph({ kind: "error", text: errorMessage(error, "无法加入图谱") });
    }
  }

  const button =
    "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--accent)] disabled:opacity-50";

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <button type="button" onClick={generateCards} disabled={!chapterId || cards?.kind === "busy"} className={button} title="由 AI 从本章提炼若干知识条目">
          {cards?.kind === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
          生成知识卡片
        </button>
        <button type="button" onClick={addToGraph} disabled={!chapterId || graph?.kind === "busy"} className={button} title="抽取本章的人物、概念和关系，自动并入你的知识图谱">
          {graph?.kind === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Network className="h-3.5 w-3.5" />}
          加入知识图谱
        </button>
      </div>
      {[cards, graph].map((status, i) =>
        status ? (
          <p
            key={i}
            role="status"
            className={`flex items-center gap-2 text-[11px] ${
              status.kind === "error" ? "text-red-500" : status.kind === "ok" ? "text-green-600" : "text-[var(--muted-foreground)]"
            }`}
          >
            <span className="min-w-0 truncate">{status.text}</span>
            {status.href && <Link href={status.href} className="shrink-0 underline">{status.linkLabel}</Link>}
          </p>
        ) : null,
      )}
    </div>
  );
}
