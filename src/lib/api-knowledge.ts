/**
 * Browser-side API for knowledge cards, the knowledge graph and background
 * jobs. Shares error handling (ApiError, session expiry) with api-client-v2.
 */
import { apiRequest } from "@/lib/api-client-v2";

// --- Knowledge cards ---
export interface PassageLocation { chapterId: string; charStart: number; charEnd: number }
export interface KnowledgeCardView {
  id: string;
  bookId: string | null;
  chapterId: string | null;
  chapterLabel: string | null;
  cardType: "concept" | "argument" | "evidence" | "example" | "question";
  title: string;
  content: string;
  quote: string | null;
  /** Present only when the quote was found in the book's text. */
  source: PassageLocation | null;
  tags: string[];
  difficulty: string;
  createdAt: string;
}

export function apiGetCards(bookId?: string): Promise<{ cards: KnowledgeCardView[] }> {
  return apiRequest("GET", bookId ? `/api/cards?bookId=${encodeURIComponent(bookId)}` : "/api/cards");
}
export function apiGenerateCards(chapterId: string): Promise<{ created: number; skipped: number; cards: KnowledgeCardView[] }> {
  return apiRequest("POST", "/api/cards/generate", { body: { chapterId: Number(chapterId) } });
}
export async function apiDeleteCard(id: string) {
  await apiRequest("DELETE", `/api/cards/${id}`);
}
export function apiImportCards(cards: unknown[]): Promise<{ imported: number; skipped: number }> {
  return apiRequest("POST", "/api/cards/import", { body: { cards } });
}

// --- Background jobs ---
export interface JobView {
  id: number;
  type: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  stage: string | null;
  progress: number;
  error: string | null;
}
export function apiGetJob(id: number): Promise<{ job: JobView }> {
  return apiRequest("GET", `/api/jobs/${id}`);
}

/** Polls a job until it finishes. Resolves with the final state; never rejects on FAILED. */
export async function waitForJob(id: number, onUpdate?: (job: JobView) => void, intervalMs = 2000): Promise<JobView> {
  for (;;) {
    const { job } = await apiGetJob(id);
    onUpdate?.(job);
    if (job.status === "DONE" || job.status === "FAILED") return job;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// --- Knowledge graph ---
export interface GraphNodeView {
  id: number; type: string; name: string; description: string | null; mentions: number; bookIds: number[];
  /** Set on the node that stands for a paper itself. */
  paperId?: number | null;
}
export interface GraphEdgeView { id: number; srcId: number; dstId: number; relation: string; weight: number }
export interface GraphView {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  books: { id: number; title: string }[];
  truncated: boolean;
  total: number;
}
export interface GraphMentionView {
  id: number;
  quote: string | null;
  verified: boolean;
  bookId: number | null;
  bookTitle: string | null;
  chapterId: number | null;
  chapterLabel: string | null;
  charStart: number | null;
  charEnd: number | null;
  /** Paper-graph mentions: the paper and the PDF page. */
  paperId?: number | null;
  paperTitle?: string | null;
  page?: number | null;
}
export interface GraphNodeDetail {
  id: number;
  type: string;
  name: string;
  description: string | null;
  aliases: string[];
  mentions: GraphMentionView[];
  relations: { edgeId: number; direction: "in" | "out"; relation: string; weight: number; other: { id: number; name: string; type: string } }[];
}

export function apiExtractGraph(chapterId: string): Promise<{ job: JobView }> {
  return apiRequest("POST", "/api/graph/extract", { body: { chapterId: Number(chapterId) } });
}
export function apiGetGraph(options: { scope?: "BOOK" | "PAPER"; bookId?: number } = {}): Promise<GraphView> {
  const query = new URLSearchParams();
  if (options.scope) query.set("scope", options.scope);
  if (options.bookId) query.set("bookId", String(options.bookId));
  return apiRequest("GET", `/api/graph?${query}`);
}
export function apiGetGraphNode(id: number): Promise<{ node: GraphNodeDetail }> {
  return apiRequest("GET", `/api/graph/nodes/${id}`);
}
export async function apiDeleteGraphNode(id: number) {
  await apiRequest("DELETE", `/api/graph/nodes/${id}`);
}
export function apiMergeGraphNodes(fromId: number, intoId: number): Promise<{ ok: true }> {
  return apiRequest("POST", "/api/graph/merge", { body: { fromId, intoId } });
}
