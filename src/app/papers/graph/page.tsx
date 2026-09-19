"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Loader2, Network, X } from "lucide-react";
import { NodePanel } from "@/components/graph/NodePanel";
import { errorMessage } from "@/lib/api-client-v2";
import { apiGetGraph, type GraphView } from "@/lib/api-knowledge";
import { apiDismissPaperLink, apiGetPaperRelations, LINK_LABELS, type PaperLinkType, type PaperRelationGraph } from "@/lib/api-papers";
import { NODE_TYPE_LABELS } from "@/lib/knowledge/graph-names";
import type { CanvasEdge, CanvasNode } from "@/components/graph/GraphCanvas";

const GraphCanvas = dynamic(() => import("@/components/graph/GraphCanvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <p className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">正在准备画布…</p>,
});

type View = "relations" | "knowledge";
const TYPE_DOT: Record<string, string> = { paper: "#334155", keyword: "#4f7cf0", method: "#2fa37a", dataset: "#0ea5b7", conclusion: "#d2475f" };
const TONE: Partial<Record<PaperLinkType, "agree" | "contradict">> = { AGREES: "agree", EXTENDS: "agree", CONTRADICTS: "contradict" };
// Strongest statement first: what two papers conclude outranks what they share.
const RANK: PaperLinkType[] = ["CONTRADICTS", "AGREES", "EXTENDS", "CITES", "SHARED_METHOD", "SHARED_DATASET", "SHARED_KEYWORD", "SIMILAR"];

const shortTitle = (title: string) => (title.length > 34 ? `${title.slice(0, 32)}…` : title);

