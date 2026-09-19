/** Browser-side API for the papers library. Error handling is shared with api-client-v2. */
import { ApiError, apiRequest } from "@/lib/api-client-v2";

export type PaperStatus = "UNREAD" | "READING" | "READ";

export interface PaperView {
  id: number;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  language: string | null;
  status: PaperStatus;
  rating: number | null;
  notes: string | null;
  pageCount: number;
  hasFile: boolean;
  fileBytes: number | null;
  fileName: string | null;
  /** UPLOADED, EXTRACTING, CHUNKING, EMBEDDING, ANALYZING, LINKING, READY, NO_FILE, NEEDS_KEY, FAILED */
  stage: string;
  stageError: string | null;
  processing: boolean;
  tags: { id: number; name: string }[];
  collectionIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface PaperCollectionView { id: number; name: string; parentId: number | null; count: number }
export interface PaperTagView { id: number; name: string; count: number }
export interface PaperLibrary { papers: PaperView[]; collections: PaperCollectionView[]; tags: PaperTagView[] }

export interface PaperFilters { q?: string; status?: PaperStatus; collectionId?: number; tagId?: number; year?: number }

export function apiListPapers(filters: PaperFilters = {}): Promise<PaperLibrary> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  return apiRequest("GET", `/api/papers?${query}`);
}

export function apiGetPaper(id: number): Promise<{ paper: PaperView; outline: { title: string; page: number }[] }> {
  return apiRequest("GET", `/api/papers/${id}`);
}

export type PaperPatch = Partial<Pick<PaperView, "title" | "authors" | "year" | "venue" | "doi" | "arxivId" | "abstract" | "notes" | "status" | "rating">> & {
  /** Tag names; replaces the paper's tags. */
  tags?: string[];
  collectionIds?: number[];
};
export function apiUpdatePaper(id: number, patch: PaperPatch): Promise<{ paper: PaperView }> {
  return apiRequest("PATCH", `/api/papers/${id}`, { body: patch });
}

export async function apiDeletePaper(id: number) {
  await apiRequest("DELETE", `/api/papers/${id}`);
}

export const paperFileUrl = (id: number) => `/api/papers/${id}/file`;

/**
 * Uploads a PDF as the raw request body. XMLHttpRequest rather than fetch,
 * because only it reports upload progress.
 */
