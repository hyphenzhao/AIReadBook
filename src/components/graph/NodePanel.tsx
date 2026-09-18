"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Merge, Quote, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-client-v2";
import {
  apiDeleteGraphNode, apiGetGraphNode, apiMergeGraphNodes, type GraphNodeDetail, type GraphNodeView,
} from "@/lib/api-knowledge";
import { NODE_TYPE_LABELS } from "@/lib/knowledge/graph-names";
import { TYPE_COLORS } from "@/components/graph/GraphCanvas";

interface Props {
  nodeId: number;
  /** Every node on the canvas, to offer merge targets of the same type. */
  allNodes: GraphNodeView[];
  onClose: () => void;
  onSelect: (id: number) => void;
  /** The graph changed (merge/delete): reload it. */
  onChanged: () => void;
}

/** Everything known about one node: what it is, how it connects, where it was read. */
export function NodePanel({ nodeId, allNodes, onClose, onSelect, onChanged }: Props) {
  const [node, setNode] = useState<GraphNodeDetail | null>(null);
  const [error, setError] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNode(null);
    setError("");
    setMerging(false);
    setMergeTarget("");
    apiGetGraphNode(nodeId)
      .then((data) => !cancelled && setNode(data.node))
      .catch((e) => !cancelled && setError(errorMessage(e, "无法加载节点")));
    return () => { cancelled = true; };
  }, [nodeId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const candidates = node ? allNodes.filter((other) => other.type === node.type && other.id !== node.id) : [];

  return (
    <aside className="flex h-full flex-col bg-[var(--background)]">
      <div className="flex items-start gap-2 border-b border-[var(--border)] p-3">
        <div className="min-w-0 flex-1">
          {node ? (
            <>
              <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[node.type] ?? "#64748b" }} />
                {NODE_TYPE_LABELS[node.type] ?? node.type}
              </p>
              <h2 className="truncate text-lg font-semibold">{node.name}</h2>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />加载中…</p>
          )}
        </div>
        <button onClick={onClose} aria-label="关闭" className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && <p role="alert" className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {node && (
        <div className="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
          {node.description && <p>{node.description}</p>}
          {node.aliases.length > 0 && (
            <p className="text-xs text-[var(--muted-foreground)]">又称：{node.aliases.join("、")}</p>
          )}

          {node.relations.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">关系（{node.relations.length}）</h3>
              <ul className="space-y-1">
                {node.relations.map((relation) => (
                  <li key={`${relation.edgeId}-${relation.direction}`}>
                    <button onClick={() => onSelect(relation.other.id)} className="flex min-h-9 w-full items-center gap-1.5 rounded px-2 text-left hover:bg-[var(--accent)]">
                      {relation.direction === "out" ? (
                        <>
                          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{relation.relation}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
                          <span className="truncate">{relation.other.name}</span>
                        </>
                      ) : (
                        <>
                          <span className="truncate">{relation.other.name}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
                          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{relation.relation}</span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">出处（{node.mentions.length}）</h3>
            <ul className="space-y-2">
              {node.mentions.map((mention) => {
                const canJump = mention.bookId && mention.chapterId && mention.charStart !== null;
                return (
                  <li key={mention.id} className="rounded-md border-l-2 border-[var(--primary)] bg-[var(--accent)] px-2.5 py-2">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      《{mention.bookTitle}》{mention.chapterLabel ? ` · ${mention.chapterLabel}` : ""}
                    </p>
                    {mention.quote ? (
                      <p className="mt-1"><Quote className="mr-1 inline h-3 w-3 text-[var(--primary)]" />{mention.quote}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">本章提到了它，但 AI 给出的引句在原文中没有找到。</p>
                    )}
                    {canJump && (
                      <Link
                        href={`/read/${mention.bookId}?chapter=${mention.chapterId}&from=${mention.charStart}&to=${mention.charEnd}`}
                        className="mt-1 inline-block text-xs text-[var(--primary)] underline"
                      >
                        回到原文 →
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="border-t border-[var(--border)] pt-3">
            {merging ? (
              <div className="space-y-2">
                <label htmlFor="merge-target" className="block text-xs text-[var(--muted-foreground)]">
                  把「{node.name}」并入同类型的另一个节点（出处、关系和别名都会转移过去）：
                </label>
                <select
                  id="merge-target"
                  value={mergeTarget}
                  onChange={(e) => setMergeTarget(e.target.value)}
                  className="h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
                >
                  <option value="">选择目标节点…</option>
                  {candidates.map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!mergeTarget || busy} onClick={() => run(() => apiMergeGraphNodes(node.id, Number(mergeTarget)))}>确认合并</Button>
                  <Button size="sm" variant="outline" onClick={() => setMerging(false)}>取消</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1" disabled={candidates.length === 0} onClick={() => setMerging(true)}>
                  <Merge className="h-3.5 w-3.5" />与另一节点合并
                </Button>
                <Button
                  size="sm" variant="outline" className="gap-1 text-red-600" disabled={busy}
                  onClick={() => window.confirm(`从图谱中删除「${node.name}」及其所有关系？`) && run(() => apiDeleteGraphNode(node.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />删除
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}