export default function PapersGraphPage() {
  const [view, setView] = useState<View>("relations");
  const [relations, setRelations] = useState<PaperRelationGraph | null>(null);
  const [knowledge, setKnowledge] = useState<GraphView | null>(null);
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState<Set<PaperLinkType>>(new Set(["SIMILAR"]));
  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [rel, know] = await Promise.all([apiGetPaperRelations(collectionId ?? undefined), apiGetGraph({ scope: "PAPER" })]);
      setRelations(rel);
      setKnowledge(know);
      setError("");
    } catch (e) {
      setError(errorMessage(e, "无法加载文献图谱"));
    }
  }, [collectionId]);
  useEffect(() => { void load(); }, [load]);

  // Relations view: one edge per pair of papers, carrying all their links.
  const pairs = useMemo(() => {
    const map = new Map<string, PaperRelationGraph["links"]>();
    for (const link of relations?.links ?? []) {
      if (hiddenLinkTypes.has(link.type)) continue;
      const key = `${link.paperAId}-${link.paperBId}`;
      map.set(key, [...(map.get(key) ?? []), link]);
    }
    for (const links of map.values()) links.sort((a, b) => RANK.indexOf(a.type) - RANK.indexOf(b.type));
    return map;
  }, [relations, hiddenLinkTypes]);

  const canvas = useMemo<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>(() => {
    if (view === "relations") {
      const degree = new Map<number, number>();
      for (const key of pairs.keys()) for (const id of key.split("-").map(Number)) degree.set(id, (degree.get(id) ?? 0) + 1);
      return {
        nodes: (relations?.papers ?? []).map((paper) => ({
          id: `p${paper.id}`, label: `${shortTitle(paper.title)}${paper.year ? ` (${paper.year})` : ""}`, type: "paper", weight: 1 + (degree.get(paper.id) ?? 0),
        })),
        edges: [...pairs.entries()].map(([key, links]) => {
          const [a, b] = key.split("-");
          return {
            id: `pair:${key}`, source: `p${a}`, target: `p${b}`,
            label: links.slice(0, 2).map((link) => LINK_LABELS[link.type]).join(" · "),
            weight: links.reduce((sum, link) => sum + link.score, 0),
            tone: TONE[links[0].type] ?? "neutral",
            directed: false,
          };
        }),
      };
    }
    const visible = (knowledge?.nodes ?? []).filter((node) => !hiddenNodeTypes.has(node.type));
    const ids = new Set(visible.map((node) => node.id));
    return {
      nodes: visible.map((node) => ({ id: String(node.id), label: node.type === "paper" ? shortTitle(node.name) : node.name, type: node.type, weight: node.mentions })),
      edges: (knowledge?.edges ?? []).filter((e) => ids.has(e.srcId) && ids.has(e.dstId))
        .map((e) => ({ id: `e${e.id}`, source: String(e.srcId), target: String(e.dstId), label: e.relation, weight: e.weight })),
    };
  }, [view, relations, knowledge, pairs, hiddenNodeTypes]);

  const pairLinks = selectedPair ? pairs.get(selectedPair) : null;
  const paperById = useMemo(() => new Map((relations?.papers ?? []).map((paper) => [paper.id, paper])), [relations]);
  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };

  const linkTypesPresent = useMemo(() => RANK.filter((type) => relations?.links.some((link) => link.type === type)), [relations]);
  const nodeTypesPresent = useMemo(() => [...new Set(knowledge?.nodes.map((node) => node.type) ?? [])], [knowledge]);
  const empty = view === "relations" ? (relations?.papers.length ?? 0) === 0 : (knowledge?.nodes.length ?? 0) === 0;
  const chip = (active: boolean) => `flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs ${active ? "" : "text-[var(--muted-foreground)] opacity-50"}`;

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)]">
      <header className="shrink-0 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Link href="/papers" aria-label="返回文献库" className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Network className="h-5 w-5" />文献图谱</h1>
          <div className="ml-auto flex rounded-lg border border-[var(--border)] p-0.5 text-sm">
            {([["relations", "文献关系"], ["knowledge", "知识网络"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setView(id); setSelectedNode(null); setSelectedPair(null); }}
                aria-pressed={view === id}
                className={`min-h-9 rounded-md px-3 ${view === id ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--muted-foreground)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "relations" && !!relations?.collections.length && (
            <select
              aria-label="按集合筛选" value={collectionId ?? ""}
              onChange={(event) => { setSelectedPair(null); setCollectionId(Number(event.target.value) || null); }}
              className="h-10 max-w-[40vw] rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
            >
              <option value="">全部文献</option>
              {relations.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
          {view === "relations"
            ? linkTypesPresent.map((type) => (
                <button key={type} onClick={() => setHiddenLinkTypes(toggle(hiddenLinkTypes, type))} aria-pressed={!hiddenLinkTypes.has(type)} className={chip(!hiddenLinkTypes.has(type))}>
                  <span className={`h-0.5 w-4 ${type === "CONTRADICTS" ? "border-t-2 border-dashed border-[#d2475f]" : type === "AGREES" || type === "EXTENDS" ? "bg-[#2fa37a]" : "bg-[var(--muted-foreground)]"}`} />
                  {LINK_LABELS[type]}
                </button>
              ))
            : nodeTypesPresent.map((type) => (
                <button key={type} onClick={() => setHiddenNodeTypes(toggle(hiddenNodeTypes, type))} aria-pressed={!hiddenNodeTypes.has(type)} className={chip(!hiddenNodeTypes.has(type))}>
                  <span className="h-2 w-2 rounded-full" style={{ background: TYPE_DOT[type] ?? "#64748b" }} />{NODE_TYPE_LABELS[type] ?? type}
                </button>
              ))}
          <span className="ml-auto flex shrink-0 items-center text-xs text-[var(--muted-foreground)]">{canvas.nodes.length} 个节点 · {canvas.edges.length} 条连线</span>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {error ? (
          <p role="alert" className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>
        ) : !relations || !knowledge ? (
          <p className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />加载中…</p>
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Network className="mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">{view === "relations" ? "文献库还是空的" : "还没有精读过的文献"}</h2>
            <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">
              上传文献后，AI 会读出每篇的研究问题、方法、数据和结论，并自动找出文献之间的联系：谁和谁用了同一种方法、谁的结论一致或相左、谁引用了谁。
            </p>
          </div>
        ) : (
          <GraphCanvas
            nodes={canvas.nodes}
            edges={canvas.edges}
            selectedId={view === "knowledge" && selectedNode ? String(selectedNode) : null}
            onSelectNode={(id) => {
              setSelectedPair(null);
              if (!id) { setSelectedNode(null); return; }
              if (view === "relations") window.location.assign(`/papers/${id.slice(1)}`);
              else setSelectedNode(Number(id));
            }}
            onSelectEdge={(id) => { if (id.startsWith("pair:")) { setSelectedNode(null); setSelectedPair(id.slice(5)); } }}
          />
        )}

        {(selectedNode || pairLinks) && (
          <div className="absolute inset-x-0 bottom-0 z-10 h-[55%] border-t border-[var(--border)] bg-[var(--background)] shadow-xl md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-96 md:border-l md:border-t-0">
            {selectedNode && knowledge ? (
              <NodePanel nodeId={selectedNode} allNodes={knowledge.nodes} onClose={() => setSelectedNode(null)} onSelect={setSelectedNode} onChanged={load} />
            ) : pairLinks && selectedPair ? (
              <PairPanel
                pairKey={selectedPair} links={pairLinks} paperById={paperById}
                onClose={() => setSelectedPair(null)}
                onDismiss={async (linkId) => { try { await apiDismissPaperLink(linkId); await load(); } catch (e) { setError(errorMessage(e)); } }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** Why two papers are connected: every link between them, with its evidence. */
function PairPanel({ pairKey, links, paperById, onClose, onDismiss }: {
  pairKey: string;
  links: PaperRelationGraph["links"];
  paperById: Map<number, PaperRelationGraph["papers"][number]>;
  onClose: () => void;
  onDismiss: (linkId: number) => void;
}) {
  const [a, b] = pairKey.split("-").map(Number);
  return (
    <aside className="flex h-full flex-col">
      <div className="flex items-start gap-2 border-b border-[var(--border)] p-3">
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          {[a, b].map((id) => (
            <Link key={id} href={`/papers/${id}`} className="block font-medium leading-snug hover:underline">
              <span className="line-clamp-2">{paperById.get(id)?.title}</span>
            </Link>
          ))}
        </div>
        <button onClick={onClose} aria-label="关闭" className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]"><X className="h-4 w-4" /></button>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {links.map((link) => (
          <li key={link.id} className="rounded-md border border-[var(--border)] p-2.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{LINK_LABELS[link.type]}</span>
              <span className="text-xs text-[var(--muted-foreground)]">{link.origin === "LLM" ? "AI 比对结论" : link.origin === "USER" ? "手动添加" : "自动发现"}</span>
              <button onClick={() => onDismiss(link.id)} className="ml-auto min-h-8 rounded px-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--accent)]">不对，移除</button>
            </div>
            {link.evidence.explanation && <p className="mt-1">{link.evidence.explanation}</p>}
            {link.evidence.findings && (
              <div className="mt-1.5 space-y-1.5 border-l-2 border-[var(--border)] pl-2 text-xs">
                {[a, b].map((id) => (
                  <p key={id}><span className="text-[var(--muted-foreground)]">{paperById.get(id)?.authors[0]?.split(" ").pop() ?? "文献"} {paperById.get(id)?.year}：</span>{link.evidence.findings![String(id)]}</p>
                ))}
              </div>
            )}
            {link.evidence.nodes && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{link.evidence.nodes.map((node) => node.name).join("、")}</p>}
            {link.evidence.similarity && <p className="mt-1 text-xs text-[var(--muted-foreground)]">全文语义相似度 {Math.round(link.evidence.similarity * 100)}%</p>}
            {link.evidence.cited && <p className="mt-1 text-xs text-[var(--muted-foreground)]">「{shortTitle(paperById.get(link.evidence.citing!)?.title ?? "")}」引用了「{shortTitle(paperById.get(link.evidence.cited)?.title ?? "")}」</p>}
            {link.evidence.note && <p className="mt-1 text-xs">{link.evidence.note}</p>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