export function apiUploadPaper(
  file: File,
  options: { onProgress?: (fraction: number) => void; attachToPaperId?: number } = {},
): Promise<{ paper: PaperView; duplicate: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/papers/upload${options.attachToPaperId ? `?paperId=${options.attachToPaperId}` : ""}`);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => event.lengthComputable && options.onProgress?.(event.loaded / event.total);
    xhr.onerror = () => reject(new ApiError("无法连接服务器，请检查网络", 0));
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data?.paper) resolve(data);
      else reject(new ApiError(data?.error || (xhr.status >= 500 ? "服务暂时不可用，请稍后重试" : `上传失败 (${xhr.status})`), xhr.status));
    };
    xhr.send(file);
  });
}

export interface PaperLocator { page: number; scale: number | string; offsetRatio: number }
export function apiGetPaperProgress(id: number): Promise<{ locator: PaperLocator | null; updatedAt: string | null }> {
  return apiRequest("GET", `/api/papers/${id}/progress`);
}

export interface PaperAnnotationView {
  id: number;
  page: number;
  /** PDF points, origin top-left. */
  boxes: [number, number, number, number][];
  text: string;
  note: string | null;
  color: string;
  createdAt: string;
}
export function apiListPaperAnnotations(id: number): Promise<{ annotations: PaperAnnotationView[] }> {
  return apiRequest("GET", `/api/papers/${id}/annotations`);
}
export function apiAddPaperAnnotation(
  id: number,
  data: { page: number; boxes: number[][]; text: string; note?: string; color?: string },
): Promise<{ annotation: PaperAnnotationView }> {
  return apiRequest("POST", `/api/papers/${id}/annotations`, { body: data });
}
export async function apiDeletePaperAnnotation(id: number, annotationId: number) {
  await apiRequest("DELETE", `/api/papers/${id}/annotations?annotationId=${annotationId}`);
}

// --- AI reading and relations ---
export interface AnalysisItem { text: string; quote: string | null; chunkId: number | null; page: number | null; name?: string }
export interface PaperAnalysisData {
  researchQuestion: AnalysisItem | null;
  methods: AnalysisItem[];
  datasets: AnalysisItem[];
  findings: AnalysisItem[];
  limitations: AnalysisItem[];
  keywords: string[];
}
export type PaperLinkType = "SHARED_KEYWORD" | "SHARED_METHOD" | "SHARED_DATASET" | "SIMILAR" | "CITES" | "AGREES" | "CONTRADICTS" | "EXTENDS";
export interface LinkEvidence {
  nodes?: { id: number; name: string }[];
  similarity?: number;
  citing?: number;
  cited?: number;
  explanation?: string;
  /** paper id → the finding of that paper the relation rests on */
  findings?: Record<string, string>;
  note?: string;
}
export interface PaperLinkView {
  id: number;
  type: PaperLinkType;
  score: number;
  origin: "AUTO" | "LLM" | "USER";
  evidence: LinkEvidence;
  other: { id: number; title: string; year: number | null; authors: string[] };
}

export function apiGetPaperAnalysis(id: number): Promise<{ analysis: { data: PaperAnalysisData; model: string; createdAt: string } | null; links: PaperLinkView[] }> {
  return apiRequest("GET", `/api/papers/${id}/analysis`);
}
export function apiReanalyzePaper(id: number): Promise<{ job: { id: number } }> {
  return apiRequest("POST", `/api/papers/${id}/analysis`, { body: {} });
}

export interface PaperRelationGraph {
  papers: { id: number; title: string; year: number | null; authors: string[]; status: PaperStatus }[];
  links: { id: number; paperAId: number; paperBId: number; type: PaperLinkType; score: number; origin: string; evidence: LinkEvidence }[];
  collections: { id: number; name: string }[];
}
export function apiGetPaperRelations(collectionId?: number): Promise<PaperRelationGraph> {
  return apiRequest("GET", `/api/papers/links${collectionId ? `?collectionId=${collectionId}` : ""}`);
}
export async function apiDismissPaperLink(linkId: number) {
  await apiRequest("DELETE", `/api/papers/links/${linkId}`);
}
export function apiAddPaperLink(data: { paperAId: number; paperBId: number; type: PaperLinkType; note?: string }) {
  return apiRequest("POST", "/api/papers/links", { body: data });
}

// --- Import, export, collections ---
export interface ImportResult { created: number; createdIds: number[]; skipped: number; skippedTitles: string[]; note: string | null }
export function apiImportPapers(data: { bibtex: string } | { identifier: string }): Promise<ImportResult> {
  return apiRequest("POST", "/api/papers/import", { body: data });
}
export const paperExportUrl = (options: { collectionId?: number; ids?: number[] } = {}) => {
  const query = new URLSearchParams();
  if (options.collectionId) query.set("collectionId", String(options.collectionId));
  if (options.ids?.length) query.set("ids", options.ids.join(","));
  return `/api/papers/export?${query}`;
};
export function apiCreatePaperCollection(name: string): Promise<{ collection: PaperCollectionView }> {
  return apiRequest("POST", "/api/papers/collections", { body: { name } });
}
export async function apiDeletePaperCollection(id: number) {
  await apiRequest("DELETE", `/api/papers/collections?id=${id}`);
}

export const LINK_LABELS: Record<PaperLinkType, string> = {
  AGREES: "结论一致", CONTRADICTS: "结论相左", EXTENDS: "推进 / 延伸", CITES: "引用",
  SHARED_METHOD: "相同方法", SHARED_DATASET: "相同数据", SHARED_KEYWORD: "共同关键词", SIMILAR: "内容相近",
};

export const STAGE_LABELS: Record<string, string> = {
  UPLOADED: "等待处理",
  EXTRACTING: "提取文字",
  CHUNKING: "分段",
  EMBEDDING: "建立语义索引",
  ANALYZING: "AI 精读",
  LINKING: "寻找关联文献",
  READY: "已就绪",
  NO_FILE: "待补 PDF",
  NEEDS_KEY: "待配置 AI",
  FAILED: "处理失败",
};

export const STATUS_LABELS: Record<PaperStatus, string> = { UNREAD: "未读", READING: "在读", READ: "已读" };
