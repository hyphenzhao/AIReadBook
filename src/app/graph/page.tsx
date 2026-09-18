"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Loader2, Network, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NodePanel } from "@/components/graph/NodePanel";
import { errorMessage } from "@/lib/api-client-v2";
import { apiGetGraph, type GraphView } from "@/lib/api-knowledge";
import { NODE_TYPE_LABELS } from "@/lib/knowledge/graph-names";
import type { CanvasEdge, CanvasNode } from "@/components/graph/GraphCanvas";

// Cytoscape needs the DOM, so the canvas never renders on the server.
const GraphCanvas = dynamic(() => import("@/components/graph/GraphCanvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <p className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">正在准备画布…</p>,
});

const TYPE_DOT: Record<string, string> = {
  person: "#e0823d", concept: "#4f7cf0", place: "#2fa37a", event: "#d2475f", work: "#8b5cf6", argument: "#c59a1b",
};

export default function GraphPage() {
  const [graph, setGraph] = useState<GraphView | null>(null);
  const [error, setError] = useState("");
  const [bookId, setBookId] = useState<number | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // /graph?bookId=12 opens on one book's part of the graph.
  useEffect(() => {
    const requested = Number(new URLSearchParams(window.location.search).get("bookId"));
    if (Number.isInteger(requested) && requested > 0) setBookId(requested);
  }, []);

  const load = useCallback(async () => {
    try {
      setGraph(await apiGetGraph({ scope: "BOOK", bookId: bookId ?? undefined }));
      setError("");
    } catch (e) {
      setError(errorMessage(e, "无法加载知识图谱"));
    }
  }, [bookId]);
  useEffect(() => { void load(); }, [load]);

  const types = useMemo(() => [...new Set(graph?.nodes.map((node) => node.type) ?? [])], [graph]);

  // Memoized: the canvas rebuilds its layout whenever these arrays change identity.
  const { nodes, edges } = useMemo(() => {
    const visible = (graph?.nodes ?? []).filter((node) => !hiddenTypes.has(node.type));
    const ids = new Set(visible.map((node) => node.id));
    const canvasNodes: CanvasNode[] = visible.map((node) => ({
      id: String(node.id), label: node.name, type: node.type, weight: node.mentions,
    }));
    const canvasEdges: CanvasEdge[] = (graph?.edges ?? [])
      .filter((edge) => ids.has(edge.srcId) && ids.has(edge.dstId))
      .map((edge) => ({ id: `e${edge.id}`, source: String(edge.srcId), target: String(edge.dstId), label: edge.relation, weight: edge.weight }));
    return { nodes: canvasNodes, edges: canvasEdges };
  }, [graph, hiddenTypes]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return (graph?.nodes ?? []).filter((node) => node.name.toLowerCase().includes(term)).slice(0, 8);
  }, [graph, search]);

  const toggleType = (type: string) =>
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)]">
      <header className="shrink-0 border-b border-[var(--border)]">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Link href="/library" aria-label="返回书库" className="flex h-10 w-10 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-semibold"><Network className="h-5 w-5" />知识图谱</h1>

          <select
            value={bookId ?? ""}
            onChange={(e) => { setSelectedId(null); setBookId(e.target.value ? Number(e.target.value) : null); }}
            aria-label="按书筛选"
            className="ml-auto h-10 max-w-[45vw] rounded-md border border-[var(--border)] bg-transparent px-2 text-sm"
          >
            <option value="">全部书籍</option>
            {graph?.books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
          </select>

          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="查找节点…" className="h-10 pl-9" />
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
                {matches.map((node) => (
                  <li key={node.id}>
                    <button
                      onClick={() => { setSelectedId(node.id); setSearch(""); setHiddenTypes((h) => { const n = new Set(h); n.delete(node.type); return n; }); }}
                      className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-[var(--accent)]"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TYPE_DOT[node.type] ?? "#64748b" }} />
                      <span className="truncate">{node.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {types.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
            {types.map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                aria-pressed={!hiddenTypes.has(type)}
                className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs ${
                  hiddenTypes.has(type) ? "border-[var(--border)] text-[var(--muted-foreground)] opacity-50" : "border-[var(--border)]"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: TYPE_DOT[type] ?? "#64748b" }} />
                {NODE_TYPE_LABELS[type] ?? type}
              </button>
            ))}
            <span className="ml-auto flex shrink-0 items-center text-xs text-[var(--muted-foreground)]">
              {nodes.length} 个节点 · {edges.length} 条关系{graph?.truncated ? `（共 ${graph.total} 个，只显示最重要的）` : ""}
            </span>
          </div>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        {error ? (
          <p role="alert" className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">{error}</p>
        ) : graph === null ? (
          <p className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]"><Loader2 className="h-4 w-4 animate-spin" />加载中…</p>
        ) : graph.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Network className="mb-4 h-12 w-12 text-[var(--muted-foreground)]" />
            <h2 className="text-lg font-medium">图谱还是空的</h2>
            <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
              读书时在 AI 面板里点「加入知识图谱」，AI 会抽取当前章节的人物、概念和它们的关系，自动并入这里。读得越多，不同书之间的联系就越清楚。
            </p>
          </div>
        ) : (
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            selectedId={selectedId ? String(selectedId) : null}
            onSelectNode={(id) => setSelectedId(id ? Number(id) : null)}
          />
        )}

        {selectedId && graph && (
          // A side panel on desktop; a bottom sheet on a phone, so the graph stays visible above it.
          <div className="absolute inset-x-0 bottom-0 z-10 h-[55%] border-t border-[var(--border)] shadow-xl md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-96 md:border-l md:border-t-0">
            <NodePanel
              nodeId={selectedId}
              allNodes={graph.nodes}
              onClose={() => setSelectedId(null)}
              onSelect={setSelectedId}
              onChanged={load}
            />
          </div>
        )}
      </div>
    </div>
  );
}
