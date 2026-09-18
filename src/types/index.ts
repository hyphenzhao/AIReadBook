// ============================================================
// Core types for AIReadBook
// ============================================================

// --- Book & Reading ---
export type ReadingStatus = "not_started" | "reading" | "finished" | "paused";
export type AIProcessingStatus = "pending" | "processing" | "partial" | "complete" | "error";
/** 伴读 (open conversation) and 摘要 (summary first, then questions about this chapter). */
export type ChatMode = "companion" | "summary";

export interface Book {
  id: string;
  userId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  language: string;
  source: "upload" | "openlibrary" | "google_books";
  sourceId: string | null;
  filePath: string | null;
  fileSize: number | null;
  epubMetadata: Record<string, unknown> | null;
  totalChapters: number;
  ingestionStatus: AIProcessingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  index: number;
  title: string | null;
  rawText: string | null;
  plainText: string | null;
  wordCount: number | null;
  summaryShort: string | null;
  summaryMedium: string | null;
  summaryDetailed: string | null;
  summaryGeneratedAt: string | null;
}

export interface ReadingProgress {
  id: string;
  userId: string;
  bookId: string;
  chapterId: string | null;
  cfi: string;
  percentage: number;
  updatedAt: string;
}

// --- AI Chat ---
export interface ChatSession {
  id: string;
  userId: string;
  bookId: string;
  chapterId: string | null;
  mode: ChatMode;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  contextChunks: string[] | null;
  contextEntities: string[] | null;
  createdAt: string;
}

// --- Annotations ---
export interface Annotation {
  id: string;
  userId: string;
  bookId: string;
  chapterId: string | null;
  chunkId: string | null;
  cfi: string | null;
  selectedText: string;
  note: string | null;
  color: "yellow" | "green" | "blue" | "pink" | "orange";
  aiStructured: Record<string, unknown> | null;
  createdAt: string;
}

// --- Knowledge ---
export type CardType = "concept" | "argument" | "evidence" | "example" | "question";

export interface KnowledgeCard {
  id: string;
  bookId: string;
  chapterId: string | null;
  cardType: CardType;
  title: string;
  content: string;
  sourceChunks: string[] | null;
  tags: string[] | null;
  difficulty: "basic" | "intermediate" | "advanced" | null;
  createdAt: string;
}

export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
  cardId?: string;
  entityId?: string;
}

export interface MindMap {
  id: string;
  bookId: string;
  chapterId: string | null;
  title: string;
  data: MindMapNode;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCard {
  id: string;
  userId: string;
  bookId: string;
  sourceType: "annotation" | "knowledge_card" | "manual";
  sourceId: string | null;
  front: string;
  back: string;
  tags: string[] | null;
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: string;
  lastReview: string | null;
  createdAt: string;
}

// --- Knowledge Graph ---
export interface KGEntity {
  id: string;
  bookId: string;
  name: string;
  entityType: "character" | "concept" | "event" | "location" | "organization";
  description: string | null;
  metadata: Record<string, unknown> | null;
}

export interface KGRelation {
  id: string;
  bookId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  description: string | null;
  weight: number;
  sourceChunks: string[] | null;
}

// --- Book Recommendation ---
export interface BookRecommendation {
  id: string;
  userId: string;
  sourceBookId: string;
  recommendedTitle: string;
  recommendedAuthor: string | null;
  recommendedSourceId: string | null;
  reason: string | null;
  relevanceScore: number | null;
  status: "suggested" | "saved" | "dismissed";
  createdAt: string;
}

// --- API Types ---
export interface ChatRequest {
  bookId: string;
  chapterId?: string;
  sessionId?: string;
  mode: ChatMode;
  message: string;
  selectedText?: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface GenerateCardsRequest {
  bookId: string;
  chapterId?: string;
}

export interface GenerateMindMapRequest {
  bookId: string;
  chapterId?: string;
}

export interface GenerateReviewCardsRequest {
  bookId: string;
  sourceTypes?: ("annotation" | "knowledge_card")[];
}

export interface ExternalBookResult {
  title: string;
  author: string;
  coverUrl: string;
  source: "openlibrary" | "google_books";
  sourceId: string;
  description: string;
  publishYear: number;
}
